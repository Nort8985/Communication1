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

// Правила базы данных для публичного доступа
const databaseRules = {
    rules: {
        ".read": true,
        ".write": true,
        "posts": {
            ".indexOn": ["timestamp", "author"]
        },
        "comments": {
            ".indexOn": ["postId", "timestamp"]
        },
        "users": {
            ".indexOn": ["lastSeen"]
        },
        "online": {
            ".indexOn": ["timestamp"]
        },
        "chats": {
            ".indexOn": ["participants", "lastMessage", "timestamp"]
        },
        "messages": {
            ".indexOn": ["chatId", "timestamp"]
        }
    }
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const postsRef = ref(database, 'posts');
const commentsRef = ref(database, 'comments');
const chatsRef = ref(database, 'chats');
const messagesRef = ref(database, 'messages');

// ============ ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ============
let userFingerprint = null;
let userStatus = { banned: false, muted: false };
let fingerprintReady = false;
let currentSort = 'new';
let allPosts = [];
let currentAdminTab = 'dashboard';
let notifications = [];
let notificationTimeout = null;

// ============ ЧАТЫ ============
let currentChatId = null;
let allChats = [];
let chatMessages = {};
let chatListeners = []; // Для хранения слушателей чатов
let unreadMessages = {}; // Для отслеживания непрочитанных сообщений

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
window.toggleMobileMenu = function () {
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
window.toggleTheme = function () {
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
window.openPostModal = function () {
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

window.closePostModal = function () {
    document.getElementById('post-modal').classList.remove('show');
    document.getElementById('post-title').value = '';
    document.getElementById('post-text').value = '';
};

window.openAdminPanel = function () {
    if (!isAdmin()) {
        alert('❌ У вас нет прав доступа!');
        return;
    }

    document.getElementById('admin-modal').classList.add('show');
    switchAdminTab('dashboard');
};

window.closeAdminPanel = function () {
    document.getElementById('admin-modal').classList.remove('show');
};

// ============ ФУНКЦИИ ЧАТОВ ============
window.toggleChats = function () {
    if (!fingerprintReady) {
        alert('⏳ Загрузка... Попробуйте через секунду');
        return;
    }

    const username = document.getElementById('username')?.value.trim();
    if (!username) {
        alert('Введите ваше имя!');
        return;
    }

    document.getElementById('chats-modal').classList.add('show');
    loadUserChats();
};

window.closeChatsModal = function () {
    document.getElementById('chats-modal').classList.remove('show');
    currentChatId = null;

    // Очищаем все слушатели чатов
    chatListeners.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
            unsubscribe();
        }
    });
    chatListeners = [];
};

window.openNewChatModal = function () {
    document.getElementById('new-chat-modal').classList.add('show');
};

window.closeNewChatModal = function () {
    document.getElementById('new-chat-modal').classList.remove('show');
    document.getElementById('chat-participant').value = '';
};

// Загрузка чатов пользователя
function loadUserChats() {
    const username = document.getElementById('username')?.value.trim();
    if (!username) return;

    // Очищаем предыдущие слушатели
    chatListeners.forEach(unsubscribe => {
        if (typeof unsubscribe === 'function') {
            unsubscribe();
        }
    });
    chatListeners = [];

    // Устанавливаем постоянный слушатель для обновления чатов в реальном времени
    const unsubscribeChats = onValue(chatsRef, (snapshot) => {
        const chatsList = document.getElementById('chats-list');
        if (!chatsList) return;

        chatsList.innerHTML = '';

        if (!snapshot.exists()) {
            chatsList.innerHTML = '<div class="no-chats"><i class="fas fa-comments"></i><h4>Нет чатов</h4><p>Создайте свой первый чат</p></div>';
            return;
        }

        allChats = [];
        snapshot.forEach(child => {
            const chat = child.val();
            if (chat.participants && chat.participants.includes(username)) {
                allChats.push({
                    id: child.key,
                    data: chat
                });
            }
        });

        // Сортируем чаты по последнему сообщению
        allChats.sort((a, b) => (b.data.lastMessage || 0) - (a.data.lastMessage || 0));

        allChats.forEach(chat => {
            const unreadCount = unreadMessages[chat.id] || 0;
            const chatItem = createChatItem(chat.id, chat.data, username, unreadCount);
            chatsList.appendChild(chatItem);
        });
    });

    // Сохраняем функцию отписки
    chatListeners.push(unsubscribeChats);

    // Добавляем глобальный слушатель для всех сообщений (для уведомлений о новых сообщениях)
    const unsubscribeAllMessages = onValue(messagesRef, (snapshot) => {
        const currentUsername = document.getElementById('username')?.value.trim();
        if (!currentUsername) return;

        // Сбрасываем счетчики непрочитанных
        const newUnreadMessages = {};

        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const message = child.val();
                const chat = allChats.find(c => c.id === message.chatId);

                if (chat && chat.data.participants.includes(currentUsername) && message.author !== currentUsername) {
                    // Это сообщение для нас в одном из наших чатов
                    if (message.chatId !== currentChatId) {
                        // Чат не открыт, увеличиваем счетчик непрочитанных
                        newUnreadMessages[message.chatId] = (newUnreadMessages[message.chatId] || 0) + 1;

                        // Показываем уведомление о новом сообщении
                        if (message.timestamp > (Date.now() - 5000)) { // Сообщение не старше 5 секунд
                            showInfoNotification(`Новое сообщение от ${escapeHtml(message.author)}`, 3000);
                        }
                    }
                }
            });
        }

        unreadMessages = newUnreadMessages;
    });

    // Сохраняем слушатель всех сообщений
    chatListeners.push(unsubscribeAllMessages);
}

