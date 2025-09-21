// server.js

// 1. 导入所需模块
import express from 'express';
import bodyParser from 'body-parser'; // 虽然新版 Express 内置，但 package.json 里有，保持一致
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import 'dotenv/config'; // 自动加载 .env 文件中的环境变量

// 2. 初始化 Express 应用
const app = express();
const port = process.env.PORT || 3000;

// 3. 配置 Supabase 和 Resend 客户端
//    注意：在服务器端，我们使用 service_key，因为它拥有执行管理操作的权限。
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const siteUrl = process.env.SITE_URL || `http://localhost:${port}`;

if (!supabaseUrl || !supabaseServiceKey || !resendApiKey) {
    console.error("错误：关键环境变量缺失。请检查你的 .env 文件。");
    process.exit(1); // 缺少关键配置，退出程序
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const resend = new Resend(resendApiKey);

// 4. 设置 Express 中间件
//    用于解析 POST 请求中的 JSON 数据
app.use(bodyParser.json());
//    用于托管 public 文件夹下的所有静态文件 (html, css, js, images)
app.use(express.static('public'));

// 5. 创建 API 路由
//    这是从原 api/auth.js 集成过来的逻辑
app.post('/api/auth', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        console.log(`收到登录请求，邮箱: ${email}`);

        // 使用 Supabase Admin 客户端生成一个一次性的登录链接 (OTP)
        const { data, error: otpError } = await supabase.auth.signInWithOtp({
            email: email,
            options: {
                // 用户点击链接后跳转到哪里。这里我们假设有一个 dashboard.html
                emailRedirectTo: `${siteUrl}/dashboard.html` 
            }
        });

        if (otpError) {
            throw otpError;
        }

        // Supabase v2.38+ 在 data.properties 中返回链接
        const magicLink = data.properties.action_link;

        if (!magicLink) {
             return res.status(500).json({ error: '无法生成登录链接' });
        }

        console.log(`成功为 ${email} 生成登录链接，准备发送邮件...`);

        // 使用 Resend 发送包含这个链接的邮件
        const { data: emailData, error: emailError } = await resend.emails.send({
            from: 'TribitHub <message@tribit.top>', // 确保这是你在 Resend 验证过的发件邮箱
            to: [email],
            subject: '您的 TribitHub 登录链接',
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                    <h2>欢迎登录 TribitHub</h2>
                    <p>请点击下面的按钮以安全登录。该链接将在 15 分钟后失效。</p>
                    <a href="${magicLink}" 
                       style="display: inline-block; padding: 12px 24px; font-size: 16px; color: white; background-color: #007bff; text-decoration: none; border-radius: 5px;">
                       安全登录
                    </a>
                    <p>如果您没有请求登录，请忽略此邮件。</p>
                </div>
            `,
        });

        if (emailError) {
            throw emailError;
        }

        console.log(`邮件已成功发送至 ${email}`);
        
        // 向前端返回成功消息
        res.status(200).json({ message: '登录链接已发送，请检查您的邮箱。' });

    } catch (error) {
        console.error('处理 /api/auth 请求时发生错误:', error);
        res.status(500).json({ error: '发送邮件时发生内部错误。', details: error.message });
    }
});


// (可选) 为管理员后台创建获取工单的 API
app.post('/login', async (req, res) => {
    // 这里需要你自己实现管理员账号密码验证逻辑
    // 例如，从数据库或环境变量中验证
    const { email, password } = req.body;
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        // 登录成功，可以设置 session 或 token
        // 为简化，我们这里只返回一个成功状态
        res.status(200).json({ message: '登录成功' }); // 实际项目中应返回 token
    } else {
        res.status(401).send('认证失败');
    }
});

app.get('/api/tickets', async (req, res) => {
    // 在实际应用中，这里需要验证管理员身份 (比如检查 token)
    
    const { data, error } = await supabase.from('tickets').select('*').order('submitted_at', { ascending: false });

    if (error) {
        return res.status(500).json({ error: error.message });
    }
    res.status(200).json({ tickets: data });
});


// 6. 启动服务器
app.listen(port, () => {
    console.log(`服务器已启动，正在监听 http://localhost:${port}`);
});