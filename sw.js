// Service Worker для DevTalk PWA
const CACHE_NAME = 'devtalk-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// Установка Service Worker
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Установка...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('🔧 Service Worker: Кеширование ресурсов');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('✅ Service Worker: Установка завершена');
        return self.skipWaiting();
      })
  );
});

// Активация Service Worker
self.addEventListener('activate', (event) => {
  console.log('🔄 Service Worker: Активация...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Service Worker: Удаление старого кеша', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker: Активация завершена');
      return self.clients.claim();
    })
  );
});

// Обработка запросов
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Возвращаем кешированный ресурс если он есть
        if (response) {
          return response;
        }

        // Клонируем запрос
        const fetchRequest = event.request.clone();

        return fetch(fetchRequest).then((response) => {
          // Проверяем что получили валидный ответ
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Клонируем ответ
          const responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then((cache) => {
              cache.put(event.request, responseToCache);
            });

          return response;
        });
      })
  );
});

// Обработка push уведомлений
self.addEventListener('push', (event) => {
  console.log('📨 Service Worker: Получено push уведомление');

  const options = {
    body: event.data ? event.data.text() : 'Новое уведомление от DevTalk',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Открыть',
        icon: '/icons/icon-192x192.png'
      },
      {
        action: 'close',
        title: 'Закрыть',
        icon: '/icons/icon-192x192.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('DevTalk', options)
  );
});

// Обработка кликов по уведомлениям
self.addEventListener('notificationclick', (event) => {
  console.log('🖱️ Service Worker: Клик по уведомлению');

  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Обработка сообщений от основного потока
self.addEventListener('message', (event) => {
  console.log('📨 Service Worker: Получено сообщение', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
