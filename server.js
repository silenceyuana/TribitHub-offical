// server.js - 最终完整版

// 1. 导入所需模块
import express from 'express';
import bodyParser from 'body-parser';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

// 2. 初始化 Express 应用
const app = express();
const port = process.env.PORT || 3000;

// 3. 加载并验证环境变量
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const siteUrl = process.env.SITE_URL || `http://localhost:${port}`;

if (!supabaseUrl || !supabaseServiceKey || !resendApiKey) {
    console.error("错误：关键环境变量缺失。");
}

// 4. 为 Supabase 创建内存存储 (修复 sqlite3 问题)
const memoryStore = {};
const InMemoryStorage = {
  getItem: (key) => memoryStore[key] || null,
  setItem: (key, value) => { memoryStore[key] = value; },
  removeItem: (key) => { delete memoryStore[key]; },
};

// 5. 配置客户端
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

// --- 【路径修复】使用绝对路径来托管静态文件 ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));


// 7. API 路由定义
app.post('/api/auth', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email is required' });

        const { data, error } = await supabase.auth.signInWithOtp({
            email: email,
            options: { emailRedirectTo: `${siteUrl}/dashboard.html` }
        });

        if (error) throw error;
        const magicLink = data.properties.action_link;
        if (!magicLink) return res.status(500).json({ error: '无法生成登录链接' });

        await resend.emails.send({
            from: 'TribitHub <message@tribit.top>',
            to: [email],
            subject: '您的 TribitHub 登录链接',
            html: `<p>点击链接登录: <a href="${magicLink}">登录</a></p>`,
        });

        res.status(200).json({ message: '登录链接已发送，请检查您的邮箱。' });
    } catch (error) {
        console.error('/api/auth error:', error.message);
        res.status(500).json({ error: '内部错误', details: error.message });
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        res.status(200).json({ message: '登录成功' });
    } else {
        res.status(401).send('认证失败');
    }
});

app.get('/api/tickets', async (req, res) => {
    const { data, error } = await supabase.from('tickets').select('*').order('submitted_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.status(200).json({ tickets: data });
});

// 8. 启动服务器 (本地开发时使用)
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => console.log(`服务器本地运行于 http://localhost:${port}`));
}

// 9. 导出 app 供 Vercel 使用
export default app;