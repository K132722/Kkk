
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
                vibrate: [200, 100, 200],
                silent: false,
                actions: [
                    {
                        action: 'view',
                        title: 'عرض التفاصيل'
                    }
                ]
            });
        }, delay);
    }
});

// التعامل مع الإشعارات المجدولة من التطبيق الرئيسي
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SCHEDULE_LECTURE_NOTIFICATIONS') {
        const { lectures } = event.data;
        
        // جدولة إشعارات المحاضرات في Service Worker
        lectures.forEach(lecture => {
            scheduleLectureInBackground(lecture);
        });
    }
});

function scheduleLectureInBackground(lecture) {
    const now = new Date();
    const [hours, minutes] = lecture.startTime.split(':').map(Number);
    
    // حساب وقت المحاضرة
    const lectureTime = new Date();
    lectureTime.setHours(hours, minutes, 0, 0);
    
    // إذا كان وقت المحاضرة قد مضى اليوم، جدول للغد
    if (lectureTime <= now) {
        lectureTime.setDate(lectureTime.getDate() + 1);
    }
    
    // إشعار قبل 5 دقائق
    const reminderTime = new Date(lectureTime.getTime() - 5 * 60 * 1000);
    
    if (reminderTime > now) {
        const delay = reminderTime.getTime() - now.getTime();
        
        setTimeout(() => {
            self.registration.showNotification('تذكير: محاضرة قريبة ⏰', {
                body: `محاضرة ${lecture.subject} ستبدأ بعد 5 دقائق مع ${lecture.professor} في القاعة ${lecture.room}`,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: `reminder-${lecture.id}`,
                requireInteraction: true,
                vibrate: [200, 100, 200, 100, 200],
                silent: false,
                timestamp: reminderTime.getTime(),
                actions: [
                    {
                        action: 'view',
                        title: 'عرض الجدول'
                    },
                    {
                        action: 'dismiss',
                        title: 'إغلاق'
                    }
                ]
            });
        }, delay);
    }
    
    // إشعار عند بداية المحاضرة
    if (lectureTime > now) {
        const delay = lectureTime.getTime() - now.getTime();
        
        setTimeout(() => {
            self.registration.showNotification('بداية المحاضرة 🎓', {
                body: `محاضرة ${lecture.subject} بدأت الآن في القاعة ${lecture.room}`,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: `start-${lecture.id}`,
                requireInteraction: true,
                vibrate: [300, 100, 300, 100, 300],
                silent: false,
                timestamp: lectureTime.getTime(),
                actions: [
                    {
                        action: 'view',
                        title: 'عرض التفاصيل'
                    }
                ]
            });
        }, delay);
    }
}
