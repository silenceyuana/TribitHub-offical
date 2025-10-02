// =======================================================
// server.js - 最终、完整、未经省略的修复版本
// 修正: Admin 后台获取 Wiki 文章列表的查询逻辑
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
import multer from 'multer';

// 2. 初始化 Express 应用
const app = express();
const port = process.env.PORT || 3000;

// 3. 加载并验证所有需要的环境变量
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const siteUrl = process.env.SITE_URL;

if (!supabaseUrl || !supabaseServiceKey || !resendApiKey || !siteUrl) {
    console.error("错误：一个或多个关键环境变量缺失。请检查 Vercel 项目设置。");
}

// 4. 为 Supabase 创建内存存储 (修复 Vercel 上的 sqlite3 模块错误)
const memoryStore = {};
const InMemoryStorage = {
  getItem: (key) => memoryStore[key] || null,
  setItem: (key, value) => { memoryStore[key] = value; },
  removeItem: (key) => { delete memoryStore[key]; },
};

// 5. 配置 Supabase 客户端
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { storage: InMemoryStorage, persistSession: false, autoRefreshToken: false }
});
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
const resend = new Resend(resendApiKey);
const upload = multer({ storage: multer.memoryStorage() });

// 6. 设置 Express 中间件
app.use(bodyParser.json());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));


// =======================================================
// 7. API 路由定义
// =======================================================

