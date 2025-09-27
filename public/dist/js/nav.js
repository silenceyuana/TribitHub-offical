/* ===================================================================
//
//  Mobile Navigation Script
//
// =================================================================*/

document.addEventListener('DOMContentLoaded', () => {
    const headerToggle = document.getElementById('headerToggle');
    const headerLinks = document.getElementById('headerLinks');

    if (headerToggle && headerLinks) {
        headerToggle.addEventListener('click', () => {
            // 切换按钮的激活状态 (用于CSS动画)
            headerToggle.classList.toggle('is-active');
            
            // 切换导航菜单的显示/隐藏
            headerLinks.classList.toggle('is-active');

            // 防止页面在菜单打开时滚动
            document.body.style.overflow = headerLinks.classList.contains('is-active') ? 'hidden' : '';
        });
    }
});