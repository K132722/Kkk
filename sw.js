const CACHE_NAME = 'lecture-schedule-v4';
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
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('تم تثبيت Service Worker وتخزين الملفات في الكاش');
                return cache.addAll(urlsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

// تفعيل Service Worker
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('حذف الكاش القديم:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('Service Worker مفعل');
            return self.clients.claim();
        })
    );
});

// جلب الملفات من الكاش
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                return response || fetch(event.request);
            })
    );
});

// معالجة الإشعارات الواردة
self.addEventListener('push', (event) => {
    const data = event.data.json();
    const options = {
        body: data.body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200],
        data: {
            url: data.url || '/',
            lectureId: data.lectureId
        }
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// معالجة النقر على الإشعار
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                for (const client of clientList) {
                    if (client.url.includes(event.notification.data.url)) {
                        return client.focus();
                    }
                }
                return clients.openWindow(event.notification.data.url);
            })
    );
});

// جدولة الإشعارات الدورية (للاستخدام المستقبلي)
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'check-lectures') {
        event.waitUntil(checkForUpcomingLectures());
    }
});

async function checkForUpcomingLectures() {
    const now = new Date();
    const response = await fetch('/api/upcoming-lectures');
    const lectures = await response.json();

    lectures.forEach((lecture) => {
        const lectureTime = new Date(lecture.time);
        const timeDiff = lectureTime - now;

        if (timeDiff > 0 && timeDiff < 30 * 60 * 1000) { // 30 دقيقة القادمة
            self.registration.showNotification(`محاضرة قريبة: ${lecture.subject}`, {
                body: `ستبدأ خلال ${Math.round(timeDiff / (60 * 1000))} دقائق`,
                icon: '/icon-192.png'
            });
        }
    });
}