// --- 路由: /admin (由 vercel.json 处理，保留用于本地开发) ---
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// --- 用户认证与工单系统 API ---
app.post('/api/send-code', async (req, res) => {
    try {
        const { email, username } = req.body;
        if (!email || !username) return res.status(400).json({ error: '邮箱和用户名为必填项' });
        const { data: { users } } = await supabase.auth.admin.listUsers();
        if (users.some(user => user.email === email)) return res.status(400).json({ error: '该邮箱已被注册' });
        const verificationCode = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        await supabase.from('verification_codes').insert({ email, code: verificationCode, expires_at: expiresAt, type: 'signup' });
        await resend.emails.send({
            from: 'TribitHub <message@tribit.top>', to: [email], subject: `您的 TribitHub 注册验证码是 ${verificationCode}`,
            html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f0f2f5; padding: 20px;"><div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);"><div style="padding: 40px; text-align: left;"><h1 style="font-size: 28px; font-weight: 700; color: #111; margin: 0 0 20px;">TribitHub</h1><p style="font-size: 18px; color: #333; margin: 0 0 10px;">${username || '你好'},</p><p style="font-size: 16px; color: #555; line-height: 1.6;">看起来您正在尝试创建一个新的 TribitHub 账户。这是完成您注册所需的验证码：</p><div style="background-color: #1d2026; color: #ffffff; border-radius: 6px; margin: 30px auto; padding: 20px; text-align: center;"><p style="font-size: 14px; margin: 0 0 10px; color: #8b949e;">您的验证码是</p><p style="font-size: 42px; font-weight: 700; letter-spacing: 10px; margin: 0; line-height: 1;">${verificationCode}</p></div><h3 style="font-size: 20px; font-weight: 600; color: #111; margin-top: 40px; border-top: 1px solid #e0e0e0; padding-top: 30px;">这不是您？</h3><p style="font-size: 14px; color: #555; line-height: 1.6;">如果您没有尝试创建此账户，可以安全地忽略此邮件。为安全起见，请勿与任何人分享此验证码。</p></div></div></div>`,
        });
        res.status(200).json({ message: '验证码已成功发送至您的邮箱！' });
    } catch (error) {
        console.error('/api/send-code 接口错误:', error);
        res.status(500).json({ error: '发送验证码失败' });
    }
});
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, code, password } = req.body;
        if (!username || !email || !code || !password) return res.status(400).json({ error: '所有字段均为必填项' });
        const { data: codes, error: selectError } = await supabase.from('verification_codes').select('*').eq('email', email).eq('type', 'signup').order('expires_at', { ascending: false }).limit(1);
        if (selectError) throw selectError;
        const record = codes && codes[0];
        if (!record || record.code !== code || new Date() > new Date(record.expires_at)) return res.status(400).json({ error: '验证码无效或已过期' });
        await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username: username } });
        await supabase.from('verification_codes').delete().eq('id', record.id);
        res.status(200).json({ message: '注册成功！' });
    } catch (error) {
        console.error('/api/register 接口错误:', error);
        res.status(500).json({ error: '注册失败' });
    }
});
app.post('/api/password/send-reset-code', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: '邮箱不能为空' });
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const existingUser = users.find(user => user.email === email);
        if (existingUser) {
            const username = existingUser.user_metadata.username || '用户';
            const verificationCode = crypto.randomInt(100000, 999999).toString();
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
            await supabase.from('verification_codes').insert({ email, code: verificationCode, expires_at: expiresAt, type: 'password_reset' });
            await resend.emails.send({
                from: 'TribitHub 安全中心 <message@tribit.top>', to: [email], subject: `您的 TribitHub 密码重置验证码是 ${verificationCode}`,
                html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f0f2f5; padding: 20px;"><div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);"><div style="padding: 40px; text-align: left;"><h1 style="font-size: 28px; font-weight: 700; color: #111; margin: 0 0 20px;">TribitHub</h1><p style="font-size: 18px; color: #333; margin: 0 0 10px;">${username},</p><p style="font-size: 16px; color: #555; line-height: 1.6;">我们收到了一个重置您账户密码的请求。如果您发起了此请求，请使用以下验证码来完成操作：</p><div style="background-color: #1d2026; color: #ffffff; border-radius: 6px; margin: 30px auto; padding: 20px; text-align: center;"><p style="font-size: 14px; margin: 0 0 10px; color: #8b949e;">您的密码重置验证码是</p><p style="font-size: 42px; font-weight: 700; letter-spacing: 10px; margin: 0; line-height: 1;">${verificationCode}</p></div><h3 style="font-size: 20px; font-weight: 600; color: #111; margin-top: 40px; border-top: 1px solid #e0e0e0; padding-top: 30px;">不是您？</h3><p style="font-size: 14px; color: #555; line-height: 1.6;">如果您没有请求重置密码，请立即忽略并删除此邮件，您的账户依然安全。</p></div></div></div>`,
            });
        }
        res.status(200).json({ message: '如果您的邮箱已注册，您将会收到一封包含验证码的邮件。' });
    } catch (error) {
        console.error('/api/password/send-reset-code 接口错误:', error);
        res.status(500).json({ error: '发送验证码失败' });
    }
});
app.post('/api/password/reset', async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        if (!email || !code || !newPassword) return res.status(400).json({ error: '所有字段均为必填项' });
        const { data: codes, error: selectError } = await supabase.from('verification_codes').select('*').eq('email', email).eq('type', 'password_reset').order('expires_at', { ascending: false }).limit(1);
        if (selectError) throw selectError;
        const record = codes && codes[0];
        if (!record || record.code !== code || new Date() > new Date(record.expires_at)) return res.status(400).json({ error: '验证码无效或已过期' });
        await supabase.auth.admin.updateUserByEmail(email, { password: newPassword });
        await supabase.from('verification_codes').delete().eq('id', record.id);
        res.status(200).json({ message: '密码重置成功！您现在可以使用新密码登录了。' });
    } catch (error) {
        console.error('/api/password/reset 接口错误:', error);
        res.status(500).json({ error: '密码重置失败' });
    }
});
app.post('/api/login/password', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: '邮箱和密码不能为空' });
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) return res.status(401).json({ error: '邮箱或密码不正确' });
        res.status(200).json({ message: '登录成功', session: data.session });
    } catch (error) {
        console.error('/api/login/password 接口错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: '邮箱和密码不能为空' });
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError || !authData.user) return res.status(401).json({ error: '邮箱或密码不正确' });
        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', authData.user.id).single();
        if (!profile) return res.status(500).json({ error: '无法获取用户角色信息' });
        if (profile.role !== 'admin') return res.status(403).json({ error: '权限不足' });
        res.status(200).json({ message: '管理员登录成功', accessToken: authData.session.access_token });
    } catch (error) {
        console.error('/login 接口错误:', error);
        res.status(500).json({ error: '管理员登录失败' });
    }
});
app.post('/api/tickets', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: '未提供认证令牌' });
        const token = authHeader.split(' ')[1];
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) return res.status(401).json({ error: '无效的令牌' });
        const { subject, message } = req.body;
        if (!subject || !message) return res.status(400).json({ error: '主题和内容不能为空' });
        const { data: newTicket } = await supabase.from('tickets').insert({ subject, message, user_id: user.id }).select().single();
        await resend.emails.send({
            from: 'TribitHub 支持 <message@tribit.top>', to: [user.email], subject: `您的工单 #${newTicket.id} 已收到`,
            html: `<p>你好 ${user.user_metadata.username || ''}, 您的工单已提交成功。</p>`,
        });
        res.status(200).json({ message: '工单提交成功！', ticket: newTicket });
    } catch (error) {
        console.error('提交工单时发生错误 /api/tickets[POST]:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});
app.get('/api/tickets', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: '未提供认证令牌' });
        const token = authHeader.split(' ')[1];
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) return res.status(401).json({ error: '无效的令牌' });
        const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
        if (!profile || profile.role !== 'admin') return res.status(403).json({ error: '权限不足' });
        const { data: tickets } = await supabaseAdmin.from('tickets').select('*, user_id').order('submitted_at', { ascending: false });
        if (!tickets || tickets.length === 0) return res.status(200).json({ tickets: [] });
        const userIds = [...new Set(tickets.map(t => t.user_id).filter(id => id))];
        if (userIds.length === 0) return res.status(200).json({ tickets: tickets.map(t => ({ ...t, name: '匿名用户', email: 'N/A' })) });
        const { data: profiles } = await supabaseAdmin.from('profiles').select('id, username').in('id', userIds);
        const { data: users } = await supabaseAdmin.auth.admin.listUsers();
        const userInfoMap = new Map();
        users.users.filter(u => userIds.includes(u.id)).forEach(u => {
            const p = profiles.find(pr => pr.id === u.id);
            userInfoMap.set(u.id, { username: p?.username || '未知用户', email: u.email });
        });
        const ticketsWithUserInfo = tickets.map(ticket => {
            const info = userInfoMap.get(ticket.user_id);
            return { ...ticket, name: info?.username || '匿名用户', email: info?.email || 'N/A' };
        });
        res.status(200).json({ tickets: ticketsWithUserInfo });
    } catch (error) {
        console.error('/api/tickets[GET] 接口错误:', error);
        res.status(500).json({ error: '获取工单数据失败' });
    }
});

