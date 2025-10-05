// Импортируем Firebase
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getDatabase, ref, push, onValue, remove, set, onDisconnect, serverTimestamp, get, query, orderByChild, limitToLast } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

const firebaseConfig = {
    apiKey: "AIzaSyCjByS41_k-zgRoSWwBs5hrp8zZSTThxwI",
    authDomain: "comments-4f6ef.firebaseapp.com",
    databaseURL: "https://comments-4f6ef-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "comments-4f6ef",
    storageBucket: "comments-4f6ef.firebasestorage.app",
    messagingSenderId: "423558993625",
    appId: "1:423558993625:web:48bc7b387855f7788710c8",
    measurementId: "G-CYKP3568TT"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const postsRef = ref(database, 'posts');

// ============ ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ============
let userFingerprint = null;
let userStatus = { banned: false, muted: false };
let fingerprintReady = false;
let currentSort = 'new';
let allPosts = [];
let currentAdminTab = 'dashboard';

// ============ FINGERPRINT ============
async function initFingerprint() {
    try {
        const FingerprintJS = await window.FingerprintJS.load();
        const result = await FingerprintJS.get();
        userFingerprint = result.visitorId;
        console.log('🔑 Fingerprint:', userFingerprint);
        
        startRealtimeStatusMonitoring();
        await recordUserActivity();
        
        fingerprintReady = true;
        console.log('✅ Fingerprint готов');
    } catch (error) {
        console.error('❌ Ошибка Fingerprint:', error);
        userFingerprint = 'temp_' + Math.random().toString(36).substr(2, 16);
        fingerprintReady = true;
    }
}

// ============ МОНИТОРИНГ СТАТУСА ============
function startRealtimeStatusMonitoring() {
    if (!userFingerprint) return;
    
    const banRef = ref(database, `bans/${userFingerprint}`);
    onValue(banRef, (snapshot) => {
        if (snapshot.exists()) {
            const banData = snapshot.val();
            if (banData.expiresAt && banData.expiresAt < Date.now()) {
                remove(banRef);
                userStatus.banned = false;
            } else {
                userStatus.banned = true;
                showBanAlert(banData);
            }
        } else {
            userStatus.banned = false;
        }
    });
    
    const muteRef = ref(database, `mutes/${userFingerprint}`);
    onValue(muteRef, (snapshot) => {
        if (snapshot.exists()) {
            const muteData = snapshot.val();
            if (muteData.expiresAt && muteData.expiresAt < Date.now()) {
                remove(muteRef);
                userStatus.muted = false;
            } else {
                userStatus.muted = true;
            }
        } else {
            userStatus.muted = false;
        }
    });
}

function showBanAlert(banData) {
    alert(`🚫 Вы забанены!\n\nПричина: ${banData.reason}\nИстекает: ${banData.expiresAt ? new Date(banData.expiresAt).toLocaleString('ru-RU') : 'Перманентный'}`);
}

async function recordUserActivity() {
    if (!userFingerprint) return;
    
    const username = document.getElementById('username')?.value.trim() || 'Аноним';
    const activityRef = ref(database, `users/${userFingerprint}`);
    
    try {
        await set(activityRef, {
            fingerprint: userFingerprint,
            lastUsername: username,
            lastSeen: serverTimestamp(),
            userAgent: navigator.userAgent.substring(0, 200)
        });
    } catch (error) {
        console.error('Ошибка записи активности:', error);
    }
}

// ============ ОНЛАЙН ============
const userId = 'user_' + Math.random().toString(36).substr(2, 9);
const userStatusOnlineRef = ref(database, `online/${userId}`);

async function initOnlineStatus() {
    try {
        await set(userStatusOnlineRef, {
            online: true,
            timestamp: serverTimestamp(),
            fingerprint: userFingerprint || 'loading',
            username: document.getElementById('username')?.value.trim() || 'Аноним'
        });
        onDisconnect(userStatusOnlineRef).remove();
    } catch (error) {
        console.error('Ошибка онлайн статуса:', error);
    }
}

const onlineRef = ref(database, 'online');
onValue(onlineRef, (snapshot) => {
    const count = snapshot.numChildren();
    const onlineEl = document.getElementById('online-count');
    if (onlineEl) onlineEl.textContent = count;
    
    const sidebarCount = document.getElementById('online-count-sidebar');
    if (sidebarCount) sidebarCount.textContent = count;
    
    const onlineMobile = document.getElementById('online-count-mobile');
    if (onlineMobile) onlineMobile.textContent = count;
    
    const badgeOnline = document.getElementById('badge-online');
    if (badgeOnline) badgeOnline.textContent = count;
    
    const statOnline = document.getElementById('stat-online');
    if (statOnline) statOnline.textContent = count;
});

// ============ МОБИЛЬНОЕ МЕНЮ ============
window.toggleMobileMenu = function() {
    const sidebar = document.getElementById('mobile-sidebar');
    const overlay = document.querySelector('.mobile-overlay');
    
    if (sidebar && overlay) {
        sidebar.classList.toggle('show');
        overlay.classList.toggle('show');
        
        // Блокируем скролл body когда меню открыто
        if (sidebar.classList.contains('show')) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    }
};

// ============ ТЕМНАЯ ТЕМА ============
window.toggleTheme = function() {
    document.body.classList.toggle('dark-theme');
    const icon = document.getElementById('theme-icon');
    if (icon) {
        icon.className = document.body.classList.contains('dark-theme') ? 'fas fa-sun' : 'fas fa-moon';
    }
    localStorage.setItem('theme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
};

if (localStorage.getItem('theme') === 'dark') {
    document.body.classList.add('dark-theme');
    const themeIcon = document.getElementById('theme-icon');
    if (themeIcon) themeIcon.className = 'fas fa-sun';
}

// ============ ПРОВЕРКА АДМИНА ============
function isAdmin() {
    const username = document.getElementById('username')?.value.trim();
    return username === 'Nort89855';
}

function updateAdminUI() {
    const admin = isAdmin();
    const adminSidebar = document.getElementById('admin-sidebar');
    const adminSidebarMobile = document.getElementById('admin-sidebar-mobile');
    
    if (adminSidebar) {
        adminSidebar.style.display = admin ? 'block' : 'none';
    }
    
    if (adminSidebarMobile) {
        adminSidebarMobile.style.display = admin ? 'block' : 'none';
    }
    
    if (allPosts.length > 0) {
        sortAndDisplayPosts();
    }
}

// ============ МОДАЛЬНЫЕ ОКНА ============
window.openPostModal = function() {
    const username = document.getElementById('username')?.value.trim();
    if (!username) {
        alert('Введите ваше имя!');
        return;
    }
    
    if (userStatus.banned) {
        alert('❌ Вы забанены и не можете создавать посты!');
        return;
    }
    
    if (userStatus.muted) {
        alert('❌ Вы замучены и не можете создавать посты!');
        return;
    }
    
    document.getElementById('post-modal').classList.add('show');
};

window.closePostModal = function() {
    document.getElementById('post-modal').classList.remove('show');
    document.getElementById('post-title').value = '';
    document.getElementById('post-text').value = '';
};

window.openAdminPanel = function() {
    if (!isAdmin()) {
        alert('❌ У вас нет прав доступа!');
        return;
    }
    
    document.getElementById('admin-modal').classList.add('show');
    switchAdminTab('dashboard');
};

window.closeAdminPanel = function() {
    document.getElementById('admin-modal').classList.remove('show');
};

// ============ СОЗДАНИЕ ПОСТА ============
window.submitPost = async function() {
    if (!fingerprintReady) {
        alert('⏳ Загрузка... Попробуйте через секунду');
        return;
    }
    
    const username = document.getElementById('username')?.value.trim();
    const title = document.getElementById('post-title')?.value.trim();
    const text = document.getElementById('post-text')?.value.trim();
    
    if (!username) {
        alert('Введите ваше имя!');
        return;
    }
    
    if (!title) {
        alert('Введите заголовок поста!');
        return;
    }
    
    const newPost = {
        author: username,
        title: title,
        text: text || '',
        timestamp: Date.now(),
        upvotes: 0,
        downvotes: 0,
        fingerprint: userFingerprint,
        userAgent: navigator.userAgent.substring(0, 200)
    };
    
    try {
        await push(postsRef, newPost);
        console.log('✅ Пост создан!');
        closePostModal();
        await recordUserActivity();
    } catch (error) {
        console.error('❌ Ошибка создания поста:', error);
        alert('Ошибка: ' + error.message);
    }
};

// ============ ЗАГРУЗКА ПОСТОВ ============
onValue(postsRef, (snapshot) => {
    const postsContainer = document.getElementById('posts-container');
    if (!postsContainer) return;
    
    allPosts = [];

    if (!snapshot.exists()) {
        postsContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);">Пока нет постов. Создайте первый! 🎉</div>';
        updateStats(0, 0);
        return;
    }

    let totalLikes = 0;
    snapshot.forEach((childSnapshot) => {
        const postData = childSnapshot.val();
        allPosts.push({
            id: childSnapshot.key,
            data: postData
        });
        totalLikes += (postData.upvotes || 0);
    });

    updateStats(allPosts.length, totalLikes);
    sortAndDisplayPosts();
});

function updateStats(postsCount, likesCount) {
    const postsCountEl = document.getElementById('posts-count');
    if (postsCountEl) postsCountEl.textContent = postsCount;
    
    const postsCountMobile = document.getElementById('posts-count-mobile');
    if (postsCountMobile) postsCountMobile.textContent = postsCount;
    
    const statPosts = document.getElementById('stat-posts');
    if (statPosts) statPosts.textContent = postsCount;
    
    const statLikes = document.getElementById('stat-likes');
    if (statLikes) statLikes.textContent = likesCount;
}

// Статистика пользователей
onValue(ref(database, 'users'), (snapshot) => {
    const count = snapshot.exists() ? snapshot.size : 0;
    const usersCountEl = document.getElementById('users-count');
    if (usersCountEl) usersCountEl.textContent = count;
    
    const usersCountMobile = document.getElementById('users-count-mobile');
    if (usersCountMobile) usersCountMobile.textContent = count;
    
    const statUsers = document.getElementById('stat-users');
    if (statUsers) statUsers.textContent = count;
});

// ============ СОРТИРОВКА ПОСТОВ ============
window.sortPosts = function(type) {
    currentSort = type;
    
    document.querySelectorAll('.sort-btn').forEach(btn => btn.classList.remove('active'));
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    sortAndDisplayPosts();
};

function sortAndDisplayPosts() {
    let sortedPosts = [...allPosts];
    
    if (currentSort === 'new') {
        sortedPosts.sort((a, b) => b.data.timestamp - a.data.timestamp);
    } else if (currentSort === 'hot') {
        sortedPosts.sort((a, b) => {
            const scoreA = (a.data.upvotes || 0) - (a.data.downvotes || 0);
            const scoreB = (b.data.upvotes || 0) - (b.data.downvotes || 0);
            const timeA = Date.now() - a.data.timestamp;
            const timeB = Date.now() - b.data.timestamp;
            return (scoreB / Math.log(timeB + 2)) - (scoreA / Math.log(timeA + 2));
        });
    } else if (currentSort === 'top') {
        sortedPosts.sort((a, b) => {
            const scoreA = (a.data.upvotes || 0) - (a.data.downvotes || 0);
            const scoreB = (b.data.upvotes || 0) - (b.data.downvotes || 0);
            return scoreB - scoreA;
        });
    }
    
    const postsContainer = document.getElementById('posts-container');
    postsContainer.innerHTML = '';
    
    sortedPosts.forEach(post => {
        const postCard = createPostCard(post.id, post.data);
        postsContainer.appendChild(postCard);
    });
}

// ============ СОЗДАНИЕ КАРТОЧКИ ПОСТА ============
function createPostCard(id, data) {
    const div = document.createElement('div');
    div.className = 'post-card';
    
    const score = (data.upvotes || 0) - (data.downvotes || 0);
    const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
    const userVote = userVotes[id] || 0;
    
    const date = new Date(data.timestamp);
    const timeAgo = getTimeAgo(date);
    
    const admin = isAdmin();
    
    div.innerHTML = `
        <div class="vote-section">
            <button class="vote-btn ${userVote === 1 ? 'upvoted' : ''}" onclick="vote('${id}', 1)">
                <i class="fas fa-arrow-up"></i>
            </button>
            <div class="vote-count ${score > 0 ? 'positive' : score < 0 ? 'negative' : ''}">${formatNumber(score)}</div>
            <button class="vote-btn ${userVote === -1 ? 'downvoted' : ''}" onclick="vote('${id}', -1)">
                <i class="fas fa-arrow-down"></i>
            </button>
        </div>
        <div class="post-content">
            <div class="post-header">
                <span class="post-author">${escapeHtml(data.author)}</span>
                ${data.author === 'Nort89855' ? '<span class="admin-badge">ADMIN</span>' : ''}
                <span>•</span>
                <span class="post-time">${timeAgo}</span>
            </div>
            <div class="post-title">${escapeHtml(data.title)}</div>
            ${data.text ? `<div class="post-body">${escapeHtml(data.text)}</div>` : ''}
            <div class="post-actions">
                ${admin && data.fingerprint ? `
                    <button class="action-btn ban" onclick="banUser('${data.fingerprint}', '${escapeHtml(data.author)}')">
                        <i class="fas fa-ban"></i> Бан
                    </button>
                    <button class="action-btn mute" onclick="muteUser('${data.fingerprint}', '${escapeHtml(data.author)}')">
                        <i class="fas fa-volume-mute"></i> Мут
                    </button>
                ` : ''}
                ${admin ? `
                    <button class="action-btn delete" onclick="deletePost('${id}')">
                        <i class="fas fa-trash"></i> Удалить
                    </button>
                ` : ''}
            </div>
        </div>
    `;
    
    return div;
}

// ============ ГОЛОСОВАНИЕ ============
window.vote = async function(postId, voteType) {
    if (userStatus.banned) {
        alert('❌ Вы забанены и не можете голосовать!');
        return;
    }
    
    const userVotes = JSON.parse(localStorage.getItem('userVotes') || '{}');
    const currentVote = userVotes[postId] || 0;
    
    try {
        const postRef = ref(database, `posts/${postId}`);
        const snapshot = await get(postRef);
        const postData = snapshot.val();
        
        let upvotes = postData.upvotes || 0;
        let downvotes = postData.downvotes || 0;
        
        if (currentVote === 1) upvotes--;
        if (currentVote === -1) downvotes--;
        
        if (currentVote === voteType) {
            userVotes[postId] = 0;
        } else {
            if (voteType === 1) upvotes++;
            if (voteType === -1) downvotes++;
            userVotes[postId] = voteType;
        }
        
        localStorage.setItem('userVotes', JSON.stringify(userVotes));
        
        await set(postRef, {
            ...postData,
            upvotes: upvotes,
            downvotes: downvotes
        });
    } catch (error) {
        console.error('Ошибка голосования:', error);
    }
};

// ============ УДАЛЕНИЕ ПОСТА ============
window.deletePost = function(id) {
    if (!isAdmin()) {
        alert('❌ У вас нет прав!');
        return;
    }
    
    if (confirm('Удалить этот пост?')) {
        remove(ref(database, 'posts/' + id))
            .then(() => console.log('🗑️ Пост удален'))
            .catch((error) => alert('Ошибка: ' + error.message));
    }
};

// ============ АДМИН ПАНЕЛЬ - НАВИГАЦИЯ ============
window.switchAdminTab = function(tabName) {
    currentAdminTab = tabName;
    
    document.querySelectorAll('.admin-tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });
    
    document.querySelectorAll('.admin-nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const selectedPane = document.getElementById(`admin-tab-${tabName}`);
    if (selectedPane) selectedPane.classList.add('active');
    
    if (event && event.target) {
        let btn = event.target;
        if (!btn.classList.contains('admin-nav-btn')) {
            btn = btn.closest('.admin-nav-btn');
        }
        if (btn) btn.classList.add('active');
    }
    
    // Загружаем данные для вкладки
    if (tabName === 'dashboard') loadDashboard();
    if (tabName === 'online') loadOnlineUsers();
    if (tabName === 'users') loadAllUsers();
    if (tabName === 'bans') loadBans();
    if (tabName === 'mutes') loadMutes();
    if (tabName === 'posts') loadAllPosts();
};

// ============ АДМИН ПАНЕЛЬ - ДАШБОРД ============
function loadDashboard() {
    loadStatistics();
    loadRecentActivity();
}

async function loadStatistics() {
    const bansSnapshot = await get(ref(database, 'bans'));
    const mutesSnapshot = await get(ref(database, 'mutes'));
    
    const bansCount = bansSnapshot.exists() ? bansSnapshot.size : 0;
    const mutesCount = mutesSnapshot.exists() ? mutesSnapshot.size : 0;
    
    const statBans = document.getElementById('stat-bans');
    if (statBans) statBans.textContent = bansCount;
    
    const statMutes = document.getElementById('stat-mutes');
    if (statMutes) statMutes.textContent = mutesCount;
    
    const badgeBans = document.getElementById('badge-bans');
    if (badgeBans) badgeBans.textContent = bansCount;
    
    const badgeMutes = document.getElementById('badge-mutes');
    if (badgeMutes) badgeMutes.textContent = mutesCount;
}

async function loadRecentActivity() {
    const activityContainer = document.getElementById('recent-activity');
    if (!activityContainer) return;
    
    activityContainer.innerHTML = '';
    
    // Получаем последние посты
    const postsSnapshot = await get(query(postsRef, orderByChild('timestamp'), limitToLast(5)));
    
    if (!postsSnapshot.exists()) {
        activityContainer.innerHTML = '<div class="empty-state"><p>Нет активности</p></div>';
        return;
    }
    
    const posts = [];
    postsSnapshot.forEach(child => {
        posts.push({ id: child.key, data: child.val() });
    });
    
    posts.reverse().forEach(post => {
        const item = document.createElement('div');
        item.className = 'activity-item';
        item.innerHTML = `
            <strong>${escapeHtml(post.data.author)}</strong> создал пост: "${escapeHtml(post.data.title)}"
            <div class="activity-time">${getTimeAgo(new Date(post.data.timestamp))}</div>
        `;
        activityContainer.appendChild(item);
    });
}

// ============ АДМИН ПАНЕЛЬ - ОНЛАЙН ПОЛЬЗОВАТЕЛИ ============
window.refreshOnlineUsers = function() {
    loadOnlineUsers();
};

function loadOnlineUsers() {
    onValue(onlineRef, (snapshot) => {
        const container = document.getElementById('online-users-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!snapshot.exists()) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><h4>Нет онлайн пользователей</h4><p>Все офлайн</p></div>';
            return;
        }
        
        snapshot.forEach(child => {
            const user = child.val();
            const item = document.createElement('div');
            item.className = 'admin-item';
            item.innerHTML = `
                <div class="admin-item-header">
                    <div class="admin-item-title">
                        <span class="online-indicator">
                            <i class="fas fa-circle"></i> ONLINE
                        </span>
                        ${escapeHtml(user.username || 'Аноним')}
                    </div>
                </div>
                <div class="admin-item-info">
                    <strong>Fingerprint:</strong> ${user.fingerprint ? user.fingerprint.substring(0, 20) + '...' : 'N/A'}
                </div>
            `;
            container.appendChild(item);
        });
    }, { onlyOnce: true });
}

// ============ АДМИН ПАНЕЛЬ - ВСЕ ПОЛЬЗОВАТЕЛИ ============
function loadAllUsers() {
    onValue(ref(database, 'users'), async (usersSnapshot) => {
        const container = document.getElementById('all-users-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!usersSnapshot.exists()) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-user-friends"></i><h4>Нет пользователей</h4></div>';
            return;
        }
        
        const bansSnapshot = await get(ref(database, 'bans'));
        const mutesSnapshot = await get(ref(database, 'mutes'));
        
        const bansMap = {};
        const mutesMap = {};
        
        bansSnapshot.forEach(child => { bansMap[child.key] = child.val(); });
        mutesSnapshot.forEach(child => { mutesMap[child.key] = child.val(); });
        
        usersSnapshot.forEach(child => {
            const user = child.val();
            const userId = child.key;
            const isBanned = bansMap[userId];
            const isMuted = mutesMap[userId];
            
            const item = document.createElement('div');
            item.className = 'admin-item';
            item.innerHTML = `
                <div class="admin-item-header">
                    <div class="admin-item-title">
                        ${escapeHtml(user.lastUsername || 'Аноним')}
                        ${user.lastUsername === 'Nort89855' ? '<span class="status-badge admin">ADMIN</span>' : ''}
                        ${isBanned ? '<span class="status-badge banned">BANNED</span>' : ''}
                        ${isMuted ? '<span class="status-badge muted">MUTED</span>' : ''}
                    </div>
                </div>
                <div class="admin-item-info">
                    <strong>ID:</strong> ${userId.substring(0, 30)}...<br>
                    <strong>Последняя активность:</strong> Недавно
                </div>
                <div class="admin-item-actions">
                    ${!isBanned ? `
                        <button style="background: #F44336;" onclick="banUserById('${userId}', '${escapeHtml(user.lastUsername)}')">
                            <i class="fas fa-ban"></i> Забанить
                        </button>
                    ` : `
                        <button style="background: #4CAF50;" onclick="unbanUser('${userId}')">
                            <i class="fas fa-check"></i> Разбанить
                        </button>
                    `}
                    ${!isMuted ? `
                        <button style="background: #FF9800;" onclick="muteUserById('${userId}', '${escapeHtml(user.lastUsername)}')">
                            <i class="fas fa-volume-mute"></i> Замутить
                        </button>
                    ` : `
                        <button style="background: #2196F3;" onclick="unmuteUser('${userId}')">
                            <i class="fas fa-volume-up"></i> Размутить
                        </button>
                    `}
                    <button style="background: #757575;" onclick="deleteAllUserPosts('${userId}')">
                        <i class="fas fa-trash"></i> Удалить посты
                    </button>
                </div>
            `;
            container.appendChild(item);
        });
    }, { onlyOnce: true });
}

// ============ АДМИН ПАНЕЛЬ - БАНЫ ============
function loadBans() {
    onValue(ref(database, 'bans'), (snapshot) => {
        const container = document.getElementById('bans-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!snapshot.exists()) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-ban"></i><h4>Нет забаненных пользователей</h4><p>Все чисты!</p></div>';
            return;
        }
        
        snapshot.forEach(child => {
            const ban = child.val();
            const isExpired = ban.expiresAt && ban.expiresAt < Date.now();
            
            const item = document.createElement('div');
            item.className = 'admin-item';
            item.innerHTML = `
                <div class="admin-item-header">
                    <div class="admin-item-title">
                        ${escapeHtml(ban.username || 'Аноним')}
                        ${isExpired ? '<span class="status-badge expired">ИСТЁК</span>' : '<span class="status-badge banned">АКТИВЕН</span>'}
                    </div>
                    <div class="admin-item-time">${new Date(ban.timestamp).toLocaleString('ru-RU')}</div>
                </div>
                <div class="admin-item-info">
                    <strong>Причина:</strong> ${escapeHtml(ban.reason)}<br>
                    <strong>Забанил:</strong> ${escapeHtml(ban.bannedBy)}<br>
                    <strong>Истекает:</strong> ${ban.expiresAt ? new Date(ban.expiresAt).toLocaleString('ru-RU') : 'Перманентный'}
                </div>
                <div class="admin-item-actions">
                    <button style="background: #4CAF50;" onclick="unbanUser('${child.key}')">
                        <i class="fas fa-check"></i> Снять бан
                    </button>
                </div>
            `;
            container.appendChild(item);
        });
    }, { onlyOnce: true });
}

window.clearExpiredBans = async function() {
    const snapshot = await get(ref(database, 'bans'));
    let cleared = 0;
    
    const promises = [];
    snapshot.forEach(child => {
        const ban = child.val();
        if (ban.expiresAt && ban.expiresAt < Date.now()) {
            promises.push(remove(ref(database, `bans/${child.key}`)));
            cleared++;
        }
    });
    
    await Promise.all(promises);
    alert(`✅ Очищено истекших банов: ${cleared}`);
    loadBans();
};

// ============ АДМИН ПАНЕЛЬ - МУТЫ ============
function loadMutes() {
    onValue(ref(database, 'mutes'), (snapshot) => {
        const container = document.getElementById('mutes-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!snapshot.exists()) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-volume-mute"></i><h4>Нет замученных пользователей</h4><p>Никто не наказан</p></div>';
            return;
        }
        
        snapshot.forEach(child => {
            const mute = child.val();
            const isExpired = mute.expiresAt < Date.now();
            
            const item = document.createElement('div');
            item.className = 'admin-item';
            item.innerHTML = `
                <div class="admin-item-header">
                    <div class="admin-item-title">
                        ${escapeHtml(mute.username || 'Аноним')}
                        ${isExpired ? '<span class="status-badge expired">ИСТЁК</span>' : '<span class="status-badge muted">АКТИВЕН</span>'}
                    </div>
                    <div class="admin-item-time">${new Date(mute.timestamp).toLocaleString('ru-RU')}</div>
                </div>
                <div class="admin-item-info">
                    <strong>Причина:</strong> ${escapeHtml(mute.reason)}<br>
                    <strong>Замутил:</strong> ${escapeHtml(mute.mutedBy)}<br>
                    <strong>Истекает:</strong> ${new Date(mute.expiresAt).toLocaleString('ru-RU')}
                </div>
                <div class="admin-item-actions">
                    <button style="background: #2196F3;" onclick="unmuteUser('${child.key}')">
                        <i class="fas fa-volume-up"></i> Снять мут
                    </button>
                </div>
            `;
            container.appendChild(item);
        });
    }, { onlyOnce: true });
}

window.clearExpiredMutes = async function() {
    const snapshot = await get(ref(database, 'mutes'));
    let cleared = 0;
    
    const promises = [];
    snapshot.forEach(child => {
        const mute = child.val();
        if (mute.expiresAt < Date.now()) {
            promises.push(remove(ref(database, `mutes/${child.key}`)));
            cleared++;
        }
    });
    
    await Promise.all(promises);
    alert(`✅ Очищено истекших мутов: ${cleared}`);
    loadMutes();
};

// ============ АДМИН ПАНЕЛЬ - ВСЕ ПОСТЫ ============
function loadAllPosts() {
    onValue(postsRef, (snapshot) => {
        const container = document.getElementById('all-posts-list');
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!snapshot.exists()) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-list"></i><h4>Нет постов</h4></div>';
            return;
        }
        
        const posts = [];
        snapshot.forEach(child => {
            posts.push({ id: child.key, data: child.val() });
        });
        
        posts.sort((a, b) => b.data.timestamp - a.data.timestamp);
        
        posts.forEach(post => {
            const score = (post.data.upvotes || 0) - (post.data.downvotes || 0);
            
            const item = document.createElement('div');
            item.className = 'admin-item';
            item.innerHTML = `
                <div class="admin-item-header">
                    <div class="admin-item-title">
                        ${escapeHtml(post.data.title)}
                    </div>
                    <div class="admin-item-time">${getTimeAgo(new Date(post.data.timestamp))}</div>
                </div>
                <div class="admin-item-info">
                    <strong>Автор:</strong> ${escapeHtml(post.data.author)}<br>
                    <strong>Рейтинг:</strong> ${score > 0 ? '+' : ''}${score} (👍 ${post.data.upvotes || 0} / 👎 ${post.data.downvotes || 0})
                    ${post.data.text ? `<br><strong>Текст:</strong> ${escapeHtml(post.data.text).substring(0, 100)}...` : ''}
                </div>
                <div class="admin-item-actions">
                    <button style="background: #F44336;" onclick="deletePost('${post.id}')">
                        <i class="fas fa-trash"></i> Удалить пост
                    </button>
                </div>
            `;
            container.appendChild(item);
        });
    }, { onlyOnce: true });
}

// ============ ФУНКЦИИ МОДЕРАЦИИ ============
window.banUser = async function(fingerprint, username) {
    const reason = prompt('Причина бана:', 'Нарушение правил');
    if (!reason) return;
    
    const duration = prompt('Длительность (минут, 0 = навсегда):', '0');
    const durationMs = parseInt(duration) * 60 * 1000;
    
    try {
        await set(ref(database, `bans/${fingerprint}`), {
            fingerprint, username, reason,
            timestamp: Date.now(),
            expiresAt: durationMs > 0 ? Date.now() + durationMs : null,
            bannedBy: 'Nort89855'
        });
        alert(`✅ ${username} забанен!`);
        loadStatistics();
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
};

window.banUserById = window.banUser;

window.unbanUser = async function(fingerprint) {
    if (confirm('Снять бан с этого пользователя?')) {
        try {
            await remove(ref(database, `bans/${fingerprint}`));
            alert('✅ Бан снят!');
            loadStatistics();
            if (currentAdminTab === 'bans') loadBans();
            if (currentAdminTab === 'users') loadAllUsers();
        } catch (error) {
            alert('Ошибка: ' + error.message);
        }
    }
};

window.muteUser = async function(fingerprint, username) {
    const reason = prompt('Причина мута:', 'Спам');
    if (!reason) return;
    
    const duration = prompt('Длительность (минут):', '60');
    const durationMs = parseInt(duration) * 60 * 1000;
    
    try {
        await set(ref(database, `mutes/${fingerprint}`), {
            fingerprint, username, reason,
            timestamp: Date.now(),
            expiresAt: Date.now() + durationMs,
            mutedBy: 'Nort89855'
        });
        alert(`✅ ${username} замучен на ${duration} мин!`);
        loadStatistics();
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
};

window.muteUserById = window.muteUser;

window.unmuteUser = async function(fingerprint) {
    if (confirm('Снять мут с этого пользователя?')) {
        try {
            await remove(ref(database, `mutes/${fingerprint}`));
            alert('✅ Мут снят!');
            loadStatistics();
            if (currentAdminTab === 'mutes') loadMutes();
            if (currentAdminTab === 'users') loadAllUsers();
        } catch (error) {
            alert('Ошибка: ' + error.message);
        }
    }
};

window.deleteAllUserPosts = async function(fingerprint) {
    if (!confirm('Удалить все посты этого пользователя?')) return;
    
    try {
        const snapshot = await get(postsRef);
        let deleted = 0;
        
        const promises = [];
        snapshot.forEach(child => {
            if (child.val().fingerprint === fingerprint) {
                promises.push(remove(ref(database, `posts/${child.key}`)));
                deleted++;
            }
        });
        
        await Promise.all(promises);
        alert(`✅ Удалено постов: ${deleted}`);
    } catch (error) {
        alert('Ошибка: ' + error.message);
    }
};

// ============ УТИЛИТЫ ============
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return `${seconds}с назад`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}м назад`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}ч назад`;
    return `${Math.floor(seconds / 86400)}д назад`;
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}

// ============ СОХРАНЕНИЕ И ЗАГРУЗКА НИКА ============
function saveUsername(username) {
    if (username && username.trim()) {
        localStorage.setItem('savedUsername', username.trim());
    }
}

function loadUsername() {
    return localStorage.getItem('savedUsername') || '';
}

function clearUsername() {
    localStorage.removeItem('savedUsername');
}

// ============ ГЛОБАЛЬНАЯ ФУНКЦИЯ ДЛЯ ОЧИСТКИ НИКА ============
window.clearSavedUsername = function() {
    if (confirm('Вы уверены, что хотите очистить сохраненный ник? При следующем посещении сайта поле имени будет пустым.')) {
        clearUsername();
        const usernameInput = document.getElementById('username');
        if (usernameInput) {
            usernameInput.value = '';
            usernameInput.focus();
        }
        alert('✅ Сохраненный ник очищен!');
    }
};

// ============ ИНИЦИАЛИЗАЦИЯ ============
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Инициализация...');

    await initFingerprint();
    await initOnlineStatus();

    const usernameInput = document.getElementById('username');
    if (usernameInput) {
        // Загружаем сохраненный ник при старте
        const savedUsername = loadUsername();
        if (savedUsername) {
            usernameInput.value = savedUsername;
            updateAdminUI();
            await recordUserActivity();

            // Обновляем онлайн статус с сохраненным именем
            set(userStatusOnlineRef, {
                online: true,
                timestamp: serverTimestamp(),
                fingerprint: userFingerprint || 'loading',
                username: savedUsername
            });
        }

        usernameInput.addEventListener('input', () => {
            const username = usernameInput.value.trim();

            // Сохраняем ник при вводе
            if (username) {
                saveUsername(username);
            }

            updateAdminUI();
            recordUserActivity();

            // Обновляем имя в онлайн статусе
            set(userStatusOnlineRef, {
                online: true,
                timestamp: serverTimestamp(),
                fingerprint: userFingerprint || 'loading',
                username: username || 'Аноним'
            });
        });

        // Добавляем обработчик потери фокуса для сохранения ника
        usernameInput.addEventListener('blur', () => {
            const username = usernameInput.value.trim();
            if (username) {
                saveUsername(username);
            }
        });

        updateAdminUI();
    }

    console.log('✅ Готово!');
});
