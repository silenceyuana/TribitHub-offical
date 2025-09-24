// =======================================================
// server.js - 最终、完整、未经省略的版本
// 新增: 在注册时收集并验证唯一的用户名
// =======================================================

// 1. 导入所有必需的模块
import express from 'express';
import bodyParser from 'body-parser';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

// 2. 初始化 Express 应用
const app = express();
const port = process.env.PORT || 3000;

// 3. 加载并验证所有需要的环境变量
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const siteUrl = process.env.SITE_URL;
const turnstileSecretKey = process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;

if (!supabaseUrl || !supabaseServiceKey || !resendApiKey || !turnstileSecretKey || !siteUrl) {
    console.error("错误：一个或多个关键环境变量缺失。请检查 Vercel 项目设置。");
}

// 4. 为 Supabase 创建内存存储 (修复 Vercel 上的 sqlite3 模块错误)
const memoryStore = {};
const InMemoryStorage = {
  getItem: (key) => memoryStore[key] || null,
  setItem: (key, value) => { memoryStore[key] = value; },
  removeItem: (key) => { delete memoryStore[key]; },
};

// 5. 配置 Supabase 和 Resend 客户端
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        storage: InMemoryStorage,
        persistSession: false,
        autoRefreshToken: false,
    }
});
const resend = new Resend(resendApiKey);

// 6. 设置 Express 中间件
app.use(bodyParser.json());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));


// =======================================================
// 8. API 路由定义
// =======================================================

// --- API: 发送注册验证码 ---
app.post('/api/send-code', async (req, res) => {
    try {
        const { email, 'cf-turnstile-response': turnstileToken } = req.body;
        if (!email || !turnstileToken) {
            return res.status(400).json({ error: '邮箱和人机验证为必填项' });
        }
        const turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v2/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret: turnstileSecretKey, response: turnstileToken }),
        });
        const turnstileData = await turnstileResponse.json();
        if (!turnstileData.success) {
            return res.status(403).json({ error: '人机验证失败，请刷新重试' });
        }
        const { data: { users } } = await supabase.auth.admin.listUsers({ maxResults: 1000 }); // Note: In production, consider more efficient ways to check for existing users if you have many.
        const userExists = users.some(user => user.email === email);
        if (userExists) {
            return res.status(400).json({ error: '该邮箱已被注册，请直接登录' });
        }
        const verificationCode = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        const { error: insertError } = await supabase.from('verification_codes').insert({ email, code: verificationCode, expires_at: expiresAt });
        if (insertError) throw insertError;
        await resend.emails.send({
            from: 'TribitHub <message@tribit.top>',
            to: [email],
            subject: `您的 TribitHub 注册验证码是 ${verificationCode}`,
            html: `<div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;"><h2>您的验证码</h2><p>请在注册页面输入以下验证码以完成注册：</p><p style="font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">${verificationCode}</p><p>此验证码将在15分钟后失效。</p></div>`,
        });
        res.status(200).json({ message: '验证码已成功发送至您的邮箱！' });
    } catch (error) {
        console.error('/api/send-code 接口错误:', error);
        res.status(500).json({ error: '发送验证码失败，请稍后重试' });
    }
});

// --- API: 用户注册 (包含用户名) ---
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, code, password, 'cf-turnstile-response': turnstileToken } = req.body;
        if (!username || !email || !code || !password || !turnstileToken) {
            return res.status(400).json({ error: '所有字段均为必填项' });
        }
        const { data: existingProfile } = await supabase.from('profiles').select('username').eq('username', username).single();
        if (existingProfile) {
            return res.status(400).json({ error: '该用户名已被使用，请换一个' });
        }
        const { data: codes, error: selectError } = await supabase.from('verification_codes').select('*').eq('email', email).order('expires_at', { ascending: false }).limit(1);
        if (selectError) throw selectError;
        const record = codes && codes[0];
        if (!record || record.code !== code || new Date() > new Date(record.expires_at)) {
            return res.status(400).json({ error: '验证码不正确或已过期' });
        }
        const { error: createError } = await supabase.auth.admin.createUser({
            email, password, email_confirm: true,
            user_metadata: { username: username }
        });
        if (createError) {
             if (createError.message.includes('already exists')) return res.status(400).json({ error: '该邮箱已被注册' });
            throw createError;
        }
        await supabase.from('verification_codes').delete().eq('id', record.id);
        res.status(200).json({ message: '恭喜您，注册成功！即将跳转到登录页面。' });
    } catch (error) {
        console.error('/api/register 接口错误:', error);
        res.status(500).json({ error: '注册失败，服务器内部错误' });
    }
});


// --- API: 用户密码登录 ---
app.post('/api/login/password', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: '邮箱和密码不能为空' });
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            if (error.message === 'Invalid login credentials') return res.status(401).json({ error: '邮箱或密码不正确' });
            if (error.message.includes('Email not confirmed')) return res.status(401).json({ error: '您的账号尚未激活' });
            return res.status(400).json({ error: error.message });
        }
        res.status(200).json({ message: '登录成功', session: data.session });
    } catch (error) {
        console.error('/api/login/password 接口错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// --- API: 管理员后台密码登录 (基于角色验证) ---
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: '邮箱和密码不能为空' });
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError || !authData.user) return res.status(401).json({ error: '邮箱或密码不正确' });
        const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', authData.user.id).single();
        if (profileError || !profile) return res.status(500).json({ error: '无法获取用户角色' });
        if (profile.role !== 'admin') return res.status(403).json({ error: '权限不足' });
        res.status(200).json({ message: '管理员登录成功', accessToken: authData.session.access_token });
    } catch (error) {
        console.error('/login 接口错误:', error);
        res.status(500).json({ error: '管理员登录失败' });
    }
});

// --- API: 管理员获取工单列表 (Token保护) ---
app.get('/api/tickets', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: '未提供认证令牌' });
        const token = authHeader.split(' ')[1];
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) return res.status(401).json({ error: '无效的令牌' });
        const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (profileError || profile.role !== 'admin') return res.status(403).json({ error: '权限不足' });
        const { data: tickets, error: ticketsError } = await supabase.from('tickets').select('*').order('submitted_at', { ascending: false });
        if (ticketsError) throw ticketsError;
        res.status(200).json({ tickets });
    } catch (error) {
        console.error('/api/tickets 接口错误:', error);
        res.status(500).json({ error: '获取工单数据失败' });
    }
});

// 9. 启动服务器 (仅在本地开发环境运行时执行)
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`✅ 服务器已在本地启动，正在监听 http://localhost:${port}`);
    });
}

// 10. 导出 Express app 实例，供 Vercel 的运行时环境使用
export default app;