
const CACHE_NAME = 'lecture-schedule-v5';
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

// تثبيت Service Worker
self.addEventListener('install', (event) => {
    console.log('Service Worker: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: Caching files');
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('Service Worker: Skip waiting');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('Service Worker: Cache failed', error);
            })
    );
});

// تفعيل Service Worker
self.addEventListener('activate', (event) => {
    console.log('Service Worker: Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('Service Worker: Activated');
            return self.clients.claim();
        })
    );
});

// استراتيجية Cache First - للعمل بدون إنترنت
self.addEventListener('fetch', (event) => {
    // تجاهل الطلبات غير HTTP/HTTPS
    if (!event.request.url.startsWith('http')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                return fetch(event.request)
                    .then((response) => {
                        // تحقق من صحة الاستجابة
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        // نسخ الاستجابة
                        const responseToCache = response.clone();

                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    })
                    .catch(() => {
                        // في حالة عدم وجود إنترنت، إرجاع الصفحة الرئيسية للمسارات غير المعروفة
                        if (event.request.destination === 'document') {
                            return caches.match('./index.html');
                        }
                    });
            })
    );
});

// معالجة الرسائل من التطبيق الرئيسي
let notificationTimeouts = new Map();

self.addEventListener('message', (event) => {
    const { type, ...data } = event.data;

    switch (type) {
        case 'SCHEDULE_LECTURE_NOTIFICATION':
            scheduleLectureNotification(data);
            break;
        case 'SCHEDULE_TEST_NOTIFICATION':
            scheduleTestNotification(data);
            break;
        case 'SCHEDULE_LECTURE_NOTIFICATIONS':
            scheduleLectureNotifications(data);
            break;
    }
});

function scheduleLectureNotification(data) {
    const { title, body, delay, lectureId, notificationType } = data;
    
    if (delay <= 0) return;

    const timeoutId = setTimeout(() => {
        self.registration.showNotification(title, {
            body: body,
            icon: './icon-192.png',
            badge: './icon-192.png',
            tag: `${notificationType}-${lectureId}`,
            requireInteraction: true,
            vibrate: [200, 100, 200],
            silent: false,
            timestamp: Date.now(),
            actions: [
                {
                    action: 'view',
                    title: 'عرض',
                    icon: './icon-192.png'
                },
                {
                    action: 'dismiss',
                    title: 'إغلاق',
                    icon: './icon-192.png'
                }
            ],
            data: {
                type: 'lecture',
                lectureId: lectureId,
                notificationType: notificationType,
                timestamp: Date.now()
            }
        });
        
        notificationTimeouts.delete(`${notificationType}_${lectureId}`);
    }, delay);

    notificationTimeouts.set(`${notificationType}_${lectureId}`, timeoutId);
}

function scheduleTestNotification(data) {
    const { title, body, delay } = data;
    
    setTimeout(() => {
        self.registration.showNotification(title, {
            body: body,
            icon: './icon-192.png',
            badge: './icon-192.png',
            tag: 'test-notification',
            requireInteraction: true,
            vibrate: [500, 200, 500],
            silent: false,
            timestamp: Date.now(),
            data: {
                type: 'test',
                timestamp: Date.now()
            }
        });
    }, delay);
}

function scheduleLectureNotifications(data) {
    // إلغاء جميع الإشعارات المجدولة السابقة
    notificationTimeouts.forEach(timeout => clearTimeout(timeout));
    notificationTimeouts.clear();
    
    console.log('Service Worker: Scheduling notifications for lectures');
}

// معالجة النقر على الإشعار
self.addEventListener('notificationclick', (event) => {
    console.log('Notification clicked:', event.notification.data);
    
    event.notification.close();

    // التعامل مع الإجراءات
    if (event.action === 'dismiss') {
        return;
    }

    // فتح التطبيق أو التركيز عليه
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // البحث عن نافذة مفتوحة بالفعل
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin)) {
                        return client.focus();
                    }
                }
                // فتح نافذة جديدة إذا لم توجد
                return clients.openWindow('./');
            })
    );
});

// معالجة إغلاق الإشعار
self.addEventListener('notificationclose', (event) => {
    console.log('Notification closed:', event.notification.data);
});

// التحقق من الإشعارات الدورية (مستقبلي)
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'lecture-notifications') {
        event.waitUntil(checkUpcomingLectures());
    }
});

async function checkUpcomingLectures() {
    console.log('Service Worker: Checking upcoming lectures');
    // يمكن إضافة منطق إضافي هنا للتحقق من المحاضرات القادمة
}