// --- WIKI Public APIs ---
app.get('/api/wiki/content', async (req, res) => {
    try {
        const { data, error } = await supabase.from('wiki_categories').select('name, wiki_articles(title, slug)').order('name', { ascending: true });
        if (error) throw error;
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: '获取 Wiki 内容失败' });
    }
});
app.get('/api/wiki/article/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const { data, error } = await supabase.from('wiki_articles').select('title, content, updated_at, category:wiki_categories(name)').eq('slug', slug).single();
        if (error || !data) throw new Error('文章未找到');
        res.status(200).json(data);
    } catch (error) {
        res.status(404).json({ error: error.message });
    }
});

// --- WIKI Admin APIs ---
const isAdmin = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: '未提供认证令牌' });
    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: '无效的令牌' });
    const { data: profile } = await supabaseAdmin.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin') return res.status(403).json({ error: '权限不足' });
    req.user = user;
    next();
};

app.get('/api/admin/wiki/categories', isAdmin, async (req, res) => {
    const { data, error } = await supabase.from('wiki_categories').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.status(200).json(data);
});

app.post('/api/admin/wiki/categories', isAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: '分类名称不能为空' });
    const { data, error } = await supabase.from('wiki_categories').insert({ name }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
});

app.delete('/api/admin/wiki/categories/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('wiki_categories').delete().eq('id', id);
    if (error) return res.status(500).json({ error: '删除失败: ' + error.message });
    res.status(204).send();
});

app.get('/api/admin/wiki/articles', isAdmin, async (req, res) => {
    try {
        const { data: articles, error: articlesError } = await supabase.from('wiki_articles').select('id, title, slug, category_id');
        if (articlesError) throw articlesError;
        if (!articles || articles.length === 0) return res.status(200).json([]);
        const categoryIds = [...new Set(articles.map(a => a.category_id).filter(id => id))];
        let categoryMap = new Map();
        if (categoryIds.length > 0) {
            const { data: categories, error: categoriesError } = await supabase.from('wiki_categories').select('id, name').in('id', categoryIds);
            if (categoriesError) throw categoriesError;
            categoryMap = new Map(categories.map(cat => [cat.id, cat.name]));
        }
        const articlesWithCategory = articles.map(article => ({
            id: article.id, title: article.title, slug: article.slug,
            category: { name: categoryMap.get(article.category_id) || null }
        }));
        res.status(200).json(articlesWithCategory);
    } catch (error) {
        console.error('Admin GET /api/admin/wiki/articles error:', error);
        res.status(500).json({ error: '获取文章列表失败' });
    }
});

app.post('/api/admin/wiki/articles', isAdmin, async (req, res) => {
    const { title, slug, content, category_id } = req.body;
    if (!title || !slug) return res.status(400).json({ error: '标题和 Slug 不能为空' });
    const { data, error } = await supabase.from('wiki_articles').insert({ title, slug, content, category_id: category_id || null }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
});

app.get('/api/admin/wiki/articles/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabase.from('wiki_articles').select('*').eq('id', id).single();
    if (error) return res.status(404).json({ error: '文章未找到' });
    res.status(200).json(data);
});

app.put('/api/admin/wiki/articles/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { title, slug, content, category_id } = req.body;
    if (!title || !slug) return res.status(400).json({ error: '标题和 Slug 不能为空' });
    const { data, error } = await supabase.from('wiki_articles').update({ title, slug, content, category_id: category_id || null, updated_at: new Date() }).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(200).json(data);
});

app.post('/api/admin/wiki/upload-image', isAdmin, upload.single('wiki_image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '未找到上传的图片文件' });
        const file = req.file;
        const fileExt = path.extname(file.originalname);
        const fileName = `${crypto.randomBytes(16).toString('hex')}${fileExt}`;
        const { error } = await supabase.storage.from('wiki-images').upload(fileName, file.buffer, { contentType: file.mimetype });
        if (error) throw error;
        const { data } = supabase.storage.from('wiki-images').getPublicUrl(fileName);
        res.status(200).json({ imageUrl: data.publicUrl });
    } catch (error) {
        console.error('Image upload error:', error);
        res.status(500).json({ error: '图片上传失败: ' + error.message });
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