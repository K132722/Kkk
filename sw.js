

const CACHE_NAME = 'lecture-schedule-v6';
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

// متغيرات لتخزين جدول المحاضرات والإشعارات المجدولة
let lectureSchedule = [];
let scheduledNotifications = new Map();
let notificationIntervals = new Map();

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
            
            // بدء نظام فحص الإشعارات الدوري
            startNotificationChecker();
            
            return self.clients.claim();
        })
    );
});

// استراتيجية Cache First - للعمل بدون إنترنت
self.addEventListener('fetch', (event) => {
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
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }

                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });

                        return response;
                    })
                    .catch(() => {
                        if (event.request.destination === 'document') {
                            return caches.match('./index.html');
                        }
                    });
            })
    );
});

// معالجة الرسائل من التطبيق الرئيسي
self.addEventListener('message', (event) => {
    const { type, ...data } = event.data;
    console.log('Service Worker received message:', type, data);

    switch (type) {
        case 'UPDATE_LECTURE_SCHEDULE':
            updateLectureSchedule(data);
            break;
        case 'SCHEDULE_PRECISE_NOTIFICATION':
            schedulePreciseNotification(data.notification);
            break;
        case 'SCHEDULE_TEST_NOTIFICATION':
            scheduleTestNotification(data);
            break;
        case 'INIT_LECTURE_SCHEDULE':
            initializeLectureSchedule(data);
            break;
    }
});

// تهيئة جدول المحاضرات
function initializeLectureSchedule(data) {
    lectureSchedule = data.lectures || [];
    console.log('Service Worker: Initialized with lecture schedule:', lectureSchedule.length, 'lectures');
    
    // جدولة جميع الإشعارات
    scheduleAllLectureNotifications();
}

// تحديث جدول المحاضرات
function updateLectureSchedule(data) {
    lectureSchedule = data.lectures || [];
    console.log('Service Worker: Updated lecture schedule:', lectureSchedule.length, 'lectures');
    
    // إلغاء جميع الإشعارات المجدولة وإعادة جدولتها
    clearAllScheduledNotifications();
    scheduleAllLectureNotifications();
}

// جدولة إشعار دقيق
function schedulePreciseNotification(notification) {
    const now = Date.now();
    const delay = notification.scheduledTime - now;
    
    if (delay <= 0) {
        // إرسال الإشعار فوراً إذا كان الوقت قد حان أو مضى
        console.log('Service Worker: Sending immediate notification:', notification.title);
        showNotification(notification);
        return;
    }

    // إلغاء أي إشعار مجدول بنفس المعرف
    if (scheduledNotifications.has(notification.tag)) {
        clearTimeout(scheduledNotifications.get(notification.tag));
    }

    console.log(`Service Worker: Scheduling notification "${notification.title}" in ${Math.round(delay/1000)} seconds`);

    // جدولة الإشعار
    const timeoutId = setTimeout(() => {
        console.log('Service Worker: Sending scheduled notification:', notification.title);
        showNotification(notification);
        scheduledNotifications.delete(notification.tag);
    }, delay);

    scheduledNotifications.set(notification.tag, timeoutId);
}

// إرسال إشعار تجريبي
function scheduleTestNotification(data) {
    const { title, body, delay } = data;
    
    setTimeout(() => {
        showNotification({
            title: title,
            body: body,
            icon: './icon-192.png',
            badge: './icon-192.png',
            tag: 'test-notification-' + Date.now(),
            requireInteraction: true,
            vibrate: [500, 200, 500],
            silent: false,
            data: { type: 'test', timestamp: Date.now() }
        });
    }, delay || 0);
}

// جدولة جميع إشعارات المحاضرات
function scheduleAllLectureNotifications() {
    if (!lectureSchedule || lectureSchedule.length === 0) {
        console.log('Service Worker: No lectures to schedule');
        return;
    }

    const now = new Date();
    const dayKeys = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
    const currentDayIndex = now.getDay() === 0 ? 1 : now.getDay() === 6 ? 0 : now.getDay() + 1;

    console.log('Service Worker: Scheduling notifications for', lectureSchedule.length, 'lectures');

    lectureSchedule.forEach(lecture => {
        const lectureDay = dayKeys.indexOf(lecture.day);
        if (lectureDay === -1) return;

        const [hours, minutes] = lecture.startTime.split(':').map(Number);

        // جدولة للأسبوع الحالي والقادم
        for (let weekOffset = 0; weekOffset <= 1; weekOffset++) {
            for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
                const targetDate = new Date(now);
                targetDate.setDate(targetDate.getDate() + (weekOffset * 7) + dayOffset);
                
                if (targetDate.getDay() === (lectureDay === 0 ? 6 : lectureDay === 1 ? 0 : lectureDay - 1)) {
                    const lectureTime = new Date(targetDate);
                    lectureTime.setHours(hours, minutes, 0, 0);
                    
                    const reminderTime = new Date(lectureTime.getTime() - 5 * 60 * 1000);

                    // جدولة تذكير (قبل 5 دقائق)
                    if (reminderTime > now) {
                        const notificationId = `reminder-${lecture.id}-${weekOffset}-${dayOffset}`;
                        schedulePreciseNotification({
                            title: 'تذكير: محاضرة قريبة ⏰',
                            body: `محاضرة ${lecture.subject} ستبدأ بعد 5 دقائق مع ${lecture.professor} في القاعة ${lecture.room} - مدة المحاضرة: ${formatDuration(lecture.duration)}`,
                            scheduledTime: reminderTime.getTime(),
                            tag: notificationId,
                            icon: './icon-192.png',
                            badge: './icon-192.png',
                            requireInteraction: true,
                            vibrate: [500, 200, 500, 200, 500],
                            silent: false,
                            data: {
                                lectureId: lecture.id,
                                type: 'reminder',
                                subject: lecture.subject,
                                professor: lecture.professor,
                                room: lecture.room
                            }
                        });
                    }

                    // جدولة إشعار البداية
                    if (lectureTime > now) {
                        const notificationId = `start-${lecture.id}-${weekOffset}-${dayOffset}`;
                        schedulePreciseNotification({
                            title: 'بداية المحاضرة 🎓',
                            body: `محاضرة ${lecture.subject} بدأت الآن مع ${lecture.professor} في القاعة ${lecture.room} - مدة المحاضرة: ${formatDuration(lecture.duration)}`,
                            scheduledTime: lectureTime.getTime(),
                            tag: notificationId,
                            icon: './icon-192.png',
                            badge: './icon-192.png',
                            requireInteraction: true,
                            vibrate: [800, 200, 800, 200, 800],
                            silent: false,
                            data: {
                                lectureId: lecture.id,
                                type: 'start',
                                subject: lecture.subject,
                                professor: lecture.professor,
                                room: lecture.room
                            }
                        });
                    }
                }
            }
        }
    });

    console.log(`Service Worker: Scheduled ${scheduledNotifications.size} notifications`);
}

