
const CACHE_NAME = 'lecture-schedule-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png'
];

// تثبيت Service Worker
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(urlsToCache);
            })
    );
});

// جلب الملفات من Cache
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // إرجاع الملف من Cache إذا موجود
                if (response) {
                    return response;
                }
                return fetch(event.request);
            }
        )
    );
});

// التعامل مع الإشعارات
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    event.waitUntil(
        clients.openWindow('/')
    );
});

// إرسال إشعارات مجدولة في الخلفية
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SCHEDULE_NOTIFICATION') {
        const { title, body, delay } = event.data;
        
        setTimeout(() => {
            self.registration.showNotification(title, {
                body: body,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: 'lecture-notification',
                requireInteraction: true,
                vibrate: [200, 100, 200]
            });
        }, delay);
    }
});
