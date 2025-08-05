class LectureScheduleApp {
    constructor() {
        this.lectures = this.loadLectures();
        this.editingLecture = null;
        this.notificationPermission = 'default';
        this.notificationTimeouts = new Map();
        this.serviceWorkerRegistration = null;

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.renderSchedule();
        await this.registerServiceWorker();
        this.checkNotificationPermission();
        this.scheduleAllNotifications();
        this.updateCurrentInfo();

        // تحديث الوقت كل ثانية
        setInterval(() => {
            this.updateCurrentInfo();
        }, 1000);

        // تحديث الجدول كل دقيقة للتحقق من المحاضرات
        setInterval(() => {
            this.scheduleAllNotifications();
        }, 60000);
    }

    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                this.serviceWorkerRegistration = await navigator.serviceWorker.register('./sw.js', {
                    scope: './'
                });
                console.log('Service Worker registered successfully');

                // انتظار تفعيل Service Worker
                if (this.serviceWorkerRegistration.installing) {
                    await new Promise((resolve) => {
                        this.serviceWorkerRegistration.installing.addEventListener('statechange', (e) => {
                            if (e.target.state === 'activated') {
                                resolve();
                            }
                        });
                    });
                }

                // طلب إذن المزامنة في الخلفية
                if ('periodicSync' in window && this.serviceWorkerRegistration.sync) {
                    try {
                        await this.serviceWorkerRegistration.sync.register('lecture-notifications');
                        console.log('Background sync registered');
                    } catch (error) {
                        console.log('Background sync not supported:', error);
                    }
                }

                // إضافة مستمع لتحديثات Service Worker
                this.serviceWorkerRegistration.addEventListener('updatefound', () => {
                    const newWorker = this.serviceWorkerRegistration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // إظهار إشعار بوجود تحديث
                            this.showAppNotification('يتوفر تحديث جديد. سيتم التحديث عند إعادة تحميل الصفحة.', 'info');
                        }
                    });
                });

            } catch (error) {
                console.error('Service Worker registration failed:', error);
                this.showAppNotification('فشل في تسجيل الخدمة. بعض الميزات قد لا تعمل بدون إنترنت.', 'warning');
            }
        } else {
            console.log('Service Worker not supported');
            this.showAppNotification('متصفحك لا يدعم العمل بدون إنترنت', 'warning');
        }
    }

    setupEventListeners() {
        // أزرار الرأس
        document.getElementById('notificationBtn').addEventListener('click', () => {
            this.requestNotificationPermission();
        });

        document.getElementById('addLectureBtn').addEventListener('click', () => {
            this.openLectureModal();
        });

        document.getElementById('testNotificationBtn').addEventListener('click', () => {
            this.testNotification();
        });

        // Modal
        document.querySelector('.close').addEventListener('click', () => {
            this.closeLectureModal();
        });

        document.getElementById('cancelBtn').addEventListener('click', () => {
            this.closeLectureModal();
        });

        document.getElementById('deleteBtn').addEventListener('click', () => {
            this.deleteLecture();
        });

        // Form
        document.getElementById('lectureForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveLecture();
        });

        // إغلاق Modal عند النقر خارجه
        document.getElementById('lectureModal').addEventListener('click', (e) => {
            if (e.target.id === 'lectureModal') {
                this.closeLectureModal();
            }
        });
    }

    async requestNotificationPermission() {
        if (!('Notification' in window)) {
            this.showAppNotification('الإشعارات غير مدعومة في هذا المتصفح', 'warning');
            return;
        }

        // طلب الإذن أولاً
        let permission = await Notification.requestPermission();
        
        // للأجهزة التي تتطلب إجراءات إضافية (مثل iOS)
        if (permission === 'default') {
            // محاولة ثانية بعد تفاعل المستخدم
            permission = await Notification.requestPermission();
        }
        
        this.notificationPermission = permission;
        this.updateNotificationStatus();

        if (permission === 'granted') {
            this.showAppNotification('تم تفعيل الإشعارات بنجاح! ✅', 'success');
            
            // جدولة الإشعارات فوراً
            this.scheduleAllNotifications();

            // طلب أذونات إضافية للعمل في الخلفية
            try {
                // طلب إذن المزامنة في الخلفية
                if (this.serviceWorkerRegistration && 'periodicSync' in window) {
                    await this.serviceWorkerRegistration.periodicSync.register('lecture-notifications', {
                        minInterval: 6 * 60 * 60 * 1000 // كل 6 ساعات
                    });
                    console.log('Periodic background sync registered');
                }

                // طلب إذن البقاء في الخلفية (للأجهزة المدعومة)
                if ('wakeLock' in navigator) {
                    console.log('Wake Lock API available');
                }

                // إرسال إشعار تأكيد
                setTimeout(() => {
                    this.sendNotification(
                        'تم تفعيل نظام التذكير! 🎓',
                        'سيتم إرسال تذكيرات قبل 5 دقائق من بداية كل محاضرة وعند بدايتها. النظام يعمل حتى عند إغلاق التطبيق.',
                        {
                            type: 'setup',
                            tag: 'setup-confirmation',
                            requireInteraction: true,
                            vibrate: [200, 100, 200]
                        }
                    );
                }, 2000);

            } catch (error) {
                console.error('Failed to register background features:', error);
            }
        } else if (permission === 'denied') {
            this.showAppNotification('تم رفض إذن الإشعارات. يمكنك تفعيلها من إعدادات المتصفح.', 'warning');
        } else {
            this.showAppNotification('لم يتم منح إذن الإشعارات', 'warning');
        }
    }

    checkNotificationPermission() {
        if ('Notification' in window) {
            this.notificationPermission = Notification.permission;
        }
        this.updateNotificationStatus();
    }

    updateNotificationStatus() {
        const statusEl = document.getElementById('notificationStatus');
        const btnEl = document.getElementById('notificationBtn');
        const testBtnEl = document.getElementById('testNotificationBtn');

        if (this.notificationPermission === 'granted') {
            statusEl.textContent = 'الإشعارات مفعلة ✅';
            statusEl.className = 'notification-status enabled';
            btnEl.textContent = 'الإشعارات مفعلة';
            btnEl.disabled = true;
            testBtnEl.style.display = 'inline-block';
        } else {
            statusEl.textContent = 'الإشعارات غير مفعلة - انقر لتفعيلها';
            statusEl.className = 'notification-status disabled';
            btnEl.textContent = 'تفعيل الإشعارات';
            btnEl.disabled = false;
            testBtnEl.style.display = 'none';
        }
    }

    loadLectures() {
        const stored = localStorage.getItem('lectures');
        if (stored) {
            return JSON.parse(stored);
        }

        // بيانات تجريبية
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

    saveLectures() {
        localStorage.setItem('lectures', JSON.stringify(this.lectures));
    }

    renderSchedule() {
        const grid = document.getElementById('scheduleGrid');
        const days = [
            { key: 'saturday', name: 'السبت' },
            { key: 'sunday', name: 'الأحد' },
            { key: 'monday', name: 'الاثنين' },
            { key: 'tuesday', name: 'الثلاثاء' },
            { key: 'wednesday', name: 'الأربعاء' },
            { key: 'thursday', name: 'الخميس' }
        ];

        grid.innerHTML = '';

        days.forEach(day => {
            const dayLectures = this.lectures
                .filter(lecture => lecture.day === day.key)
                .sort((a, b) => a.startTime.localeCompare(b.startTime));

            const dayColumn = document.createElement('div');
            dayColumn.className = 'day-column';

            const dayHeader = document.createElement('div');
            dayHeader.className = 'day-header';
            dayHeader.textContent = day.name;

            dayColumn.appendChild(dayHeader);

            if (dayLectures.length === 0) {
                const noLectures = document.createElement('div');
                noLectures.className = 'no-lectures';
                noLectures.textContent = 'لا توجد محاضرات';
                dayColumn.appendChild(noLectures);
            } else {
                dayLectures.forEach(lecture => {
                    const lectureEl = this.createLectureElement(lecture);
                    dayColumn.appendChild(lectureEl);
                });
            }

            grid.appendChild(dayColumn);
        });
    }

    createLectureElement(lecture) {
        const lectureEl = document.createElement('div');
        lectureEl.className = 'lecture-item';
        lectureEl.addEventListener('click', () => {
            this.editLecture(lecture);
        });

        const endTime = this.calculateEndTime(lecture.startTime, lecture.duration);

        lectureEl.innerHTML = `
            <div class="lecture-time">${lecture.startTime} - ${endTime}</div>
            <div class="lecture-subject">${lecture.subject}</div>
            <div class="lecture-professor">${lecture.professor}</div>
            <div class="lecture-room">القاعة: ${lecture.room}</div>
            <div class="lecture-duration">المدة: ${this.formatDuration(lecture.duration)}</div>
        `;

        return lectureEl;
    }

    calculateEndTime(startTime, duration) {
        const [hours, minutes] = startTime.split(':').map(Number);
        const endMinutes = hours * 60 + minutes + duration;
        const endHours = Math.floor(endMinutes / 60) % 24;
        const endMins = endMinutes % 60;
        return `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
    }

    openLectureModal(lecture = null) {
        const modal = document.getElementById('lectureModal');
        const form = document.getElementById('lectureForm');
        const title = document.getElementById('modalTitle');
        const deleteBtn = document.getElementById('deleteBtn');

        this.editingLecture = lecture;

        if (lecture) {
            title.textContent = 'تعديل المحاضرة';
            document.getElementById('day').value = lecture.day;
            document.getElementById('startTime').value = lecture.startTime;
            document.getElementById('duration').value = lecture.duration;
            document.getElementById('subject').value = lecture.subject;
            document.getElementById('professor').value = lecture.professor;
            document.getElementById('room').value = lecture.room;
            deleteBtn.style.display = 'block';
        } else {
            title.textContent = 'إضافة محاضرة جديدة';
            form.reset();
            deleteBtn.style.display = 'none';
        }

        modal.style.display = 'block';
    }

    closeLectureModal() {
        document.getElementById('lectureModal').style.display = 'none';
        this.editingLecture = null;
    }

    saveLecture() {
        const form = document.getElementById('lectureForm');
        const formData = new FormData(form);

        const lectureData = {
            day: document.getElementById('day').value,
            startTime: document.getElementById('startTime').value,
            duration: parseInt(document.getElementById('duration').value),
            subject: document.getElementById('subject').value,
            professor: document.getElementById('professor').value,
            room: document.getElementById('room').value
        };

        if (this.editingLecture) {
            // تعديل محاضرة موجودة
            const index = this.lectures.findIndex(l => l.id === this.editingLecture.id);
            this.lectures[index] = { ...lectureData, id: this.editingLecture.id };
            this.showAppNotification('تم تحديث المحاضرة بنجاح', 'success');
        } else {
            // إضافة محاضرة جديدة
            const newId = Math.max(...this.lectures.map(l => l.id), 0) + 1;
            this.lectures.push({ ...lectureData, id: newId });
            this.showAppNotification('تم إضافة المحاضرة بنجاح', 'success');
        }

        this.saveLectures();
        this.renderSchedule();
        this.scheduleAllNotifications();
        this.closeLectureModal();
    }

    editLecture(lecture) {
        this.openLectureModal(lecture);
    }

    deleteLecture() {
        if (this.editingLecture && confirm('هل أنت متأكد من حذف هذه المحاضرة؟')) {
            this.lectures = this.lectures.filter(l => l.id !== this.editingLecture.id);
            this.saveLectures();
            this.renderSchedule();
            this.scheduleAllNotifications();
            this.closeLectureModal();
            this.showAppNotification('تم حذف المحاضرة بنجاح', 'success');
        }
    }

    scheduleAllNotifications() {
        // إلغاء جميع الإشعارات المجدولة
        this.notificationTimeouts.forEach(timeout => clearTimeout(timeout));
        this.notificationTimeouts.clear();

        if (this.notificationPermission !== 'granted') {
            console.log('Notification permission not granted, cannot schedule notifications');
            return;
        }

        const now = new Date();
        const currentDay = this.getCurrentDayKey();

        console.log('Scheduling notifications for current day:', currentDay, 'at time:', now.toLocaleString('ar-SA'));

        this.lectures.forEach(lecture => {
            this.scheduleLectureNotifications(lecture, now, currentDay);
        });

        // إرسال المحاضرات إلى Service Worker للجدولة في الخلفية
        if (this.serviceWorkerRegistration && this.serviceWorkerRegistration.active) {
            this.serviceWorkerRegistration.active.postMessage({
                type: 'SCHEDULE_ALL_LECTURE_NOTIFICATIONS',
                lectures: this.lectures,
                currentDay: currentDay,
                currentTime: now.getTime()
            });
        }
    }

    getCurrentDayKey() {
        const dayMap = {
            6: 'saturday',
            0: 'sunday',
            1: 'monday',
            2: 'tuesday',
            3: 'wednesday',
            4: 'thursday'
        };
        return dayMap[new Date().getDay()];
    }

    getCurrentDayKeyForDate(date) {
        const dayMap = {
            6: 'saturday',
            0: 'sunday',
            1: 'monday',
            2: 'tuesday',
            3: 'wednesday',
            4: 'thursday'
        };
        return dayMap[date.getDay()];
    }

    scheduleLectureNotifications(lecture, now, currentDay) {
        const [hours, minutes] = lecture.startTime.split(':').map(Number);

        // حساب وقت المحاضرة لليوم الحالي
        const lectureTime = new Date(now);
        lectureTime.setHours(hours, minutes, 0, 0);

        const lectureDuration = this.formatDuration(lecture.duration);

        console.log(`Scheduling notifications for lecture: ${lecture.subject} at ${lecture.startTime} on ${lecture.day}`);
        console.log(`Current time: ${now.toLocaleTimeString('ar-SA')}, Lecture time: ${lectureTime.toLocaleTimeString('ar-SA')}`);

        // إذا كانت المحاضرة اليوم
        if (lecture.day === currentDay) {
            // إشعار قبل 5 دقائق
            const reminderTime = new Date(lectureTime.getTime() - 5 * 60 * 1000);
            if (reminderTime > now) {
                const delay = reminderTime.getTime() - now.getTime();
                console.log(`Reminder scheduled in ${Math.round(delay/1000)} seconds for lecture ${lecture.id}`);

                const reminderMessage = `محاضرة ${lecture.subject} ستبدأ بعد 5 دقائق مع ${lecture.professor} في القاعة ${lecture.room} - مدة المحاضرة: ${lectureDuration}`;

                // استخدام Service Worker للجدولة
                if (this.serviceWorkerRegistration && this.serviceWorkerRegistration.active) {
                    this.serviceWorkerRegistration.active.postMessage({
                        type: 'SCHEDULE_LECTURE_NOTIFICATION',
                        title: 'تذكير: محاضرة قريبة ⏰',
                        body: reminderMessage,
                        delay: delay,
                        lectureId: lecture.id,
                        notificationType: 'reminder',
                        scheduledTime: reminderTime.getTime(),
                        icon: './icon-192.png',
                        badge: './icon-192.png',
                        requireInteraction: true,
                        silent: false,
                        vibrate: [500, 200, 500, 200, 500]
                    });
                } else {
                    // جدولة مباشرة إذا لم يكن Service Worker متاحاً
                    const timeoutId = setTimeout(() => {
                        this.sendNotification(
                            'تذكير: محاضرة قريبة ⏰',
                            reminderMessage,
                            {
                                type: 'lecture',
                                tag: `reminder-${lecture.id}`,
                                vibrate: [500, 200, 500, 200, 500],
                                requireInteraction: true,
                                data: { lectureId: lecture.id, type: 'reminder' }
                            }
                        );
                    }, delay);
                    this.notificationTimeouts.set(`reminder_${lecture.id}`, timeoutId);
                }
            }

            // إشعار عند بداية المحاضرة
            if (lectureTime > now) {
                const delay = lectureTime.getTime() - now.getTime();
                console.log(`Start notification scheduled in ${Math.round(delay/1000)} seconds for lecture ${lecture.id}`);

                const startMessage = `محاضرة ${lecture.subject} بدأت الآن مع ${lecture.professor} في القاعة ${lecture.room} - مدة المحاضرة: ${lectureDuration}`;

                if (this.serviceWorkerRegistration && this.serviceWorkerRegistration.active) {
                    this.serviceWorkerRegistration.active.postMessage({
                        type: 'SCHEDULE_LECTURE_NOTIFICATION',
                        title: 'بداية المحاضرة 🎓',
                        body: startMessage,
                        delay: delay,
                        lectureId: lecture.id,
                        notificationType: 'start',
                        scheduledTime: lectureTime.getTime(),
                        icon: './icon-192.png',
                        badge: './icon-192.png',
                        requireInteraction: true,
                        silent: false,
                        vibrate: [800, 200, 800, 200, 800]
                    });
                } else {
                    const timeoutId = setTimeout(() => {
                        this.sendNotification(
                            'بداية المحاضرة 🎓',
                            startMessage,
                            {
                                type: 'lecture',
                                tag: `start-${lecture.id}`,
                                vibrate: [800, 200, 800, 200, 800],
                                requireInteraction: true,
                                data: { lectureId: lecture.id, type: 'start' }
                            }
                        );
                    }, delay);
                    this.notificationTimeouts.set(`start_${lecture.id}`, timeoutId);
                }
            }
        }

        // جدولة المحاضرات للأيام القادمة (لمدة أسبوع)
        for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
            const futureDate = new Date(now);
            futureDate.setDate(futureDate.getDate() + dayOffset);
            const futureDayKey = this.getCurrentDayKeyForDate(futureDate);

            if (futureDayKey === lecture.day) {
                const futureLectureTime = new Date(futureDate);
                futureLectureTime.setHours(hours, minutes, 0, 0);

                const futureReminderTime = new Date(futureLectureTime.getTime() - 5 * 60 * 1000);

                if (futureReminderTime > now) {
                    const delay = futureReminderTime.getTime() - now.getTime();
                    
                    // جدولة فقط للأسبوع القادم (تجنب الجدولة المفرطة)
                    if (delay <= 7 * 24 * 60 * 60 * 1000) { // أسبوع واحد
                        console.log(`Future reminder scheduled for ${futureLectureTime.toLocaleString('ar-SA')} in ${Math.round(delay/1000)} seconds`);

                        if (this.serviceWorkerRegistration && this.serviceWorkerRegistration.active) {
                            this.serviceWorkerRegistration.active.postMessage({
                                type: 'SCHEDULE_LECTURE_NOTIFICATION',
                                title: 'تذكير: محاضرة قريبة ⏰',
                                body: `محاضرة ${lecture.subject} ستبدأ بعد 5 دقائق مع ${lecture.professor} في القاعة ${lecture.room} - مدة المحاضرة: ${lectureDuration}`,
                                delay: delay,
                                lectureId: `${lecture.id}-future-${dayOffset}`,
                                notificationType: 'future_reminder',
                                scheduledTime: futureReminderTime.getTime()
                            });

                            this.serviceWorkerRegistration.active.postMessage({
                                type: 'SCHEDULE_LECTURE_NOTIFICATION',
                                title: 'بداية المحاضرة 🎓',
                                body: `محاضرة ${lecture.subject} بدأت الآن مع ${lecture.professor} في القاعة ${lecture.room} - مدة المحاضرة: ${lectureDuration}`,
                                delay: delay + (5 * 60 * 1000),
                                lectureId: `${lecture.id}-future-start-${dayOffset}`,
                                notificationType: 'future_start',
                                scheduledTime: futureLectureTime.getTime()
                            });
                        }
                    }
                }
                break; // توقف عند العثور على أول تكرار للمحاضرة
            }
        }
    }

    getDaysUntilNextOccurrence(lectureDay, currentDay) {
        const dayOrder = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
        const currentIndex = dayOrder.indexOf(currentDay);
        const lectureIndex = dayOrder.indexOf(lectureDay);

        if (lectureIndex > currentIndex) {
            return lectureIndex - currentIndex;
        } else if (lectureIndex < currentIndex) {
            return (6 - currentIndex) + lectureIndex + 1;
        } else {
            return 7; // الأسبوع القادم
        }
    }

    async sendNotification(title, body, options = {}) {
        if (this.notificationPermission !== 'granted') {
            console.log('Notification permission not granted');
            return;
        }

        try {
            console.log('Attempting to send notification:', title, body);

            if (this.serviceWorkerRegistration && this.serviceWorkerRegistration.active) {
                // استخدام Service Worker للإشعارات
                console.log('Using Service Worker for notification');
                await this.serviceWorkerRegistration.showNotification(title, {
                    body: body,
                    icon: './icon-192.png',
                    badge: './icon-192.png',
                    tag: options.tag || 'lecture-notification-' + Date.now(),
                    requireInteraction: true,
                    vibrate: options.vibrate || [500, 200, 500],
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
                        type: options.type || 'notification',
                        timestamp: Date.now(),
                        ...options.data
                    }
                });
                console.log('Notification sent via Service Worker');
            } else {
                // إشعار عادي للمتصفحات التي لا تدعم Service Worker
                console.log('Using regular notification API');
                const notification = new Notification(title, {
                    body: body,
                    icon: './icon-192.png',
                    tag: options.tag || 'lecture-notification-' + Date.now(),
                    requireInteraction: true,
                    silent: false,
                    vibrate: options.vibrate || [500, 200, 500]
                });

                notification.onclick = () => {
                    window.focus();
                    notification.close();
                };

                // إغلاق الإشعار بعد 15 ثانية
                setTimeout(() => {
                    notification.close();
                }, 15000);

                console.log('Regular notification created');
            }
        } catch (error) {
            console.error('خطأ في إرسال الإشعار:', error);
            // إظهار إشعار داخل التطبيق كبديل
            this.showAppNotification(`${title}: ${body}`, 'info');
        }
    }

    testNotification() {
        if (this.notificationPermission !== 'granted') {
            this.showAppNotification('يجب تفعيل الإشعارات أولاً', 'warning');
            return;
        }

        this.showAppNotification('سيتم إرسال إشعار تجريبي خلال 3 ثوانٍ...', 'info');

        // إرسال إشعار تجريبي مع نفس تنسيق إشعارات المحاضرات
        const testLecture = {
            subject: 'الدوائر الكهربائية',
            professor: 'د. عادل راوع',
            room: 'D-403',
            duration: 120
        };

        const lectureDuration = this.formatDuration(testLecture.duration);

        // إرسال إشعار عبر Service Worker
        if (this.serviceWorkerRegistration && this.serviceWorkerRegistration.active) {
            console.log('Sending test notification via Service Worker');
            
            // إشعار تذكير تجريبي
            this.serviceWorkerRegistration.active.postMessage({
                type: 'SCHEDULE_TEST_NOTIFICATION',
                title: 'تذكير: محاضرة قريبة ⏰ (تجريبي)',
                body: `محاضرة ${testLecture.subject} ستبدأ بعد 5 دقائق مع ${testLecture.professor} في القاعة ${testLecture.room} - مدة المحاضرة: ${lectureDuration}`,
                delay: 3000
            });

            // إشعار بداية تجريبي
            setTimeout(() => {
                this.serviceWorkerRegistration.active.postMessage({
                    type: 'SCHEDULE_TEST_NOTIFICATION',
                    title: 'بداية المحاضرة 🎓 (تجريبي)',
                    body: `محاضرة ${testLecture.subject} بدأت الآن مع ${testLecture.professor} في القاعة ${testLecture.room} - مدة المحاضرة: ${lectureDuration}`,
                    delay: 1000
                });
            }, 8000);

        } else {
            // إرسال مباشر إذا لم يكن Service Worker متاحاً
            setTimeout(() => {
                this.sendNotification(
                    'تذكير: محاضرة قريبة ⏰ (تجريبي)',
                    `محاضرة ${testLecture.subject} ستبدأ بعد 5 دقائق مع ${testLecture.professor} في القاعة ${testLecture.room} - مدة المحاضرة: ${lectureDuration}`,
                    {
                        type: 'test',
                        tag: 'test-reminder',
                        vibrate: [500, 200, 500, 200, 500],
                        requireInteraction: true
                    }
                );
            }, 3000);

            setTimeout(() => {
                this.sendNotification(
                    'بداية المحاضرة 🎓 (تجريبي)',
                    `محاضرة ${testLecture.subject} بدأت الآن مع ${testLecture.professor} في القاعة ${testLecture.room} - مدة المحاضرة: ${lectureDuration}`,
                    {
                        type: 'test',
                        tag: 'test-start',
                        vibrate: [800, 200, 800, 200, 800],
                        requireInteraction: true
                    }
                );
            }, 8000);
        }

        setTimeout(() => {
            this.showAppNotification('تم إرسال الإشعارات التجريبية! تحقق من وصولها.', 'success');
        }, 4000);

        setTimeout(() => {
            this.showAppNotification('إذا لم تصلك الإشعارات، تأكد من إعدادات الإشعارات في متصفحك أو جهازك.', 'info');
        }, 12000);
    }

    updateCurrentInfo() {
        const now = new Date();

        // تحديث الوقت الحالي (12 ساعة مع تمييز صباح/مساء)
        const hours = now.getHours();
        const ampm = hours >= 12 ? 'pm' : 'am';
        const displayHours = hours % 12 || 12;
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');

        const timeString = `${displayHours}:${minutes}:${seconds}`;
        const timeElement = document.getElementById('currentTime');
        timeElement.textContent = timeString;
        timeElement.className = `current-time ${ampm}`;

        // تحديث التاريخ الميلادي فقط
        const gregorianDate = now.toLocaleDateString('ar-SA', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            calendar: 'gregory'
        });
        document.getElementById('currentDateGregorian').textContent = gregorianDate;

        // تحديث المحاضرة القادمة
        this.updateNextLectureInfo(now);
    }

    updateNextLectureInfo(now) {
        const currentDay = this.getCurrentDayKey();
        const todayLectures = this.lectures
            .filter(lecture => lecture.day === currentDay)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));

        let nextLecture = null;
        const currentTime = now.getHours() * 60 + now.getMinutes();

        // البحث عن المحاضرة القادمة اليوم
        for (const lecture of todayLectures) {
            const [hours, minutes] = lecture.startTime.split(':').map(Number);
            const lectureTime = hours * 60 + minutes;

            if (lectureTime > currentTime) {
                nextLecture = lecture;
                break;
            }
        }

        // إذا لم توجد محاضرة اليوم، ابحث في الأيام القادمة
        if (!nextLecture) {
            const daysOrder = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
            const currentDayIndex = daysOrder.indexOf(currentDay);

            for (let i = 1; i <= 6; i++) {
                const nextDayIndex = (currentDayIndex + i) % 6;
                const nextDayKey = daysOrder[nextDayIndex];
                const nextDayLectures = this.lectures
                    .filter(lecture => lecture.day === nextDayKey)
                    .sort((a, b) => a.startTime.localeCompare(b.startTime));

                if (nextDayLectures.length > 0) {
                    nextLecture = nextDayLectures[0];
                    nextLecture.isNextDay = true;
                    nextLecture.dayName = this.getDayName(nextDayKey);
                    break;
                }
            }
        }

        if (nextLecture) {
            document.getElementById('nextLectureName').textContent = nextLecture.subject;
            document.getElementById('nextLectureInfo').innerHTML = `
                <div>${nextLecture.professor}</div>
                <div>القاعة: ${nextLecture.room}</div>
                <div>المدة: ${this.formatDuration(nextLecture.duration)}</div>
                ${nextLecture.isNextDay ? `<div>يوم ${nextLecture.dayName}</div>` : ''}
            `;

            if (!nextLecture.isNextDay) {
                const timeRemaining = this.calculateTimeRemaining(now, nextLecture.startTime);
                document.getElementById('timeRemaining').textContent = timeRemaining;
            } else {
                document.getElementById('timeRemaining').textContent = `في ${nextLecture.startTime}`;
            }
        } else {
            document.getElementById('nextLectureName').textContent = 'لا توجد محاضرات';
            document.getElementById('nextLectureInfo').textContent = 'لا توجد محاضرات مجدولة';
            document.getElementById('timeRemaining').textContent = '--';
        }
    }

    getDayName(dayKey) {
        const dayNames = {
            'saturday': 'السبت',
            'sunday': 'الأحد',
            'monday': 'الاثنين',
            'tuesday': 'الثلاثاء',
            'wednesday': 'الأربعاء',
            'thursday': 'الخميس'
        };
        return dayNames[dayKey] || dayKey;
    }

    calculateTimeRemaining(now, startTime) {
        const [hours, minutes] = startTime.split(':').map(Number);
        const lectureTime = new Date(now);
        lectureTime.setHours(hours, minutes, 0, 0);

        if (lectureTime <= now) {
            return 'المحاضرة بدأت';
        }

        const diff = lectureTime.getTime() - now.getTime();
        const hoursRemaining = Math.floor(diff / (1000 * 60 * 60));
        const minutesRemaining = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        if (hoursRemaining > 0) {
            return `${hoursRemaining} ساعة و ${minutesRemaining} دقيقة`;
        } else {
            return `${minutesRemaining} دقيقة`;
        }
    }

    formatDuration(minutes) {
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

    showAppNotification(message, type = 'info') {
        const container = document.getElementById('appNotifications');
        const notification = document.createElement('div');
        notification.className = `app-notification ${type}`;
        notification.textContent = message;

        container.appendChild(notification);

        // إزالة الإشعار بعد 5 ثوان
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }
}

// تشغيل التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    window.lectureApp = new LectureScheduleApp();
});

// التعامل مع تحديث الصفحة وإعادة التحميل
window.addEventListener('beforeunload', () => {
    // حفظ البيانات قبل إغلاق الصفحة
    if (window.lectureApp) {
        window.lectureApp.saveLectures();
    }
});

// تسجيل Service Worker عند تحميل الصفحة
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').then(registration => {
            console.log('ServiceWorker registration successful');
        }, err => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}