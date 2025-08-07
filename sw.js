
const CACHE_NAME = 'lecture-schedule-v7';
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
let persistentNotificationChecker = null;

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
                // تحميل البيانات المحفوظة فوراً
                loadStoredLectureData();
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
            
            // تحميل البيانات المحفوظة
            loadStoredLectureData();
            
            // بدء أنظمة الإشعارات المتعددة
            startPersistentNotificationSystem();
            
            return self.clients.claim();
        })
    );
});

// تحميل بيانات المحاضرات المحفوظة
function loadStoredLectureData() {
    try {
        // محاولة تحميل البيانات من IndexedDB أو localStorage
        if (typeof indexedDB !== 'undefined') {
            loadFromIndexedDB();
        } else {
            // الاعتماد على البيانات التجريبية إذا لم تكن متاحة
            lectureSchedule = getDefaultLectures();
            console.log('Service Worker: Loaded default lecture schedule');
            startPersistentNotificationSystem();
        }
    } catch (error) {
        console.error('Service Worker: Failed to load stored data, using defaults:', error);
        lectureSchedule = getDefaultLectures();
        startPersistentNotificationSystem();
    }
}

// بيانات تجريبية افتراضية
function getDefaultLectures() {
    return [
        {
            id: 1,
            day: 'saturday',
            startTime: '08:00',
            duration: 120,
            subject: 'الدوائر الكهربائية',
            professor: 'د. عادل راوع',
            room: 'D-403'
        },
        {
            id: 2,
            day: 'saturday',
            startTime: '10:00',
            duration: 90,
            subject: 'الرياضيات المتقدمة',
            professor: 'د. محمد أحمد',
            room: 'A-201'
        },
        {
            id: 3,
            day: 'sunday',
            startTime: '09:00',
            duration: 120,
            subject: 'برمجة الحاسوب',
            professor: 'د. سارة خالد',
            room: 'C-101'
        }
    ];
}

// تحميل البيانات من IndexedDB
function loadFromIndexedDB() {
    const request = indexedDB.open('LectureScheduleDB', 1);
    
    request.onerror = () => {
        console.log('Service Worker: IndexedDB not available, using defaults');
        lectureSchedule = getDefaultLectures();
        startPersistentNotificationSystem();
    };
    
    request.onsuccess = (event) => {
        const db = event.target.result;
        
        if (db.objectStoreNames.contains('lectures')) {
            const transaction = db.transaction(['lectures'], 'readonly');
            const store = transaction.objectStore('lectures');
            const getAllRequest = store.getAll();
            
            getAllRequest.onsuccess = () => {
                lectureSchedule = getAllRequest.result.length > 0 ? getAllRequest.result : getDefaultLectures();
                console.log('Service Worker: Loaded', lectureSchedule.length, 'lectures from IndexedDB');
                startPersistentNotificationSystem();
            };
            
            getAllRequest.onerror = () => {
                lectureSchedule = getDefaultLectures();
                startPersistentNotificationSystem();
            };
        } else {
            lectureSchedule = getDefaultLectures();
            startPersistentNotificationSystem();
        }
    };
    
    request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('lectures')) {
            const store = db.createObjectStore('lectures', { keyPath: 'id' });
            store.createIndex('day', 'day', { unique: false });
            store.createIndex('startTime', 'startTime', { unique: false });
        }
    };
}

// حفظ البيانات في IndexedDB
function saveToIndexedDB(lectures) {
    try {
        const request = indexedDB.open('LectureScheduleDB', 1);
        
        request.onsuccess = (event) => {
            const db = event.target.result;
            const transaction = db.transaction(['lectures'], 'readwrite');
            const store = transaction.objectStore('lectures');
            
            // مسح البيانات القديمة وحفظ الجديدة
            store.clear();
            lectures.forEach(lecture => {
                store.add(lecture);
            });
            
            console.log('Service Worker: Saved lectures to IndexedDB');
        };
    } catch (error) {
        console.error('Service Worker: Failed to save to IndexedDB:', error);
    }
}

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
    lectureSchedule = data.lectures || getDefaultLectures();
    console.log('Service Worker: Initialized with lecture schedule:', lectureSchedule.length, 'lectures');
    
    // حفظ في IndexedDB
    saveToIndexedDB(lectureSchedule);
    
    // إعادة تشغيل نظام الإشعارات
    restartNotificationSystem();
}

// تحديث جدول المحاضرات
function updateLectureSchedule(data) {
    lectureSchedule = data.lectures || lectureSchedule;
    console.log('Service Worker: Updated lecture schedule:', lectureSchedule.length, 'lectures');
    
    // حفظ في IndexedDB
    saveToIndexedDB(lectureSchedule);
    
    // إعادة تشغيل نظام الإشعارات
    restartNotificationSystem();
}

