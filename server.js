// server.js - 完整版

// 1. 导入所需模块
import express from 'express';
import bodyParser from 'body-parser';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import 'dotenv/config'; // 自动加载 .env 文件中的环境变量

// 2. 初始化 Express 应用
const app = express();
const port = process.env.PORT || 3000;

// 3. 加载并验证环境变量
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const siteUrl = process.env.SITE_URL || `http://localhost:${port}`;

if (!supabaseUrl || !supabaseServiceKey || !resendApiKey) {
    console.error("错误：关键环境变量缺失。请确保 VITE_SUPABASE_URL, SUPABASE_SERVICE_KEY, 和 RESEND_API_KEY 已在 Vercel 环境变量中设置。");
    // 在 Vercel 上，我们不直接退出，而是让它在日志中显示错误
}

// 4. 【关键修复】为 Supabase 创建一个内存存储方案
//    这会覆盖 Supabase 客户端默认的、试图在只读文件系统上使用 sqlite3 的行为。
const memoryStore = {};
const InMemoryStorage = {
  getItem: (key) => memoryStore[key] || null,
  setItem: (key, value) => {
    memoryStore[key] = value;
  },
  removeItem: (key) => {
    delete memoryStore[key];
  },
};

// 5. 配置 Supabase 和 Resend 客户端
//    使用上面的【关键修复】来初始化 Supabase
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        // 明确告诉 Supabase 使用我们提供的内存存储
        storage: InMemoryStorage,
        // 在无服务器环境中，我们不希望客户端在请求之间持久化会话
        persistSession: false,
        // 自动刷新 token 在长连接场景中有用，在我们的 API 场景中可以关闭
        autoRefreshToken: false,
    }
});

const resend = new Resend(resendApiKey);

// 6. 设置 Express 中间件
//    用于解析 POST 请求中的 JSON 数据
app.use(bodyParser.json());
//    用于托管 public 文件夹下的所有静态文件 (html, css, js, images)
app.use(express.static('public'));

// =======================================================
// 7. API 路由定义
// =======================================================

// --- 用户魔术链接登录 API ---
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

        if (otpError) throw otpError;

        const magicLink = data.properties.action_link;
        if (!magicLink) {
             return res.status(500).json({ error: '无法生成登录链接' });
        }

        console.log(`成功为 ${email} 生成登录链接，准备发送邮件...`);

        // 使用 Resend 发送邮件
        await resend.emails.send({
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

        console.log(`邮件已成功发送至 ${email}`);
        res.status(200).json({ message: '登录链接已发送，请检查您的邮箱。' });

    } catch (error) {
        console.error('处理 /api/auth 请求时发生错误:', error.message);
        res.status(500).json({ error: '发送邮件时发生内部错误。', details: error.message });
    }
});

// --- 管理员密码登录 API (占位符) ---
app.post('/login', async (req, res) => {
    // 这是一个简化的示例。在真实项目中，密码应该被哈希存储和比对。
    const { email, password } = req.body;
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
        // 登录成功, 实际项目中应返回一个 JWT Token 用于后续请求认证
        res.status(200).json({ message: '登录成功' }); 
    } else {
        res.status(401).send('邮箱或密码不正确');
    }
});

// --- 管理员获取工单列表 API ---
app.get('/api/tickets', async (req, res) => {
    // 在真实应用中，这里需要有一个中间件来验证管理员的 Token
    
    console.log("收到获取工单列表的请求...");
    const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('submitted_at', { ascending: false }); // V2 Supabase 中 `created_at` 可能是 `submitted_at`

    if (error) {
        console.error("获取工单失败:", error.message);
        return res.status(500).json({ error: error.message });
    }
    
    console.log(`成功获取 ${data.length} 条工单。`);
    res.status(200).json({ tickets: data });
});


// 8. 启动服务器 (在本地开发时使用)
//    Vercel 会忽略这部分，并使用自己的方式来运行文件
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`服务器已启动，正在本地监听 http://localhost:${port}`);
    });
}

// 9. 导出 app 供 Vercel 使用
export default app;