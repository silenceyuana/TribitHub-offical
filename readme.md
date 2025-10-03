# TribitHub 官方网站

欢迎来到 TribitHub 的官方网站项目仓库。这是一个功能完善的全栈网站，旨在为客户提供 Minecraft 插件和网站定制服务，并包含一个完整的用户系统、工单支持系统和后台管理的 Wiki 系统。

**线上访问地址**: [https://www.tribit.top/](https://www.tribit.top/)

---

## ✨ 主要功能 (Features)

### 面向公众的功能

*   **用户认证系统**:
    *   支持用户通过邮箱和验证码进行注册。
    *   支持用户登录、退出登录。
    *   包含完整的“忘记密码”和“密码重置”流程。
*   **工单提交系统**:
    *   已登录用户可以提交带有主题和详细描述的工单。
    *   提交成功后，用户会收到确认邮件。
*   **Wiki 文章系统**:
    *   一个公开的 Wiki 目录页面 (`/wiki.html`)，按分类展示所有已发布的文章。
    *   独立的文章阅读页面 (`/wiki-article.html`)，通过 URL Slug 动态加载并显示由 Markdown 渲染的内容。

### 后台管理功能 (`/admin.html`)

*   **安全登录**: 独立的管理员登录入口，与普通用户隔离。
*   **工单管理面板**:
    *   集中查看所有用户提交的工单。
    *   显示工单的提交人、邮箱、主题、内容和时间。
*   **Wiki 内容管理系统 (CMS)**:
    *   **分类管理**: 自由创建和删除文章分类。
    *   **文章管理**:
        *   查看所有已创建的文章列表。
        *   通过功能齐全的 Markdown 编辑器（SimpleMDE）创建和编辑文章。
        *   支持在编辑器中直接上传图片到 Supabase Storage。
        *   为每篇文章自定义对 SEO 友好的 URL Slug。

---

## 🛠️ 技术栈 (Technology Stack)

*   **前端**:
    *   原生 HTML, CSS, 和 JavaScript (Vanilla JS)
    *   [SimpleMDE](https://simplemde.com/): 用于后台的 Markdown 编辑器。
    *   [Marked.js](https://marked.js.org/): 用于在前台渲染 Markdown 内容。
*   **后端**:
    *   [Node.js](https://nodejs.org/)
    *   [Express.js](https://expressjs.com/): 作为 API 服务的后端框架。
*   **后端即服务 (BaaS)**:
    *   [Supabase](https://supabase.com/):
        *   **数据库**: 使用 PostgreSQL 存储所有数据（用户、工单、文章等）。
        *   **用户认证**: 管理用户注册、登录和权限。
        *   **文件存储**: 存储 Wiki 文章中上传的图片。
*   **邮件服务**:
    *   [Resend](https://resend.com/): 用于发送所有交易性邮件（验证码、通知等）。
*   **部署与托管**:
    *   [Vercel](https://vercel.com/): 用于托管静态文件并通过无服务器函数 (Serverless Functions) 运行后端 API。

---

## 🚀 本地开发设置 (Getting Started)

请按照以下步骤在您的本地计算机上运行此项目。

### 1. 先决条件

*   安装 [Node.js](https://nodejs.org/) (建议使用 v18 或更高版本)。
*   拥有一个 [Supabase](https://supabase.com/) 账户和一个项目。
*   拥有一个 [Resend](https://resend.com/) 账户并生成一个 API Key。

### 2. 克隆项目

```bash
git clone <your-repository-url>
cd <repository-folder>
```

### 3. 安装依赖

```bash
npm install
```

### 4. 配置环境变量

在项目根目录下，创建一个名为 `.env` 的文件，并复制以下内容。然后，从您的 Supabase 和 Resend 仪表盘中填入对应的值。

```
# .env.example

# 从 Supabase 项目的 "Project Settings" -> "API" 中获取
VITE_SUPABASE_URL="https://your-project-url.supabase.co"
SUPABASE_SERVICE_KEY="your-supabase-service-role-key"

# 从 Resend 仪表盘的 "API Keys" 中获取
RESEND_API_KEY="re_xxxxxxxxxxxxxxxx"

# 您的网站主域名
SITE_URL="http://localhost:3000"
```

### 5. 设置 Supabase 数据库

您需要在 Supabase 项目中手动创建以下数据表：

*   `profiles`: 存储用户的额外信息，如角色（`role`）。需要一个 `role` 字段（`text` 类型）来区分普通用户和管理员。
*   `tickets`: 存储用户提交的工单。
*   `wiki_articles`: 存储 Wiki 文章（标题、内容、slug 等）。
*   `wiki_categories`: 存储 Wiki 文章的分类。
*   `verification_codes`: 存储注册和密码重置时使用的验证码。

**重要**:
*   为了让后台正常工作，您需要手动在 `profiles` 表中，将您的管理员用户的 `role` 字段值设置为 `admin`。
*   请确保为您的数据表启用了 **行级安全策略 (Row Level Security, RLS)**，以保护数据安全。

### 6. 运行本地开发服务器

```bash
npm start
```

该命令会启动一个本地服务器。您可以通过访问 `http://localhost:3000` 来查看您的网站。

---

## 🌐 部署到 Vercel

本项目已针对 Vercel 进行了优化部署。

### 1. 连接仓库

在 Vercel 上创建一个新项目，并将其连接到您的代码仓库 (GitHub, GitLab 等)。

### 2. 配置环境变量

在 Vercel 项目的 **Settings -> Environment Variables** 中，添加您在 `.env` 文件中使用的所有环境变量。

### 3. 配置构建设置

这是最关键的一步。在 Vercel 项目的 **Settings -> General** 中，找到 **Build & Development Settings** 区域，并进行如下设置：

*   **Framework Preset**: `Other`
*   **Output Directory**: `public`

这些设置会告诉 Vercel 您的所有静态文件（HTML, CSS, JS）都位于 `public` 文件夹中，并且需要由 Vercel 的 CDN 来处理，而不是交给 Node.js 服务器。

### 4. 部署

完成以上设置后，触发一次新的部署。Vercel 会自动构建并上线您的网站。

---

## 📂 文件结构概览

```
/
├── public/                 # 存放所有静态资源 (HTML, CSS, JS, Images)
│   ├── dist/               # 存放编译后的 CSS 和 JS
│   ├── admin.html          # 后台管理主页
│   ├── index.html          # 网站首页
│   └── ...                 # 其他所有 HTML 文件
├── .gitignore
├── package.json            # 项目依赖和脚本
├── server.js               # Express 后端服务器，处理所有 API 请求
└── vercel.json             # Vercel 部署和路由配置文件
```