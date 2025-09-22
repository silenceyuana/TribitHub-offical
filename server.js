// =======================================================
// server.js - 最终、完整、未经省略的版本
// 新增: 优化了注册验证邮件的 HTML 样式
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

// --- API: 用户注册 (发送精美样式的6位数验证码邮件) ---
app.post('/api/register', async (req, res) => {
    try {
        const { email, password, 'cf-turnstile-response': turnstileToken } = req.body;
        if (!email || !password || !turnstileToken) {
            return res.status(400).json({ error: '缺少必要信息' });
        }
        const turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v2/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret: turnstileSecretKey, response: turnstileToken }),
        });
        const turnstileData = await turnstileResponse.json();
        if (!turnstileData.success) {
            return res.status(403).json({ error: '人机验证失败' });
        }
        const { error: createError } = await supabase.auth.admin.createUser({
            email, password, email_confirm: false
        });
        if (createError) {
            if (createError.message.includes('already exists')) return res.status(400).json({ error: '该邮箱已被注册' });
            throw createError;
        }
        const verificationCode = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        const { error: insertError } = await supabase.from('verification_codes').insert({ email, code: verificationCode, expires_at: expiresAt });
        if (insertError) throw insertError;

        // --- 【邮件样式升级】使用专业的 HTML 模板 ---
        await resend.emails.send({
            from: 'TribitHub <message@tribit.top>',
            to: [email],
            subject: `您的 TribitHub 验证码是 ${verificationCode}`,
            html: `
            <div style="font-family: Arial, 'Helvetica Neue', Helvetica, sans-serif; box-sizing: border-box; background-color: #f9f9f9; width: 100%; padding: 20px;">
              <div style="box-sizing: border-box; max-width: 600px; margin: 40px auto; padding: 40px; background-color: #ffffff; border: 1px solid #e9e9e9; border-radius: 5px;">
                <div style="text-align: center; margin-bottom: 20px;">
                  <h1 style="font-size: 24px; font-weight: bold; color: #333; margin: 0;">TribitHub</h1>
                </div>
                <h2 style="font-size: 20px; color: #333; text-align: center;">验证您的电子邮箱</h2>
                <p style="font-size: 16px; color: #555;">你好 ${email},</p>
                <p style="font-size: 16px; color: #555;">我们收到了您的注册请求。要完成验证过程，请在原始窗口中输入这 6 位代码：</p>
                <div style="text-align: center; margin: 30px 0;">
                  <div style="background-color: #f0f0f0; border-radius: 5px; display: inline-block; padding: 15px 25px;">
                    <span style="font-size: 36px; font-weight: bold; letter-spacing: 10px; color: #333; line-height: 1;">${verificationCode}</span>
                  </div>
                </div>
                <p style="font-size: 14px; color: #888;">此验证码将在 15 分钟后失效。</p>
                <hr style="border: none; border-top: 1px solid #eaeaea; margin: 26px 0;">
                <p style="font-size: 12px; color: #888;">如果您未尝试注册，请忽略此邮件。请勿与任何人分享此验证码。</p>
              </div>
            </div>
            `,
        });

        res.status(200).json({ message: '注册请求成功，请查收验证码邮件。' });
    } catch (error) {
        console.error('/api/register 接口错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// --- API: 验证邮箱验证码 ---
app.post('/api/verify-code', async (req, res) => {
    try {
        const { email, code } = req.body;
        if (!email || !code) return res.status(400).json({ error: '邮箱和验证码不能为空' });
        const { data: codes, error: selectError } = await supabase.from('verification_codes').select('*').eq('email', email).order('expires_at', { ascending: false }).limit(1);
        if (selectError) throw selectError;
        const record = codes && codes[0];
        if (!record || record.code !== code || new Date() > new Date(record.expires_at)) {
            return res.status(400).json({ error: '验证码无效或已过期' });
        }
        const { error: userError } = await supabase.auth.admin.updateUserByEmail(email, { email_confirm: true });
        if (userError) throw userError;
        await supabase.from('verification_codes').delete().eq('id', record.id);
        res.status(200).json({ message: '邮箱验证成功！' });
    } catch (error) {
        console.error('/api/verify-code 接口错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
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
            if (error.message.includes('Email not confirmed')) return res.status(401).json({ error: '请先激活您的账号' });
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

// --- API: 用户无密码登录 (魔术链接) - (保留作为备用) ---
app.post('/api/auth', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });
        const { data, error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${siteUrl}/dashboard.html` } });
        if (error) throw error;
        const magicLink = data.properties.action_link;
        if (!magicLink) return res.status(500).json({ error: '无法生成登录链接' });
        await resend.emails.send({
            from: 'TribitHub <message@tribit.top>', to: [email], subject: '您的 TribitHub 登录链接',
            html: `<p>点击此链接登录: <a href="${magicLink}">安全登录</a></p>`,
        });
        res.status(200).json({ message: '登录链接已发送' });
    } catch (error) {
        console.error('/api/auth 接口错误:', error);
        res.status(500).json({ error: '发送邮件时发生内部错误' });
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