// إرسال الإشعار
function showNotification(notification) {
    try {
        self.registration.showNotification(notification.title, {
            body: notification.body,
            icon: notification.icon || './icon-192.png',
            badge: notification.badge || './icon-192.png',
            tag: notification.tag,
            requireInteraction: notification.requireInteraction !== false,
            vibrate: notification.vibrate || [500, 200, 500],
            silent: notification.silent === true,
            timestamp: Date.now(),
            actions: [
                { action: 'view', title: 'عرض', icon: './icon-192.png' },
                { action: 'dismiss', title: 'إغلاق', icon: './icon-192.png' }
            ],
            data: notification.data || { type: 'lecture', timestamp: Date.now() }
        });
        console.log('Service Worker: Notification sent successfully:', notification.title);
    } catch (error) {
        console.error('Service Worker: Failed to show notification:', error);
    }
}

// إلغاء جميع الإشعارات المجدولة
function clearAllScheduledNotifications() {
    console.log('Service Worker: Clearing', scheduledNotifications.size, 'scheduled notifications');
    scheduledNotifications.forEach(timeoutId => clearTimeout(timeoutId));
    scheduledNotifications.clear();
    
    notificationIntervals.forEach(intervalId => clearInterval(intervalId));
    notificationIntervals.clear();
}

// تنسيق مدة المحاضرة
function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours > 0 && remainingMinutes > 0) {
        return `${hours} ساعة و ${remainingMinutes} دقيقة`;
    } else if (hours > 0) {
        return `${hours} ساعة`;
    } else {
        return `${remainingMinutes} دقيقة`;
    }
}

// نظام فحص دوري للإشعارات (كل دقيقة)
function startNotificationChecker() {
    // فحص كل دقيقة للتأكد من عدم تفويت أي إشعار
    const checkInterval = setInterval(() => {
        if (lectureSchedule.length > 0) {
            checkUpcomingLectures();
        }
    }, 60000); // كل دقيقة

    notificationIntervals.set('main-checker', checkInterval);
    console.log('Service Worker: Started notification checker');
}

// فحص المحاضرات القادمة
function checkUpcomingLectures() {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const currentDay = getCurrentDayKey(now);

    lectureSchedule.forEach(lecture => {
        if (lecture.day === currentDay) {
            const [hours, minutes] = lecture.startTime.split(':').map(Number);
            const lectureTime = hours * 60 + minutes;
            const timeDiff = lectureTime - currentTime;

            // إشعار قبل 5 دقائق
            if (timeDiff === 5) {
                showNotification({
                    title: 'تذكير: محاضرة قريبة ⏰',
                    body: `محاضرة ${lecture.subject} ستبدأ بعد 5 دقائق مع ${lecture.professor} في القاعة ${lecture.room}`,
                    tag: `emergency-reminder-${lecture.id}`,
                    icon: './icon-192.png',
                    requireInteraction: true,
                    vibrate: [500, 200, 500, 200, 500],
                    data: { lectureId: lecture.id, type: 'emergency-reminder' }
                });
            }

            // إشعار عند بداية المحاضرة
            if (timeDiff === 0) {
                showNotification({
                    title: 'بداية المحاضرة 🎓',
                    body: `محاضرة ${lecture.subject} بدأت الآن مع ${lecture.professor} في القاعة ${lecture.room}`,
                    tag: `emergency-start-${lecture.id}`,
                    icon: './icon-192.png',
                    requireInteraction: true,
                    vibrate: [800, 200, 800, 200, 800],
                    data: { lectureId: lecture.id, type: 'emergency-start' }
                });
            }
        }
    });
}

// الحصول على مفتاح اليوم الحالي
function getCurrentDayKey(date) {
    const dayMap = { 6: 'saturday', 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday' };
    return dayMap[date.getDay()];
}

// معالجة النقر على الإشعار
self.addEventListener('notificationclick', (event) => {
    console.log('Service Worker: Notification clicked:', event.notification.data);
    
    event.notification.close();

    if (event.action === 'dismiss') {
        return;
    }

    // فتح التطبيق أو التركيز عليه
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin)) {
                        return client.focus();
                    }
                }
                return clients.openWindow('./');
            })
    );
});

// معالجة إغلاق الإشعار
self.addEventListener('notificationclose', (event) => {
    console.log('Service Worker: Notification closed:', event.notification.data);
});

// معالجة المزامنة الدورية
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'lecture-check') {
        console.log('Service Worker: Periodic sync triggered');
        event.waitUntil(checkUpcomingLectures());
    }
});

console.log('Service Worker: Lecture notification system loaded');

