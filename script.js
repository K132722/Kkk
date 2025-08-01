
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
                this.serviceWorkerRegistration = await navigator.serviceWorker.register('sw.js');
                console.log('Service Worker registered successfully');
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
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

        const permission = await Notification.requestPermission();
        this.notificationPermission = permission;
        this.updateNotificationStatus();
        
        if (permission === 'granted') {
            this.showAppNotification('تم تفعيل الإشعارات بنجاح!', 'success');
            this.scheduleAllNotifications();
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
            return;
        }

        const now = new Date();
        const currentDay = this.getCurrentDayKey();

        this.lectures.forEach(lecture => {
            this.scheduleLectureNotifications(lecture, now, currentDay);
        });

        // إرسال المحاضرات إلى Service Worker للجدولة في الخلفية
        if (this.serviceWorkerRegistration && this.serviceWorkerRegistration.active) {
            this.serviceWorkerRegistration.active.postMessage({
                type: 'SCHEDULE_LECTURE_NOTIFICATIONS',
                lectures: this.lectures
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

    scheduleLectureNotifications(lecture, now, currentDay) {
        const [hours, minutes] = lecture.startTime.split(':').map(Number);
        
        // حساب وقت المحاضرة لليوم الحالي
        const lectureTime = new Date(now);
        lectureTime.setHours(hours, minutes, 0, 0);

        console.log(`Scheduling notifications for lecture: ${lecture.subject} at ${lecture.startTime}`);

        // إذا كانت المحاضرة اليوم
        if (lecture.day === currentDay) {
            // إشعار قبل 5 دقائق
            const reminderTime = new Date(lectureTime.getTime() - 5 * 60 * 1000);
            if (reminderTime > now) {
                const delay = reminderTime.getTime() - now.getTime();
                console.log(`Reminder scheduled in ${delay}ms for lecture ${lecture.id}`);
                
                // استخدام Service Worker للجدولة
                if (this.serviceWorkerRegistration && this.serviceWorkerRegistration.active) {
                    this.serviceWorkerRegistration.active.postMessage({
                        type: 'SCHEDULE_LECTURE_NOTIFICATION',
                        title: 'تذكير: محاضرة قريبة ⏰',
                        body: `محاضرة ${lecture.subject} ستبدأ بعد 5 دقائق مع ${lecture.professor} في القاعة ${lecture.room}`,
                        delay: delay,
                        lectureId: lecture.id,
                        notificationType: 'reminder'
                    });
                } else {
                    // جدولة مباشرة إذا لم يكن Service Worker متاحاً
                    const timeoutId = setTimeout(() => {
                        this.sendNotification(
                            'تذكير: محاضرة قريبة ⏰',
                            `محاضرة ${lecture.subject} ستبدأ بعد 5 دقائق مع ${lecture.professor} في القاعة ${lecture.room}`,
                            {
                                type: 'lecture',
                                tag: `reminder-${lecture.id}`,
                                vibrate: [200, 100, 200],
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
                console.log(`Start notification scheduled in ${delay}ms for lecture ${lecture.id}`);
                
                if (this.serviceWorkerRegistration && this.serviceWorkerRegistration.active) {
                    this.serviceWorkerRegistration.active.postMessage({
                        type: 'SCHEDULE_LECTURE_NOTIFICATION',
                        title: 'بداية المحاضرة 🎓',
                        body: `محاضرة ${lecture.subject} بدأت الآن في القاعة ${lecture.room}`,
                        delay: delay,
                        lectureId: lecture.id,
                        notificationType: 'start'
                    });
                } else {
                    const timeoutId = setTimeout(() => {
                        this.sendNotification(
                            'بداية المحاضرة 🎓',
                            `محاضرة ${lecture.subject} بدأت الآن في القاعة ${lecture.room}`,
                            {
                                type: 'lecture',
                                tag: `start-${lecture.id}`,
                                vibrate: [300, 100, 300],
                                data: { lectureId: lecture.id, type: 'start' }
                            }
                        );
                    }, delay);
                    this.notificationTimeouts.set(`start_${lecture.id}`, timeoutId);
                }
            }
        }

        // جدولة المحاضرات للأسبوع القادم (محدود للمحاضرات القريبة)
        const daysUntilLecture = this.getDaysUntilNextOccurrence(lecture.day, currentDay);
        if (daysUntilLecture > 0 && daysUntilLecture <= 2) { // جدول فقط للمحاضرات في اليومين القادمين
            const nextLectureDate = new Date(now);
            nextLectureDate.setDate(nextLectureDate.getDate() + daysUntilLecture);
            nextLectureDate.setHours(hours, minutes, 0, 0);

            const reminderTime = new Date(nextLectureDate.getTime() - 5 * 60 * 1000);
            
            if (reminderTime > now) {
                const delay = reminderTime.getTime() - now.getTime();
                console.log(`Future reminder scheduled in ${delay}ms for lecture ${lecture.id}`);
                
                if (this.serviceWorkerRegistration && this.serviceWorkerRegistration.active) {
                    this.serviceWorkerRegistration.active.postMessage({
                        type: 'SCHEDULE_LECTURE_NOTIFICATION',
                        title: 'تذكير: محاضرة قريبة ⏰',
                        body: `محاضرة ${lecture.subject} ستبدأ بعد 5 دقائق مع ${lecture.professor} في القاعة ${lecture.room}`,
                        delay: delay,
                        lectureId: lecture.id,
                        notificationType: 'future_reminder'
                    });
                }
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
                    icon: '/icon-192.png',
                    badge: '/icon-192.png',
                    tag: options.tag || 'lecture-notification-' + Date.now(),
                    requireInteraction: true,
                    vibrate: options.vibrate || [500, 200, 500],
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
                    icon: '/icon-192.png',
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

        this.showAppNotification('سيتم إرسال إشعار تجريبي خلال 5 ثوانٍ...', 'info');

        // إرسال إشعار عبر Service Worker
        if (this.serviceWorkerRegistration && this.serviceWorkerRegistration.active) {
            console.log('Sending test notification via Service Worker');
            this.serviceWorkerRegistration.active.postMessage({
                type: 'SCHEDULE_TEST_NOTIFICATION',
                title: 'مرحباً بك في برنامج جدول محاضراتي! 📚',
                body: 'هذا إشعار تجريبي للتأكد من أن الإشعارات تعمل بشكل صحيح. الآن يمكنك استقبال تذكيرات المحاضرات!',
                delay: 5000
            });
        } else {
            // إرسال مباشر إذا لم يكن Service Worker متاحاً
            setTimeout(() => {
                this.sendNotification(
                    'مرحباً بك في برنامج جدول محاضراتي! 📚',
                    'هذا إشعار تجريبي للتأكد من أن الإشعارات تعمل بشكل صحيح. الآن يمكنك استقبال تذكيرات المحاضرات!',
                    {
                        type: 'test',
                        tag: 'test-notification',
                        vibrate: [500, 200, 500]
                    }
                );
            }, 5000);
        }

        setTimeout(() => {
            this.showAppNotification('تم إرسال الإشعار التجريبي!', 'success');
        }, 5500);
    }

    updateCurrentInfo() {
        const now = new Date();
        
        // تحديث الوقت الحالي
        const timeString = now.toLocaleTimeString('ar-SA', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        document.getElementById('currentTime').textContent = timeString;
        
        // تحديث التاريخ الهجري
        const hijriDate = this.getHijriDate(now);
        document.getElementById('currentDateHijri').textContent = hijriDate;
        
        // تحديث التاريخ الميلادي
        const gregorianDate = now.toLocaleDateString('ar-SA', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        document.getElementById('currentDateGregorian').textContent = gregorianDate;
        
        // تحديث المحاضرة القادمة
        this.updateNextLectureInfo(now);
    }

    getHijriDate(date) {
        try {
            return date.toLocaleDateString('ar-SA-u-ca-islamic', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch (error) {
            // في حالة عدم دعم التقويم الهجري
            return 'التاريخ الهجري غير متاح';
        }
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
    new LectureScheduleApp();
});

// التعامل مع تحديث الصفحة وإعادة التحميل
window.addEventListener('beforeunload', () => {
    // حفظ البيانات قبل إغلاق الصفحة
    if (window.lectureApp) {
        window.lectureApp.saveLectures();
    }
});
