
const CACHE_NAME = 'lecture-schedule-v2';
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
    console.log('Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Cache opened');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('All files cached');
                return self.skipWaiting();
            })
    );
});

// تفعيل Service Worker
self.addEventListener('activate', event => {
    console.log('Service Worker activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('Service Worker activated');
            return self.clients.claim();
        })
    );
});

// جلب الملفات من Cache
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});

// التعامل مع الإشعارات
self.addEventListener('notificationclick', event => {
    console.log('Notification clicked:', event.notification);
    event.notification.close();
    
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                // إذا كان التطبيق مفتوحاً، اعرضه
                for (let i = 0; i < clientList.length; i++) {
                    const client = clientList[i];
                    if (client.url.indexOf(location.origin) === 0 && 'focus' in client) {
                        return client.focus();
                    }
                }
                // إذا لم يكن مفتوحاً، افتح نافذة جديدة
                if (clients.openWindow) {
                    return clients.openWindow('/');
                }
            })
    );
});

// إرسال إشعارات مجدولة
self.addEventListener('message', event => {
    console.log('Service Worker received message:', event.data);
    
    if (event.data && event.data.type === 'SCHEDULE_TEST_NOTIFICATION') {
        const { title, body, delay } = event.data;
        
        console.log(`Scheduling test notification in ${delay}ms`);
        
        setTimeout(() => {
            console.log('Showing test notification now');
            self.registration.showNotification(title, {
                body: body,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: 'test-notification-' + Date.now(),
                requireInteraction: true,
                vibrate: [500, 200, 500],
                silent: false,
                timestamp: Date.now(),
                actions: [
                    {
                        action: 'view',
                        title: 'عرض',
                        icon: '/icon-192.png'
                    },
                    {
                        action: 'dismiss',
                        title: 'إغلاق',
                        icon: '/icon-192.png'
                    }
                ],
                data: {
                    type: 'test',
                    timestamp: Date.now()
                }
            }).then(() => {
                console.log('Test notification shown successfully');
            }).catch(error => {
                console.error('Error showing test notification:', error);
            });
        }, delay);
    }
    
    if (event.data && event.data.type === 'SCHEDULE_LECTURE_NOTIFICATION') {
        const { title, body, delay, lectureId, notificationType } = event.data;
        
        console.log(`Scheduling lecture notification in ${delay}ms for lecture ${lectureId}`);
        
        setTimeout(() => {
            console.log(`Showing lecture notification for ${lectureId}`);
            self.registration.showNotification(title, {
                body: body,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: `lecture-${lectureId}-${notificationType}`,
                requireInteraction: true,
                vibrate: notificationType === 'reminder' ? [200, 100, 200] : [300, 100, 300],
                silent: false,
                timestamp: Date.now(),
                actions: [
                    {
                        action: 'view',
                        title: 'عرض الجدول',
                        icon: '/icon-192.png'
                    }
                ],
                data: {
                    type: 'lecture',
                    lectureId: lectureId,
                    notificationType: notificationType,
                    timestamp: Date.now()
                }
            }).then(() => {
                console.log(`Lecture notification shown for ${lectureId}`);
            }).catch(error => {
                console.error(`Error showing lecture notification for ${lectureId}:`, error);
            });
        }, delay);
    }
});
