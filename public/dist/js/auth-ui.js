document.addEventListener('DOMContentLoaded', () => {
    // 找到导航栏的链接容器
    const headerLinks = document.querySelector('header .header-links');
    if (!headerLinks) return;

    // 尝试从 localStorage 获取 session 数据
    const sessionData = localStorage.getItem('supabase.auth.session');

    if (sessionData) {
        // 如果存在 session，说明用户已登录
        try {
            const session = JSON.parse(sessionData);
            // 从 user_metadata 中获取用户名
            const username = session.user.user_metadata.username || '用户';

            // 清空现有的导航链接 (例如 "首页", "联系我们" 等)
            headerLinks.innerHTML = '';

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
            
            headerLinks.appendChild(profileElement);
            
            // 为 profile 元素添加点击事件，以下拉菜单
            const profileDisplay = profileElement.querySelector('.profile-display');
            profileDisplay.addEventListener('click', () => {
                profileElement.classList.toggle('active');
            });
            
            // 为登出按钮添加事件
            const logoutButton = profileElement.querySelector('#logout-button');
            logoutButton.addEventListener('click', (e) => {
                e.preventDefault();
                localStorage.removeItem('supabase.auth.session');
                window.location.href = '/'; // 登出后返回首页
            });

        } catch (error) {
            console.error('解析 session 失败:', error);
            // 如果解析失败，清除损坏的 session
            localStorage.removeItem('supabase.auth.session');
        }
    }
});