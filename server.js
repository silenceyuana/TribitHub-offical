// =======================================================
// server.js - Final Version with Custom S3 Image Upload
// This version includes all features and uses a custom S3-compatible service.
// =======================================================

import express from 'express';
import bodyParser from 'body-parser';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import multer from 'multer';
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const app = express();
const port = process.env.PORT || 3000;

// --- Environment Variables Validation ---
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const siteUrl = process.env.SITE_URL;
const s3Endpoint = process.env.S3_ENDPOINT;
const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID;
const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
const s3BucketName = process.env.S3_BUCKET_NAME;
const s3Region = 'us-east-1'; // Placeholder region for S3-compatible services

if (!supabaseUrl || !supabaseServiceKey || !resendApiKey || !siteUrl || !s3Endpoint || !s3AccessKeyId || !s3SecretAccessKey || !s3BucketName) {
    console.error("错误：一个或多个关键环境变量缺失。请检查 Vercel 项目设置。");
}

// --- Client Initializations ---
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
const resend = new Resend(resendApiKey);
const s3Client = new S3Client({
    endpoint: s3Endpoint,
    region: s3Region,
    credentials: {
        accessKeyId: s3AccessKeyId,
        secretAccessKey: s3SecretAccessKey,
    },
    forcePathStyle: true, // Crucial for most S3-compatible services
});

const upload = multer({ storage: multer.memoryStorage() });

// --- Middleware ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

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


// =======================================================
// API Routes
// =======================================================

// --- User Authentication & Management ---
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
            html: `<p>你好, 这是您的验证码: <strong>${verificationCode}</strong></p>`,
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
            const verificationCode = crypto.randomInt(100000, 999999).toString();
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
            await supabase.from('verification_codes').insert({ email, code: verificationCode, expires_at: expiresAt, type: 'password_reset' });
            await resend.emails.send({
                from: 'TribitHub 安全中心 <message@tribit.top>', to: [email], subject: `您的密码重置验证码是 ${verificationCode}`,
                html: `<p>你好, 这是您的密码重置验证码: <strong>${verificationCode}</strong></p>`,
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
        if (!profile || profile.role !== 'admin') return res.status(403).json({ error: '权限不足' });
        res.status(200).json({ message: '管理员登录成功', accessToken: authData.session.access_token });
    } catch (error) {
        console.error('/login 接口错误:', error);
        res.status(500).json({ error: '管理员登录失败' });
    }
});


// --- Tickets System ---
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

app.get('/api/tickets', isAdmin, async (req, res) => {
    try {
        const { data: tickets } = await supabaseAdmin.from('tickets').select('*, user_id').order('submitted_at', { ascending: false });
        if (!tickets || tickets.length === 0) return res.status(200).json([]);
        const userIds = [...new Set(tickets.map(t => t.user_id).filter(id => id))];
        if (userIds.length === 0) return res.status(200).json(tickets.map(t => ({ ...t, name: '匿名用户', email: 'N/A' })));
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
        res.status(200).json(ticketsWithUserInfo);
    } catch (error) {
        console.error('/api/tickets[GET] 接口错误:', error);
        res.status(500).json({ error: '获取工单数据失败' });
    }
});


// --- WIKI Public APIs ---
app.get('/api/wiki/list', async (req, res) => {
    try {
        const { data, error } = await supabase.from('wiki_categories').select('name, wiki_articles(title, slug)').order('name', { ascending: true });
        if (error) throw error;
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: '获取 Wiki 列表失败' });
    }
});

app.get('/api/wiki/article/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const { data, error } = await supabase.from('wiki_articles').select('title, content, updated_at, category:wiki_categories(name)').eq('slug', slug).single();
        if (error || !data) return res.status(404).json({ error: '文章未找到' });
        res.status(200).json(data);
    } catch (error) {
        res.status(404).json({ error: error.message });
    }
});


