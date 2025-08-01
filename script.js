
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
            <div class="lecture-duration">المدة: ${lecture.duration} دقيقة</div>
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

        // إذا كانت المحاضرة اليوم
        if (lecture.day === currentDay) {
            // إشعار قبل 5 دقائق
            const reminderTime = new Date(lectureTime.getTime() - 5 * 60 * 1000);
            if (reminderTime > now) {
                const timeoutId = setTimeout(() => {
                    this.sendNotification(
                        'تذكير: محاضرة قريبة',
                        `محاضرة ${lecture.subject} ستبدأ بعد 5 دقائق مع ${lecture.professor} في القاعة ${lecture.room}`,
                        '⏰'
                    );
                }, reminderTime.getTime() - now.getTime());
                this.notificationTimeouts.set(`reminder_${lecture.id}`, timeoutId);
            }

            // إشعار عند بداية المحاضرة
            if (lectureTime > now) {
                const timeoutId = setTimeout(() => {
                    this.sendNotification(
                        'بداية المحاضرة',
                        `محاضرة ${lecture.subject} بدأت الآن في القاعة ${lecture.room}`,
                        '🎓'
                    );
                }, lectureTime.getTime() - now.getTime());
                this.notificationTimeouts.set(`start_${lecture.id}`, timeoutId);
            }
        }

        // جدولة المحاضرات للأسبوع القادم
        const daysUntilLecture = this.getDaysUntilNextOccurrence(lecture.day, currentDay);
        if (daysUntilLecture > 0) {
            const nextLectureDate = new Date(now);
            nextLectureDate.setDate(nextLectureDate.getDate() + daysUntilLecture);
            nextLectureDate.setHours(hours, minutes, 0, 0);

            const reminderTime = new Date(nextLectureDate.getTime() - 5 * 60 * 1000);
            
            if (reminderTime > now) {
                const timeoutId = setTimeout(() => {
                    this.sendNotification(
                        'تذكير: محاضرة قريبة',
                        `محاضرة ${lecture.subject} ستبدأ بعد 5 دقائق مع ${lecture.professor} في القاعة ${lecture.room}`,
                        '⏰'
                    );
                }, reminderTime.getTime() - now.getTime());
                this.notificationTimeouts.set(`future_reminder_${lecture.id}`, timeoutId);
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

    async sendNotification(title, body, icon = '🎓') {
        if (this.notificationPermission !== 'granted') {
            return;
        }

        try {
            if (this.serviceWorkerRegistration) {
                // استخدام Service Worker للإشعارات
                await this.serviceWorkerRegistration.showNotification(title, {
                    body: body,
                    icon: 'icon-192.png',
                    badge: 'icon-192.png',
                    tag: 'lecture-notification',
                    requireInteraction: true,
                    vibrate: [200, 100, 200],
                    data: { type: 'lecture' }
                });
            } else {
                // إشعار عادي
                new Notification(title, {
                    body: body,
                    icon: 'icon-192.png',
                    tag: 'lecture-notification',
                    requireInteraction: true
                });
            }
        } catch (error) {
            console.error('خطأ في إرسال الإشعار:', error);
            // إظهار إشعار داخل التطبيق كبديل
            this.showAppNotification(`${title}: ${body}`, 'success');
        }
    }

    testNotification() {
        if (this.notificationPermission !== 'granted') {
            this.showAppNotification('يجب تفعيل الإشعارات أولاً', 'warning');
            return;
        }

        this.showAppNotification('سيتم إرسال إشعار تجريبي خلال 5 ثوانٍ...', 'info');

        setTimeout(() => {
            this.sendNotification(
                'مرحباً بك في برنامج جدول محاضراتي! 📚',
                'هذا إشعار تجريبي للتأكد من أن الإشعارات تعمل بشكل صحيح. الآن يمكنك استقبال تذكيرات المحاضرات!',
                '✅'
            );
            this.showAppNotification('تم إرسال الإشعار التجريبي بنجاح!', 'success');
        }, 5000);
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
