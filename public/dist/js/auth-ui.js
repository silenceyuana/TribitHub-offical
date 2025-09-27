// =======================================================
// auth-ui.js - 最终、完整、未经省略的版本
// 在您现有代码基础上修改，实现简洁的用户信息按钮
// =======================================================

document.addEventListener('DOMContentLoaded', () => {
    // 找到导航栏的链接容器 ul 元素
    const headerLinks = document.querySelector('header .header-links');
    if (!headerLinks) return;

    // 【无需修改HTML】精确地找到原始的“注册/登录”链接的 <li> 元素
    const authLinkListItem = headerLinks.querySelector('a[href="login-user.html"]')?.parentElement;

    // 尝试从 localStorage 获取 session 数据
    const sessionData = localStorage.getItem('supabase.auth.session');

    if (sessionData && authLinkListItem) {
        // --- 用户已登录 ---
        try {
            const session = JSON.parse(sessionData);
            // 从 user_metadata 中获取用户名
            const username = session.user.user_metadata.username || '用户';

            // --- 【核心修改】用新的、简洁的按钮HTML替换整个 <li> 的内容 ---

            // 用于图标的 SVG 代码 (一个通用的人物图标)
            const userIconSVG = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="16px" height="16px">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path>
                </svg>`;
            
            // 构建新的按钮HTML结构
            authLinkListItem.innerHTML = `
                <a href="#" class="user-profile-button" title="点击退出登录">
                    <span class="user-icon">${userIconSVG}</span>
                    <span class="username">${username}</span>
                </a>
            `;
            // 给 li 添加一个 class 以便 CSS 可以定位
            authLinkListItem.className = 'user-profile-container';

            // 为新的按钮添加退出登录的事件
            const logoutButton = authLinkListItem.querySelector('.user-profile-button');
            logoutButton.addEventListener('click', (e) => {
                e.preventDefault();
                if (confirm('您确定要退出登录吗？')) {
                    localStorage.removeItem('supabase.auth.session');
                    window.location.reload(); // 重新加载页面以更新为未登录状态
                }
            });

        } catch (error) {
            console.error('解析 session 失败:', error);
            localStorage.removeItem('supabase.auth.session');
        }
    }
    // 如果未登录，脚本什么都不做，页面会默认显示原始的“注册/登录”链接
});