// Создание элемента чата в списке
function createChatItem(chatId, chatData, currentUsername, unreadCount = 0) {
    const div = document.createElement('div');
    div.className = `chat-item ${currentChatId === chatId ? 'active' : ''}`;
    div.onclick = () => openChat(chatId);

    const otherParticipant = chatData.participants.find(p => p !== currentUsername) || 'Неизвестный';
    const lastMessageTime = chatData.lastMessage ? getTimeAgo(new Date(chatData.lastMessage)) : '';

    div.innerHTML = `
        <div class="chat-avatar">
            <i class="fas fa-user-circle"></i>
            ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>` : ''}
        </div>
        <div class="chat-info">
            <div class="chat-name">${escapeHtml(otherParticipant)}</div>
            <div class="chat-last-message">${chatData.lastMessageText ? escapeHtml(chatData.lastMessageText.substring(0, 30)) + (chatData.lastMessageText.length > 30 ? '...' : '') : 'Нет сообщений'}</div>
        </div>
        <div class="chat-time">${lastMessageTime}</div>
    `;

    return div;
}

// Создание нового чата
window.createNewChat = async function () {
    const participant = document.getElementById('chat-participant')?.value.trim();
    const currentUsername = document.getElementById('username')?.value.trim();

    if (!participant) {
        alert('Введите имя пользователя!');
        return;
    }

    if (participant === currentUsername) {
        alert('Нельзя создать чат с самим собой!');
        return;
    }

    // Проверяем, существует ли уже чат с этим пользователем
    const existingChat = allChats.find(chat =>
        chat.data.participants.includes(participant) &&
        chat.data.participants.includes(currentUsername)
    );

    if (existingChat) {
        alert('Чат с этим пользователем уже существует!');
        closeNewChatModal();
        openChat(existingChat.id);
        return;
    }

    try {
        const newChat = {
            participants: [currentUsername, participant],
            createdBy: currentUsername,
            timestamp: Date.now(),
            lastMessage: null,
            lastMessageText: null
        };

        await push(chatsRef, newChat);
        console.log('✅ Чат создан!');
        closeNewChatModal();
        // Чат автоматически появится благодаря слушателю onValue
    } catch (error) {
        console.error('❌ Ошибка создания чата:', error);
        alert('Ошибка: ' + error.message);
    }
};

// ============ СОЗДАНИЕ ПОСТА ============
window.submitPost = async function () {
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

// ============ РЕАЛЬНО-ВРЕМЕННАЯ ЗАГРУЗКА ПОСТОВ ============
onValue(postsRef, (snapshot) => {
    console.log('📡 Обновление постов в реальном времени');

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

// ============ РЕАЛЬНО-ВРЕМЕННАЯ СТАТИСТИКА ПОЛЬЗОВАТЕЛЕЙ ============
onValue(ref(database, 'users'), (snapshot) => {
    console.log('📡 Обновление статистики пользователей');
    const count = snapshot.exists() ? snapshot.size : 0;
    const usersCountEl = document.getElementById('users-count');
    if (usersCountEl) usersCountEl.textContent = count;

    const usersCountMobile = document.getElementById('users-count-mobile');
    if (usersCountMobile) usersCountMobile.textContent = count;

    const statUsers = document.getElementById('stat-users');
    if (statUsers) statUsers.textContent = count;
});

// ============ СОРТИРОВКА ПОСТОВ ============
window.sortPosts = function (type) {
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
                <button class="action-btn comment" onclick="toggleComments('${id}')">
                    <i class="fas fa-comments"></i> Комментарии (<span id="comment-count-${id}">0</span>)
                </button>
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

            <!-- Комментарии -->
            <div class="comments-section" id="comments-${id}" style="display: none;">
                <div class="comments-header">
                    <h4><i class="fas fa-comments"></i> Комментарии</h4>
                </div>
                <div class="comments-container" id="comments-container-${id}">
                    <!-- Комментарии будут загружаться здесь -->
                </div>
                <div class="comment-form">
                    <input type="text" id="comment-text-${id}" placeholder="Написать комментарий..." class="comment-input">
                    <button class="comment-submit-btn" onclick="submitComment('${id}')">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        </div>
    `;

    return div;
}