// إعادة تشغيل نظام الإشعارات
function restartNotificationSystem() {
    // إلغاء جميع الإشعارات والفواصل الزمنية
    clearAllScheduledNotifications();
    
    // بدء النظام من جديد
    startPersistentNotificationSystem();
}

// بدء نظام الإشعارات المستمر
function startPersistentNotificationSystem() {
    console.log('Service Worker: Starting persistent notification system');
    
    // نظام فحص كل دقيقة (أساسي)
    startMainNotificationChecker();
    
    // نظام فحص كل 30 ثانية (تأكيد إضافي)
    startBackupNotificationChecker();
    
    // جدولة الإشعارات المباشرة
    scheduleAllLectureNotifications();
    
    // نظام فحص دوري كل 10 دقائق لإعادة الجدولة
    startPeriodicRescheduler();
}

// فاحص الإشعارات الرئيسي (كل دقيقة)
function startMainNotificationChecker() {
    if (notificationIntervals.has('main-checker')) {
        clearInterval(notificationIntervals.get('main-checker'));
    }
    
    const mainInterval = setInterval(() => {
        checkAndSendNotifications();
    }, 60000); // كل دقيقة
    
    notificationIntervals.set('main-checker', mainInterval);
    console.log('Service Worker: Started main notification checker (every minute)');
}

// فاحص الإشعارات الاحتياطي (كل 30 ثانية)
function startBackupNotificationChecker() {
    if (notificationIntervals.has('backup-checker')) {
        clearInterval(notificationIntervals.get('backup-checker'));
    }
    
    const backupInterval = setInterval(() => {
        checkAndSendNotifications();
    }, 30000); // كل 30 ثانية
    
    notificationIntervals.set('backup-checker', backupInterval);
    console.log('Service Worker: Started backup notification checker (every 30 seconds)');
}

// مجدول الإشعارات الدوري (كل 10 دقائق)
function startPeriodicRescheduler() {
    if (notificationIntervals.has('rescheduler')) {
        clearInterval(notificationIntervals.get('rescheduler'));
    }
    
    const reschedulerInterval = setInterval(() => {
        console.log('Service Worker: Rescheduling all notifications');
        scheduleAllLectureNotifications();
    }, 600000); // كل 10 دقائق
    
    notificationIntervals.set('rescheduler', reschedulerInterval);
    console.log('Service Worker: Started periodic rescheduler (every 10 minutes)');
}

// فحص وإرسال الإشعارات
function checkAndSendNotifications() {
    if (!lectureSchedule || lectureSchedule.length === 0) {
        return;
    }

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const currentDay = getCurrentDayKey(now);

    lectureSchedule.forEach(lecture => {
        if (lecture.day === currentDay) {
            const [hours, minutes] = lecture.startTime.split(':').map(Number);
            const lectureTime = hours * 60 + minutes;
            const timeDiff = lectureTime - currentTime;
            const lectureDuration = formatDuration(lecture.duration);

            // إشعار قبل 5 دقائق (مع هامش خطأ ±1 دقيقة)
            if (timeDiff >= 4 && timeDiff <= 6) {
                const notificationId = `reminder-${lecture.id}-${now.getDate()}`;
                if (!hasNotificationBeenSent(notificationId)) {
                    markNotificationAsSent(notificationId);
                    showNotification({
                        title: 'تذكير: محاضرة قريبة ⏰',
                        body: `محاضرة ${lecture.subject} ستبدأ بعد 5 دقائق مع ${lecture.professor} في القاعة ${lecture.room} - مدة المحاضرة: ${lectureDuration}`,
                        tag: notificationId,
                        icon: './icon-192.png',
                        requireInteraction: true,
                        vibrate: [500, 200, 500, 200, 500],
                        data: { lectureId: lecture.id, type: 'reminder' }
                    });
                }
            }

            // إشعار عند بداية المحاضرة (مع هامش خطأ ±2 دقيقة)
            if (timeDiff >= -2 && timeDiff <= 2) {
                const notificationId = `start-${lecture.id}-${now.getDate()}`;
                if (!hasNotificationBeenSent(notificationId)) {
                    markNotificationAsSent(notificationId);
                    showNotification({
                        title: 'بداية المحاضرة 🎓',
                        body: `محاضرة ${lecture.subject} بدأت الآن مع ${lecture.professor} في القاعة ${lecture.room} - مدة المحاضرة: ${lectureDuration}`,
                        tag: notificationId,
                        icon: './icon-192.png',
                        requireInteraction: true,
                        vibrate: [800, 200, 800, 200, 800],
                        data: { lectureId: lecture.id, type: 'start' }
                    });
                }
            }
        }
    });
}