// --- WIKI Admin APIs ---
app.get('/api/admin/wiki/categories', isAdmin, async (req, res) => {
    const { data, error } = await supabaseAdmin.from('wiki_categories').select('id, name');
    if (error) return res.status(500).json({ error: error.message });
    res.status(200).json(data);
});

app.post('/api/admin/wiki/categories', isAdmin, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: '分类名称不能为空' });
    const { data, error } = await supabaseAdmin.from('wiki_categories').insert({ name }).select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
});

app.delete('/api/admin/wiki/categories/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { error } = await supabaseAdmin.from('wiki_categories').delete().eq('id', id);
    if (error) return res.status(500).json({ error: '删除失败: ' + error.message });
    res.status(204).send();
});

app.get('/api/admin/wiki/articles', isAdmin, async (req, res) => {
    try {
        const { data: articles, error: articlesError } = await supabaseAdmin.from('wiki_articles').select('id, title, slug, category_id');
        if (articlesError) throw articlesError;
        if (!articles || articles.length === 0) return res.status(200).json([]);
        const categoryIds = [...new Set(articles.map(a => a.category_id).filter(id => id))];
        let categoryMap = new Map();
        if (categoryIds.length > 0) {
            const { data: categories, error: categoriesError } = await supabaseAdmin.from('wiki_categories').select('id, name').in('id', categoryIds);
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

app.get('/api/admin/wiki/articles/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { data, error } = await supabaseAdmin.from('wiki_articles').select('*').eq('id', id).single();
    if (error) return res.status(404).json({ error: '文章未找到' });
    res.status(200).json(data);
});

app.post('/api/admin/wiki/articles', isAdmin, async (req, res) => {
    const { title, slug, content, category_id, chapters } = req.body;
    if (!title || !slug) return res.status(400).json({ error: '标题和 Slug 不能为空' });

    let finalContent = content || '';
    if (chapters) {
        const chapterTitles = chapters.split('\n').filter(line => line.trim() !== '');
        const chaptersMarkdown = chapterTitles.map(chap => `## ${chap}`).join('\n\n');
        finalContent = chaptersMarkdown + '\n\n' + finalContent;
    }
    
    const { data, error } = await supabaseAdmin.from('wiki_articles').insert({ 
        title, slug, content: finalContent, category_id: category_id || null, chapters: chapters || null
    }).select().single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
});

app.put('/api/admin/wiki/articles/:id', isAdmin, async (req, res) => {
    const { id } = req.params;
    const { title, slug, content, category_id, chapters } = req.body;
    if (!title || !slug) return res.status(400).json({ error: '标题和 Slug 不能为空' });

    let finalContent = content || '';
    if (chapters) {
        const chapterTitles = chapters.split('\n').filter(line => line.trim() !== '');
        const chaptersMarkdown = chapterTitles.map(chap => `## ${chap}`).join('\n\n');
        finalContent = chaptersMarkdown + '\n\n' + finalContent;
    }

    const { data, error } = await supabaseAdmin.from('wiki_articles').update({ 
        title, slug, content: finalContent, category_id: category_id || null, updated_at: new Date(), chapters: chapters || null
    }).eq('id', id).select().single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(200).json(data);
});

app.post('/api/admin/wiki/upload-image', isAdmin, upload.single('wiki_image'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: '未找到上传的图片文件' });
        
        const fileExt = path.extname(req.file.originalname);
        const fileName = `wiki-images/${crypto.randomBytes(16).toString('hex')}${fileExt}`;

        const command = new PutObjectCommand({
            Bucket: s3BucketName,
            Key: fileName,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
            ACL: 'public-read'
        });

        await s3Client.send(command);

        const imageUrl = `${s3Endpoint}/${s3BucketName}/${fileName}`;
        
        res.status(200).json({ imageUrl });

    } catch (error) {
        console.error('S3 Image upload error:', error);
        res.status(500).json({ error: '图片上传失败: ' + (error.message || '未知错误') });
    }
});


// --- Server Listener ---
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`✅ 服务器已在本地启动，正在监听 http://localhost:${port}`);
    });
}

export default app;