import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// 注意：这些密钥将从 Vercel 环境变量中读取，而不是写在这里
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY; // 这是安全的服务器端密钥
const resendApiKey = process.env.RESEND_API_KEY;
const siteUrl = process.env.SITE_URL || 'http://localhost:3000'; // 你的网站 URL

// 初始化 Supabase 和 Resend
const supabase = createClient(supabaseUrl, supabaseServiceKey);
const resend = new Resend(resendApiKey);

// Vercel 会将这个文件转换成一个可以处理 HTTP 请求的函数
export default async function handler(req, res) {
    // 只接受 POST 请求
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        // 1. 使用 Supabase Admin 客户端生成一个一次性的登录链接 (OTP)
        // 这不会实际发送邮件，只是生成一个带令牌的链接
        const { data, error: otpError } = await supabase.auth.signInWithOtp({
            email: email,
            options: {
                // 用户点击链接后跳转到哪里
                emailRedirectTo: `${siteUrl}/dashboard.html`
            }
        });

        if (otpError) {
            throw otpError;
        }

        // 从 Supabase 的响应中获取魔术链接 URL
        // 注意：Supabase v2.38+ 在 data.properties 中返回链接
        const magicLink = data.properties.action_link;

        if (!magicLink) {
             return res.status(500).json({ error: '无法生成登录链接' });
        }

        // 2. 使用 Resend 发送包含这个链接的邮件
        const { data: emailData, error: emailError } = await resend.emails.send({
            from: 'TribitHub <message@tribit.top/>', // 替换成你在 Resend 验证过的发件邮箱
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

        // 3. 向前端返回成功消息
        res.status(200).json({ message: '登录链接已发送，请检查您的邮箱。' });

    } catch (error) {
        console.error('错误:', error);
        res.status(500).json({ error: '发送邮件时发生内部错误。', details: error.message });
    }
}