// تتبع الإشعارات المرسلة
let sentNotifications = new Set();

function hasNotificationBeenSent(notificationId) {
    return sentNotifications.has(notificationId);
}

function markNotificationAsSent(notificationId) {
    sentNotifications.add(notificationId);
    
    // مسح الإشعارات القديمة (أكثر من يومين)
    if (sentNotifications.size > 100) {
        const notificationsArray = Array.from(sentNotifications);
        sentNotifications = new Set(notificationsArray.slice(-50));
    }
}

// جدولة إشعار دقيق
function schedulePreciseNotification(notification) {
    const now = Date.now();
    const delay = notification.scheduledTime - now;
    
    if (delay <= 0) {
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
    console.log('Service Worker: Scheduling notifications for', lectureSchedule.length, 'lectures');

    lectureSchedule.forEach(lecture => {
        scheduleNotificationsForLecture(lecture, now);
    });

    console.log(`Service Worker: Total scheduled notifications: ${scheduledNotifications.size}`);
}

// جدولة إشعارات لمحاضرة واحدة
function scheduleNotificationsForLecture(lecture, now) {
    const dayKeys = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
    const lectureDay = dayKeys.indexOf(lecture.day);
    if (lectureDay === -1) return;

    const [hours, minutes] = lecture.startTime.split(':').map(Number);
    const lectureDuration = formatDuration(lecture.duration);

    // جدولة للأسبوع الحالي والقادم والذي بعده
    for (let weekOffset = 0; weekOffset <= 2; weekOffset++) {
        for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
            const targetDate = new Date(now);
            targetDate.setDate(targetDate.getDate() + (weekOffset * 7) + dayOffset);
            
            const targetDayIndex = targetDate.getDay();
            const adjustedTargetDay = targetDayIndex === 0 ? 6 : targetDayIndex - 1;
            
            if (adjustedTargetDay === lectureDay) {
                const lectureTime = new Date(targetDate);
                lectureTime.setHours(hours, minutes, 0, 0);
                
                const reminderTime = new Date(lectureTime.getTime() - 5 * 60 * 1000);

                // جدولة تذكير (قبل 5 دقائق)
                if (reminderTime > now) {
                    const notificationId = `reminder-${lecture.id}-${weekOffset}-${dayOffset}`;
                    schedulePreciseNotification({
                        title: 'تذكير: محاضرة قريبة ⏰',
                        body: `محاضرة ${lecture.subject} ستبدأ بعد 5 دقائق مع ${lecture.professor} في القاعة ${lecture.room} - مدة المحاضرة: ${lectureDuration}`,
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
                        body: `محاضرة ${lecture.subject} بدأت الآن مع ${lecture.professor} في القاعة ${lecture.room} - مدة المحاضرة: ${lectureDuration}`,
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
        event.waitUntil(checkAndSendNotifications());
    }
});

// تشغيل نظام الإشعارات عند تحميل الـ Service Worker
console.log('Service Worker: Lecture notification system loaded');

// بدء النظام بعد ثانية واحدة للتأكد من التحميل الكامل
setTimeout(() => {
    if (lectureSchedule.length === 0) {
        loadStoredLectureData();
    } else {
        startPersistentNotificationSystem();
    }
}, 1000);
// في بداية الملف بعد المتغيرات
const VAPID_PUBLIC_KEY = 'BIjzsU9yiNL5ZTiw12QI2NYuPbLcdq4WdoLvTRBsd5dLiIhpGhMpi56jQEd830v-mPsqqwFWMPziZcbp4S-wc18';

// أضف هذا المستمع الجديد
self.addEventListener('push', (event) => {
    console.log('Push event received:', event);

    let notificationData = {};
    try {
        if (event.data) {
            notificationData = event.data.json();
        } else {
            notificationData = {
                title: 'تذكير محاضرة',
                body: 'لديك محاضرة قريبة',
                icon: './icon-192.png'
            };
        }
    } catch (e) {
        notificationData = {
            title: 'تذكير',
            body: 'لديك إشعار جديد',
            icon: './icon-192.png'
        };
    }

    event.waitUntil(
        self.registration.showNotification(notificationData.title, {
            body: notificationData.body,
            icon: notificationData.icon || './icon-192.png',
            badge: './icon-192.png',
            vibrate: [500, 200, 500],
            data: notificationData.data || {}
        })
    );
});

// أضف هذا المستمع للاشتراك في Push
self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil(
        self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: VAPID_PUBLIC_KEY
        }).then((subscription) => {
            console.log('Subscription renewed:', subscription);
            return fetch(`${self.registration.scope}api/subscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    subscription: subscription,
                    userId: self.userId
                })
            });
        })
    );
});