// =======================================================
// auth-ui.js - 最终、完整、未经省略的版本
// 修正了登录后导航栏链接全部消失的问题
// =======================================================

document.addEventListener('DOMContentLoaded', () => {
    // 找到导航栏的链接容器 ul 元素
    const headerLinks = document.querySelector('header .header-links');
    if (!headerLinks) return;

    // 【关键修正】精确地找到原始的“注册/登录”链接的 li 元素
    const authLinkListItem = headerLinks.querySelector('a[href="login-user.html"]')?.parentElement;

    // 尝试从 localStorage 获取 session 数据
    const sessionData = localStorage.getItem('supabase.auth.session');

    if (sessionData && authLinkListItem) {
        // --- 用户已登录 ---
        try {
            const session = JSON.parse(sessionData);
            // 从 user_metadata 中获取用户名
            const username = session.user.user_metadata.username || '用户';

            // 【关键修正】不再清空整个导航栏，而是只隐藏“注册/登录”按钮
            authLinkListItem.style.display = 'none';

            // 检查是否已经存在 profile 元素，防止重复添加
            if (headerLinks.querySelector('.user-profile')) {
                return;
            }

            // 创建新的用户 profile 元素
            const profileElement = document.createElement('li');
            profileElement.className = 'user-profile';
            profileElement.innerHTML = `
                <div class="profile-display">
                    <span class="profile-icon"></span>
                    <span class="profile-name">${username}</span>
                </div>
                <div class="profile-dropdown">
                    <a href="/dashboard.html">用户中心</a>
                    <a href="#" id="logout-button">退出登录</a>
                </div>
            `;
            
            // 将新的 profile 元素添加到导航栏的末尾，主题切换按钮之前
            const themeSwitcher = headerLinks.querySelector('.theme-switch-wrapper');
            if (themeSwitcher) {
                headerLinks.insertBefore(profileElement, themeSwitcher);
            } else {
                headerLinks.appendChild(profileElement);
            }
            
            // 为 profile 元素添加点击事件，以显示/隐藏下拉菜单
            const profileDisplay = profileElement.querySelector('.profile-display');
            profileDisplay.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止事件冒泡
                profileElement.classList.toggle('active');
            });
            
            // 为登出按钮添加事件
            const logoutButton = profileElement.querySelector('#logout-button');
            logoutButton.addEventListener('click', (e) => {
                e.preventDefault();
                localStorage.removeItem('supabase.auth.session');
                window.location.reload(); // 重新加载页面以更新为未登录状态
            });
            
            // 添加一个全局点击事件，用于在点击页面其他地方时关闭下拉菜单
            document.addEventListener('click', (e) => {
                if (!profileElement.contains(e.target)) {
                    profileElement.classList.remove('active');
                }
            });

        } catch (error) {
            console.error('解析 session 失败:', error);
            localStorage.removeItem('supabase.auth.session');
            // 如果解析失败，确保“注册/登录”按钮是可见的
            authLinkListItem.style.display = '';
        }
    }
    // 如果 sessionData 不存在，则脚本什么都不做，页面会默认显示所有原始链接
});