// ============ ГОЛОСОВАНИЕ ============
window.vote = async function (postId, voteType) {
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
window.deletePost = function (id) {
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
window.switchAdminTab = function (tabName) {
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
    console.log('📡 Загрузка статистики модерации');

    // ============ РЕАЛЬНО-ВРЕМЕННАЯ СТАТИСТИКА БАНОВ ============
    onValue(ref(database, 'bans'), (snapshot) => {
        const bansCount = snapshot.exists() ? snapshot.size : 0;

        const statBans = document.getElementById('stat-bans');
        if (statBans) statBans.textContent = bansCount;

        const badgeBans = document.getElementById('badge-bans');
        if (badgeBans) badgeBans.textContent = bansCount;
    });

    // ============ РЕАЛЬНО-ВРЕМЕННАЯ СТАТИСТИКА МУТОВ ============
    onValue(ref(database, 'mutes'), (snapshot) => {
        const mutesCount = snapshot.exists() ? snapshot.size : 0;

        const statMutes = document.getElementById('stat-mutes');
        if (statMutes) statMutes.textContent = mutesCount;

        const badgeMutes = document.getElementById('badge-mutes');
        if (badgeMutes) badgeMutes.textContent = mutesCount;
    });
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
window.refreshOnlineUsers = function () {
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

window.clearExpiredBans = async function () {
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

window.clearExpiredMutes = async function () {
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
window.banUser = async function (fingerprint, username) {
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

// Открытие чата
function openChat(chatId) {
    currentChatId = chatId;

    // Обновляем активный элемент в списке
    document.querySelectorAll('.chat-item').forEach(item => {
        item.classList.remove('active');
    });
    event?.target?.closest('.chat-item')?.classList.add('active');

    // Очищаем предыдущие слушатели сообщений (оставляем только слушатель чатов)
    if (chatListeners.length > 1) {
        for (let i = chatListeners.length - 1; i >= 1; i--) {
            if (typeof chatListeners[i] === 'function') {
                chatListeners[i]();
            }
            chatListeners.splice(i, 1);
        }
    }

    loadChatMessages(chatId);
}

// Загрузка сообщений чата
function loadChatMessages(chatId) {
    const chatWindow = document.getElementById('chat-window');
    if (!chatWindow) return;

    // Показываем индикатор загрузки
    chatWindow.innerHTML = '<div class="chat-loading">Загрузка сообщений...</div>';

    const chat = allChats.find(c => c.id === chatId);
    if (!chat) return;

    const currentUsername = document.getElementById('username')?.value.trim();
    const otherParticipant = chat.data.participants.find(p => p !== currentUsername) || 'Неизвестный';

    // Создаем интерфейс чата
    chatWindow.innerHTML = `
        <div class="chat-header">
            <div class="chat-participant">
                <i class="fas fa-user-circle"></i>
                <span>${escapeHtml(otherParticipant)}</span>
            </div>
            <button class="close-chat-btn" onclick="closeCurrentChat()">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="chat-messages" id="chat-messages-${chatId}">
            <div class="no-messages"><i class="fas fa-comments"></i><p>Нет сообщений. Начните разговор!</p></div>
        </div>
        <div class="chat-input">
            <input type="text" id="message-input-${chatId}" placeholder="Напишите сообщение..." class="message-input">
            <button class="send-message-btn" onclick="sendMessage('${chatId}')">
                <i class="fas fa-paper-plane"></i>
            </button>
        </div>
    `;

    // Добавляем обработчик Enter для отправки
    const messageInput = document.getElementById(`message-input-${chatId}`);
    if (messageInput) {
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(chatId);
            }
        });
        messageInput.focus();
    }

    // Устанавливаем постоянный слушатель для сообщений этого чата
    const chatMessagesRef = query(messagesRef, orderByChild('chatId'));
    const unsubscribeMessages = onValue(chatMessagesRef, (snapshot) => {
        const messagesContainer = document.getElementById(`chat-messages-${chatId}`);
        if (!messagesContainer) return;

        const messages = [];

        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const message = child.val();
                if (message.chatId === chatId) {
                    messages.push({
                        id: child.key,
                        data: message
                    });
                }
            });
        }

        // Сортируем сообщения по времени
        messages.sort((a, b) => a.data.timestamp - b.data.timestamp);

        // Обновляем сообщения
        if (messages.length === 0) {
            messagesContainer.innerHTML = '<div class="no-messages"><i class="fas fa-comments"></i><p>Нет сообщений. Начните разговор!</p></div>';
        } else {
            messagesContainer.innerHTML = messages.map(msg => createMessageElement(msg.id, msg.data, currentUsername)).join('');
        }

        // Отмечаем сообщения как прочитанные
        unreadMessages[chatId] = 0;

        // Прокручиваем к последнему сообщению
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });

    // Сохраняем функцию отписки для сообщений
    chatListeners.push(unsubscribeMessages);
}

// Создание элемента сообщения
function createMessageElement(messageId, messageData, currentUsername) {
    const isOwn = messageData.author === currentUsername;
    const time = getTimeAgo(new Date(messageData.timestamp));

    return `
        <div class="message ${isOwn ? 'own' : 'other'}">
            <div class="message-content">
                <div class="message-text">${escapeHtml(messageData.text)}</div>
                <div class="message-time">${time}</div>
            </div>
        </div>
    `;
}

// Отправка сообщения
window.sendMessage = async function (chatId) {
    const messageInput = document.getElementById(`message-input-${chatId}`);
    const text = messageInput?.value.trim();

    if (!text) return;

    const currentUsername = document.getElementById('username')?.value.trim();
    if (!currentUsername) {
        alert('Введите ваше имя!');
        return;
    }

    if (userStatus.banned) {
        alert('❌ Вы забанены и не можете отправлять сообщения!');
        return;
    }

    if (userStatus.muted) {
        alert('❌ Вы замучены и не можете отправлять сообщения!');
        return;
    }

    try {
        const newMessage = {
            chatId: chatId,
            author: currentUsername,
            text: text,
            timestamp: Date.now(),
            fingerprint: userFingerprint,
            userAgent: navigator.userAgent.substring(0, 200)
        };

        await push(messagesRef, newMessage);

        // Обновляем последнее сообщение в чате
        await set(ref(database, `chats/${chatId}`), {
            ...allChats.find(c => c.id === chatId).data,
            lastMessage: Date.now(),
            lastMessageText: text
        });

        // Очищаем поле ввода
        messageInput.value = '';

        console.log('✅ Сообщение отправлено!');
        await recordUserActivity();
    } catch (error) {
        console.error('❌ Ошибка отправки сообщения:', error);
        alert('Ошибка: ' + error.message);
    }
};

// Закрытие текущего чата
window.closeCurrentChat = function () {
    currentChatId = null;
    document.querySelectorAll('.chat-item').forEach(item => {
        item.classList.remove('active');
    });

    const chatWindow = document.getElementById('chat-window');
    if (chatWindow) {
        chatWindow.innerHTML = `
            <div class="chat-placeholder">
                <i class="fas fa-comments"></i>
                <h3>Выберите чат</h3>
                <p>Выберите чат из списка слева или создайте новый</p>
            </div>
        `;
    }
};

window.banUserById = window.banUser;

window.unbanUser = async function (fingerprint) {
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

window.muteUser = async function (fingerprint, username) {
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

window.unmuteUser = async function (fingerprint) {
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

window.deleteAllUserPosts = async function (fingerprint) {
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
window.clearSavedUsername = function () {
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

// ============ СИСТЕМА УВЕДОМЛЕНИЙ ============
// Показать/скрыть уведомления
window.toggleNotifications = function () {
    const notifications = document.getElementById('notifications');
    if (notifications) {
        notifications.classList.toggle('show');
    }
};

// Прокрутка к началу страницы
window.scrollToTop = function () {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
};

// Обработка поиска
window.handleSearch = function (event) {
    if (event.key === 'Enter') {
        const query = event.target.value.trim();
        if (query) {
            performSearch(query);
        }
    }
};

// Выполнение поиска
function performSearch(query) {
    console.log('🔍 Поиск:', query);

    if (!query || query.length < 2) {
        showInfoNotification('Введите минимум 2 символа для поиска');
        return;
    }

    // Фильтруем посты по запросу
    const filteredPosts = allPosts.filter(post => {
        const title = post.data.title.toLowerCase();
        const text = (post.data.text || '').toLowerCase();
        const author = post.data.author.toLowerCase();
        const searchQuery = query.toLowerCase();

        return title.includes(searchQuery) ||
            text.includes(searchQuery) ||
            author.includes(searchQuery);
    });

    if (filteredPosts.length === 0) {
        showInfoNotification(`Посты по запросу "${query}" не найдены`);
        return;
    }

    // Показываем результаты поиска
    displaySearchResults(filteredPosts, query);
    showSuccessNotification(`Найдено ${filteredPosts.length} постов по запросу "${query}"`);
}

// Отображение результатов поиска
function displaySearchResults(posts, query) {
    const postsContainer = document.getElementById('posts-container');
    if (!postsContainer) return;

    const originalPosts = [...allPosts];
    allPosts = posts;

    // Добавляем индикатор поиска
    const searchIndicator = document.createElement('div');
    searchIndicator.className = 'search-indicator';
    searchIndicator.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; background: var(--primary); color: white; padding: 12px 20px; border-radius: var(--radius-lg); margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 12px;">
                <i class="fas fa-search"></i>
                <span>Результаты поиска: "${query}"</span>
            </div>
            <button onclick="clearSearch()" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 6px 12px; border-radius: var(--radius-md); cursor: pointer;">
                <i class="fas fa-times"></i> Очистить
            </button>
        </div>
    `;

    // Сохраняем оригинальный контент для восстановления
    postsContainer.setAttribute('data-original-content', postsContainer.innerHTML);
    postsContainer.setAttribute('data-search-query', query);

    postsContainer.innerHTML = '';
    postsContainer.appendChild(searchIndicator);

    // Отображаем отфильтрованные посты
    posts.forEach(post => {
        const postCard = createPostCard(post.id, post.data);
        postsContainer.appendChild(postCard);
    });
}

// Очистка поиска
window.clearSearch = function () {
    const postsContainer = document.getElementById('posts-container');
    if (!postsContainer) return;

    const originalContent = postsContainer.getAttribute('data-original-content');
    if (originalContent) {
        postsContainer.innerHTML = originalContent;
        postsContainer.removeAttribute('data-original-content');
        postsContainer.removeAttribute('data-search-query');
        showInfoNotification('Поиск очищен');
    }
};

// Добавить уведомление
function addNotification(type, title, message, duration = 5000) {
    const notificationId = 'notif_' + Date.now() + Math.random().toString(36).substr(2, 9);
    const notificationsContainer = document.getElementById('notifications');

    if (!notificationsContainer) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.id = notificationId;
    notification.innerHTML = `
        <div class="notification-header">
            <div class="notification-icon">
                <i class="fas fa-${getNotificationIcon(type)}"></i>
            </div>
            <div class="notification-title">${escapeHtml(title)}</div>
        </div>
        <div class="notification-message">${escapeHtml(message)}</div>
        <div class="notification-time">${new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>
    `;

    notificationsContainer.appendChild(notification);

    // Показываем уведомление
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);

    // Обновляем счетчик уведомлений
    updateNotificationBadge();

    // Автоматически скрываем уведомление
    if (duration > 0) {
        setTimeout(() => {
            hideNotification(notificationId);
        }, duration);
    }

    return notificationId;
}

// Скрыть уведомление
function hideNotification(notificationId) {
    const notification = document.getElementById(notificationId);
    if (notification) {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
            updateNotificationBadge();
        }, 300);
    }
}

// Получить иконку для типа уведомления
function getNotificationIcon(type) {
    const icons = {
        success: 'check-circle',
        error: 'exclamation-circle',
        warning: 'exclamation-triangle',
        info: 'info-circle'
    };
    return icons[type] || 'info-circle';
}

// Обновить счетчик уведомлений
function updateNotificationBadge() {
    const badge = document.getElementById('notification-badge');
    const notifications = document.querySelectorAll('.notification');
    const count = notifications.length;

    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

// Показать уведомление об успехе
function showSuccessNotification(message, duration) {
    return addNotification('success', 'Успешно', message, duration);
}

// Показать уведомление об ошибке
function showErrorNotification(message, duration = 7000) {
    return addNotification('error', 'Ошибка', message, duration);
}

// Показать уведомление с предупреждением
function showWarningNotification(message, duration = 5000) {
    return addNotification('warning', 'Предупреждение', message, duration);
}

// Показать информационное уведомление
function showInfoNotification(message, duration = 4000) {
    return addNotification('info', 'Информация', message, duration);
}

// ============ СИСТЕМА КОММЕНТАРИЕВ ============
// Показать/скрыть комментарии
window.toggleComments = function (postId) {
    const commentsSection = document.getElementById(`comments-${postId}`);
    if (commentsSection) {
        const isVisible = commentsSection.style.display !== 'none';
        commentsSection.style.display = isVisible ? 'none' : 'block';

        if (!isVisible) {
            loadComments(postId);
        }
    }
};

// ============ РЕАЛЬНО-ВРЕМЕННАЯ ЗАГРУЗКА КОММЕНТАРИЕВ ============
function loadComments(postId) {
    console.log(`📡 Загрузка комментариев для поста ${postId}`);

    const commentsContainer = document.getElementById(`comments-container-${postId}`);
    if (!commentsContainer) return;

    // Показываем индикатор загрузки
    commentsContainer.innerHTML = '<div class="comment-loading">Загрузка комментариев...</div>';

    // Слушаем изменения в комментариях для этого поста
    const postCommentsRef = query(
        commentsRef,
        orderByChild('postId'),
    );

    onValue(postCommentsRef, (snapshot) => {
        console.log(`📡 Обновление комментариев для поста ${postId} в реальном времени`);

        if (!snapshot.exists()) {
            commentsContainer.innerHTML = '<div class="no-comments">Комментариев пока нет. Будьте первым!</div>';
            updateCommentCount(postId, 0);
            return;
        }

        const comments = [];
        snapshot.forEach(child => {
            const comment = child.val();
            if (comment.postId === postId) {
                comments.push({
                    id: child.key,
                    data: comment
                });
            }
        });

        if (comments.length === 0) {
            commentsContainer.innerHTML = '<div class="no-comments">Комментариев пока нет. Будьте первым!</div>';
            updateCommentCount(postId, 0);
            return;
        }

        // Сортируем комментарии по времени
        comments.sort((a, b) => a.data.timestamp - b.data.timestamp);

        // Очищаем контейнер и добавляем комментарии
        commentsContainer.innerHTML = '';
        comments.forEach(comment => {
            const commentElement = createCommentElement(comment.id, comment.data, postId);
            commentsContainer.appendChild(commentElement);
        });

        updateCommentCount(postId, comments.length);
    });
}

// Создание элемента комментария
function createCommentElement(id, data, postId) {
    const div = document.createElement('div');
    div.className = 'comment-item';

    const date = new Date(data.timestamp);
    const timeAgo = getTimeAgo(date);
    const admin = isAdmin();

    // Загружаем голоса пользователя для комментариев
    const userCommentVotes = JSON.parse(localStorage.getItem('userCommentVotes') || '{}');
    const userVote = userCommentVotes[id] || 0;
    const score = (data.upvotes || 0) - (data.downvotes || 0);

    div.innerHTML = `
        <div class="comment-vote-section">
            <button class="comment-vote-btn ${userVote === 1 ? 'upvoted' : ''}" onclick="voteComment('${id}', 1)">
                <i class="fas fa-arrow-up"></i>
            </button>
            <div class="comment-vote-count ${score > 0 ? 'positive' : score < 0 ? 'negative' : ''}">${formatNumber(score)}</div>
            <button class="comment-vote-btn ${userVote === -1 ? 'downvoted' : ''}" onclick="voteComment('${id}', -1)">
                <i class="fas fa-arrow-down"></i>
            </button>
        </div>
        <div class="comment-content">
            <div class="comment-header">
                <span class="comment-author">${escapeHtml(data.author)}</span>
                ${data.author === 'Nort89855' ? '<span class="admin-badge">ADMIN</span>' : ''}
                <span class="comment-time">${timeAgo}</span>
                ${admin ? `
                    <button class="comment-delete-btn" onclick="deleteComment('${id}', '${postId}')" title="Удалить комментарий">
                        <i class="fas fa-trash"></i>
                    </button>
                ` : ''}
            </div>
            <div class="comment-text">${escapeHtml(data.text)}</div>
        </div>
    `;

    return div;
}

// Отправка комментария
window.submitComment = async function (postId) {
    if (!fingerprintReady) {
        alert('⏳ Загрузка... Попробуйте через секунду');
        return;
    }

    const username = document.getElementById('username')?.value.trim();
    const commentText = document.getElementById(`comment-text-${postId}`)?.value.trim();

    if (!username) {
        alert('Введите ваше имя!');
        return;
    }

    if (!commentText) {
        alert('Введите текст комментария!');
        return;
    }

    if (userStatus.banned) {
        alert('❌ Вы забанены и не можете комментировать!');
        return;
    }

    if (userStatus.muted) {
        alert('❌ Вы замучены и не можете комментировать!');
        return;
    }

    const newComment = {
        postId: postId,
        author: username,
        text: commentText,
        timestamp: Date.now(),
        upvotes: 0,
        downvotes: 0,
        fingerprint: userFingerprint,
        userAgent: navigator.userAgent.substring(0, 200)
    };

    try {
        await push(commentsRef, newComment);

        // Очищаем поле ввода
        const commentInput = document.getElementById(`comment-text-${postId}`);
        if (commentInput) {
            commentInput.value = '';
        }

        console.log('✅ Комментарий добавлен!');
        await recordUserActivity();
    } catch (error) {
        console.error('❌ Ошибка добавления комментария:', error);
        alert('Ошибка: ' + error.message);
    }
};

// Голосование за комментарий
window.voteComment = async function (commentId, voteType) {
    if (userStatus.banned) {
        alert('❌ Вы забанены и не можете голосовать!');
        return;
    }

    const userCommentVotes = JSON.parse(localStorage.getItem('userCommentVotes') || '{}');
    const currentVote = userCommentVotes[commentId] || 0;

    try {
        const commentRef = ref(database, `comments/${commentId}`);
        const snapshot = await get(commentRef);
        const commentData = snapshot.val();

        let upvotes = commentData.upvotes || 0;
        let downvotes = commentData.downvotes || 0;

        if (currentVote === 1) upvotes--;
        if (currentVote === -1) downvotes--;

        if (currentVote === voteType) {
            userCommentVotes[commentId] = 0;
        } else {
            if (voteType === 1) upvotes++;
            if (voteType === -1) downvotes++;
            userCommentVotes[commentId] = voteType;
        }

        localStorage.setItem('userCommentVotes', JSON.stringify(userCommentVotes));

        await set(commentRef, {
            ...commentData,
            upvotes: upvotes,
            downvotes: downvotes
        });
    } catch (error) {
        console.error('Ошибка голосования за комментарий:', error);
    }
};

// Удаление комментария
window.deleteComment = function (commentId, postId) {
    if (!isAdmin()) {
        alert('❌ У вас нет прав!');
        return;
    }

    if (confirm('Удалить этот комментарий?')) {
        remove(ref(database, 'comments/' + commentId))
            .then(() => {
                console.log('🗑️ Комментарий удален');
                loadComments(postId); // Перезагружаем комментарии
            })
            .catch((error) => alert('Ошибка: ' + error.message));
    }
};

// Обновление счетчика комментариев
function updateCommentCount(postId, count) {
    const countElement = document.getElementById(`comment-count-${postId}`);
    if (countElement) {
        countElement.textContent = count;
    }
};

// ============ ПРОВЕРКА ПОДКЛЮЧЕНИЯ К FIREBASE ============
async function checkFirebaseConnection() {
    try {
        // Проверяем доступность Firebase
        const testRef = ref(database, '.info/connected');
        const connected = await new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(false), 5000);
            const unsubscribe = onValue(testRef, (snapshot) => {
                clearTimeout(timeout);
                resolve(snapshot.val());
                unsubscribe();
            });
        });

        if (!connected) {
            throw new Error('Сервер Firebase недоступен');
        }

        console.log('✅ Подключение к Firebase установлено');
        return true;
    } catch (error) {
        console.error('❌ Ошибка подключения к Firebase:', error);
        return false;
    }
}

// ============ ИНИЦИАЛИЗАЦИЯ ============
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Инициализация с поддержкой реального времени...');

    // Попытка инициализации с повторными попытками и таймаутом
    let retries = 3;
    let initialized = false;
    const initTimeout = 15000; // 15 секунд таймаут

    const initPromise = new Promise(async (resolve, reject) => {
        while (retries > 0 && !initialized) {
            try {
                // Проверяем подключение к Firebase перед инициализацией
                const firebaseConnected = await checkFirebaseConnection();
                if (!firebaseConnected) {
                    throw new Error('Не удается подключиться к серверу Firebase');
                }

                await initFingerprint();
                await initOnlineStatus();
                initialized = true;
                console.log('✅ Инициализация успешна - все данные обновляются в реальном времени');
                resolve();
            } catch (error) {
                console.error(`❌ Ошибка инициализации (попытка ${4 - retries}):`, error);
                retries--;

                if (retries > 0) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                    reject(error);
                }
            }
        }
    });

    // Ждем инициализации или таймаута
    try {
        await Promise.race([
            initPromise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Превышено время ожидания инициализации')), initTimeout)
            )
        ]);
    } catch (error) {
        console.error('❌ Не удалось инициализировать приложение:', error.message);
        showConnectionError();
        return;
    }

    if (!initialized) {
        console.error('❌ Не удалось инициализировать приложение после нескольких попыток');
        showConnectionError();
    }
});

// Показать ошибку подключения
function showConnectionError() {
    const postsContainer = document.getElementById('posts-container');
    if (postsContainer) {
        postsContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary); max-width: 600px; margin: 0 auto;">
                <i class="fas fa-exclamation-triangle" style="font-size: 48px; opacity: 0.5; margin-bottom: 20px; color: #ff9800;"></i>
                <h3>Проблемы с подключением</h3>
                <p style="margin-bottom: 20px;">Не удается подключиться к серверу DevTalk. Приложение будет работать в автономном режиме, но функциональность может быть ограничена.</p>

                <div style="background: var(--bg-secondary); padding: 20px; border-radius: var(--radius-lg); margin-bottom: 20px;">
                    <h4 style="margin-top: 0; color: var(--primary);">Возможные причины:</h4>
                    <ul style="text-align: left; color: var(--text-secondary);">
                        <li>Отсутствие интернет-соединения</li>
                        <li>Блокировка Firebase в вашей сети или стране</li>
                        <li>Временные проблемы сервера</li>
                        <li>Превышено время ожидания ответа</li>
                    </ul>
                </div>

                <div style="background: var(--accent); padding: 15px; border-radius: var(--radius-lg); margin-bottom: 20px;">
                    <h4 style="margin-top: 0; color: var(--primary);">Что делать:</h4>
                    <ol style="text-align: left; color: var(--text-secondary);">
                        <li>Проверьте подключение к интернету</li>
                        <li>Попробуйте использовать VPN, если Firebase заблокирован</li>
                        <li>Подождите несколько минут и попробуйте снова</li>
                        <li>Обратитесь к администратору, если проблема persists</li>
                    </ol>
                </div>

                <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                    <button onclick="location.reload()" style="padding: 12px 24px; background: var(--reddit-blue); color: white; border: none; border-radius: 20px; cursor: pointer; font-weight: 500;">
                        <i class="fas fa-redo"></i> Попробовать снова
                    </button>
                    <button onclick="checkConnection()" style="padding: 12px 24px; background: #666; color: white; border: none; border-radius: 20px; cursor: pointer; font-weight: 500;">
                        <i class="fas fa-wifi"></i> Проверить связь
                    </button>
                    <button onclick="showOfflineMode()" style="padding: 12px 24px; background: var(--accent); color: white; border: none; border-radius: 20px; cursor: pointer; font-weight: 500;">
                        <i class="fas fa-plane"></i> Автономный режим
                    </button>
                </div>
            </div>
        `;
    }
}

// Функция автономного режима
window.showOfflineMode = function () {
    const postsContainer = document.getElementById('posts-container');
    if (postsContainer) {
        postsContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <i class="fas fa-plane" style="font-size: 48px; opacity: 0.5; margin-bottom: 20px; color: var(--accent);"></i>
                <h3>Автономный режим</h3>
                <p>Приложение работает без подключения к серверу. Некоторые функции могут быть недоступны.</p>
                <div style="margin-top: 20px;">
                    <button onclick="location.reload()" style="padding: 10px 20px; background: var(--reddit-blue); color: white; border: none; border-radius: 20px; cursor: pointer;">
                        Попробовать подключиться снова
                    </button>
                </div>
            </div>
        `;
    }

    showInfoNotification('Переход в автономный режим', 4000);
};

// Проверка подключения к интернету
window.checkConnection = async function () {
    const postsContainer = document.getElementById('posts-container');
    if (!postsContainer) return;

    // Показываем индикатор проверки
    postsContainer.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
            <i class="fas fa-spinner fa-spin" style="font-size: 48px; margin-bottom: 20px;"></i>
            <h3>Проверка подключения...</h3>
        </div>
    `;

    try {
        // Проверяем подключение к Firebase
        const testRef = ref(database, '.info/connected');
        const connected = await new Promise((resolve) => {
            const unsubscribe = onValue(testRef, (snapshot) => {
                resolve(snapshot.val());
                unsubscribe();
            });
        });

        if (connected) {
            location.reload();
        } else {
            throw new Error('Нет подключения к Firebase');
        }
    } catch (error) {
        postsContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <i class="fas fa-times-circle" style="font-size: 48px; opacity: 0.5; margin-bottom: 20px; color: #f44336;"></i>
                <h3>Подключение недоступно</h3>
                <p>Проверьте интернет-соединение и попробуйте позже</p>
                <button onclick="checkConnection()" style="margin-top: 15px; padding: 10px 20px; background: var(--reddit-blue); color: white; border: none; border-radius: 20px; cursor: pointer;">
                    Проверить снова
                </button>
            </div>
        `;
    }
};

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

    // Добавляем обработчик Enter для отправки комментариев
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            const activeElement = document.activeElement;
            if (activeElement && activeElement.classList.contains('comment-input')) {
                const postId = activeElement.id.replace('comment-text-', '');
                if (postId) {
                    e.preventDefault();
                    submitComment(postId);
                }
            }
        }
    });

    updateAdminUI();
}

// Экран загрузки скрывается автоматически после успешной инициализации
console.log('✅ DevTalk готов! Все данные обновляются в реальном времени');

// Показываем индикатор реального времени в консоли
setInterval(() => {
    console.log('🔄 DevTalk работает в реальном времени - все данные синхронизированы');
}, 60000); // Каждую минуту

// Показываем приветственное уведомление
setTimeout(() => {
    showSuccessNotification('Добро пожаловать в DevTalk! 🎉', 3000);
}, 1000);

// ============ МОБИЛЬНЫЕ ОПТИМИЗАЦИИ ============
// Предотвращаем зум при двойном тапе на iOS (полезно и для Android)
document.addEventListener('touchstart', function(event) {
    if (event.touches.length > 1) {
        event.preventDefault();
    }
}, { passive: false });

// Улучшаем обработку touch событий для чатов
document.addEventListener('DOMContentLoaded', function() {
    // Предотвращаем контекстное меню на длинное нажатие
    document.addEventListener('contextmenu', function(e) {
        if (e.target.closest('.chat-item, .message, .chat-avatar')) {
            e.preventDefault();
            return false;
        }
    });

    // Оптимизируем скроллинг на мобильных устройствах
    const chatMessages = document.querySelector('.chat-messages');
    const chatsList = document.querySelector('.chats-list');

    if (chatMessages) {
        chatMessages.addEventListener('touchstart', function() {}, { passive: true });
    }

    if (chatsList) {
        chatsList.addEventListener('touchstart', function() {}, { passive: true });
    }

    // Предотвращаем выделение текста в чатах на мобильных
    function preventTextSelection(element) {
        if (element) {
            element.style.webkitUserSelect = 'none';
            element.style.userSelect = 'none';
            element.style.webkitTouchCallout = 'none';
        }
    }

    // Применяем к элементам чата
    document.addEventListener('click', function(e) {
        if (e.target.closest('.chats-modal')) {
            const chatItems = document.querySelectorAll('.chat-item, .message, .chat-avatar');
            chatItems.forEach(preventTextSelection);
        }
    });
});

// Оптимизации для виртуальной клавиатуры на Android
window.addEventListener('resize', function() {
    // Корректируем высоту при появлении/скрытии клавиатуры
    const viewport = window.visualViewport;
    if (viewport) {
        const chatsModal = document.querySelector('.chats-modal');
        if (chatsModal && chatsModal.classList.contains('show')) {
            // Автоматически прокручиваем к полю ввода при появлении клавиатуры
            setTimeout(() => {
                const messageInput = document.querySelector('.message-input:focus');
                if (messageInput) {
                    messageInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 300);
        }
    }
});
