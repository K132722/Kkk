class LectureScheduleApp {
    constructor() {
        this.lectures = this.loadLectures();
        this.editingLecture = null;
        this.telegramBotToken = "8391105668:AAGh-L-TqGOgH0H8qhVOiTMFUYwFxaeeQo8"; // استبدل بتوكن البوت الخاص بك
        this.telegramChatId = localStorage.getItem('telegramChatId') || null;
        this.serviceWorkerRegistration = null;

        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.renderSchedule();
        await this.registerServiceWorker();
        this.updateCurrentInfo();
        this.updateTelegramStatus();

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
                this.serviceWorkerRegistration = await navigator.serviceWorker.register('./sw-telegram.js', {
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

                // إرسال إعدادات Telegram إلى Service Worker
                if (this.telegramChatId) {
                    this.serviceWorkerRegistration.active.postMessage({
                        type: 'SET_TELEGRAM_CONFIG',
                        botToken: this.telegramBotToken,
                        chatId: this.telegramChatId
                    });
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
            this.setupTelegramNotifications();
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

    async setupTelegramNotifications() {
        if (this.telegramChatId) {
            // إذا كان معرف الدردشة موجوداً، إظهار خيارات
            const choice = confirm('إشعارات Telegram مفعلة. هل تريد تغيير معرف الدردشة أو إرسال رسالة تجريبية؟');
            if (choice) {
                this.promptForTelegramChatId();
            }
            return;
        }

        this.promptForTelegramChatId();
    }

    promptForTelegramChatId() {
        const chatId = prompt(5750901822);

        if (chatId) {
            this.telegramChatId = chatId;
            localStorage.setItem('telegramChatId', chatId);
            this.updateTelegramStatus();

            // إرسال إعدادات Telegram إلى Service Worker
            if (this.serviceWorkerRegistration && this.serviceWorkerRegistration.active) {
                this.serviceWorkerRegistration.active.postMessage({
                    type: 'SET_TELEGRAM_CONFIG',
                    botToken: this.telegramBotToken,
                    chatId: chatId
                });
            }

            this.showAppNotification('تم حفظ معرف Telegram بنجاح! سيتم إرسال الإشعارات إلى حسابك.', 'success');

            // إرسال رسالة تأكيد
            this.sendTelegramMessage('✅ تم تفعيل إشعارات جدول المحاضرات بنجاح! سيصلك تذكير بالمحاضرات قبل 5 دقائق من بدايتها وإشعار عند بداية كل محاضرة.', 'setup');

            // جدولة الإشعارات فوراً
            this.scheduleAllNotifications();
        }
    }

    updateTelegramStatus() {
        const statusEl = document.getElementById('notificationStatus');
        const btnEl = document.getElementById('notificationBtn');
        const testBtnEl = document.getElementById('testNotificationBtn');

        if (this.telegramChatId) {
            statusEl.textContent = 'إشعارات Telegram مفعلة ✅';
            statusEl.className = 'notification-status enabled';
            btnEl.textContent = 'إشعارات Telegram مفعلة';
            btnEl.disabled = false;
            testBtnEl.style.display = 'inline-block';
        } else {
            statusEl.textContent = 'إشعارات Telegram غير مفعلة - انقر لتفعيلها';
            statusEl.className = 'notification-status disabled';
            btnEl.textContent = 'تفعيل إشعارات Telegram';
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
            { key: 'thursday', name: 'الخميس' },
            { key: 'friday', name: 'الجمعه' }
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
        if (!this.telegramChatId) {
            console.log('Telegram chat ID not set, cannot schedule notifications');
            return;
        }

        // إرسال جدول كامل إلى Service Worker للعمل في الخلفية
        if (this.serviceWorkerRegistration && this.serviceWorkerRegistration.active) {
            this.serviceWorkerRegistration.active.postMessage({
                type: 'UPDATE_LECTURE_SCHEDULE',
                lectures: this.lectures,
                currentDay: this.getCurrentDayKey(),
                currentTime: new Date().getTime(),
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
            });
        }

        // حفظ آخر وقت تم فيه جدولة الإشعارات
        localStorage.setItem('lastScheduleUpdate', new Date().getTime().toString());

        console.log(`Scheduled Telegram notifications for ${this.lectures.length} lectures`);
    }

    getCurrentDayKey() {
        const dayMap = {
            6: 'saturday',
            0: 'sunday',
            1: 'monday',
            2: 'tuesday',
            3: 'wednesday',
            4: 'thursday',
            7: 'friday'
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
            4: 'thursday',
            7: 'friday'
        };
        return dayMap[date.getDay()];
    }

    async sendTelegramMessage(message, type = 'lecture') {
        if (!this.telegramChatId) {
            console.error('Cannot send Telegram message - no chat ID set');
            return false;
        }

        try {
            // استخدام API Telegram مباشرة
            const response = await fetch(`https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    chat_id: this.telegramChatId,
                    text: message,
                    parse_mode: 'Markdown'
                })
            });

            const result = await response.json();
            console.log('Telegram message sent:', result);
            return result.ok;
        } catch (error) {
            console.error('Failed to send Telegram message:', error);

            // محاولة بديلة باستخدام Google Apps Script إذا فشلت المحاولة الأولى
            try {
                const gasResponse = await fetch('https://script.google.com/macros/s/AKfycbx8ToVm54RyG3o1Eeojet_if9g05Cm99eWgpIAKh2Hv2xs_LrQomWO5FV0-QY1Rbsj5lQ/exec', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        botToken: this.telegramBotToken,
                        chatId: this.telegramChatId,
                        message: message,
                        type: type
                    })
                });

                const gasResult = await gasResponse.json();
                console.log('Telegram message sent via GAS:', gasResult);
                return gasResult.ok;
            } catch (gasError) {
                console.error('Failed to send Telegram message via GAS:', gasError);
                return false;
            }
        }
    }

    testNotification() {
        if (!this.telegramChatId) {
            this.showAppNotification('يجب تفعيل إشعارات Telegram أولاً', 'warning');
            return;
        }

        this.showAppNotification('سيتم إرسال رسالة تجريبية إلى Telegram خلال 3 ثوانٍ...', 'info');

        // إرسال رسالة تجريبية مع نفس تنسيق إشعارات المحاضرات
        const testLecture = {
            subject: 'الدوائر الكهربائية',
            professor: 'د. عادل راوع',
            room: 'D-403',
            duration: 120
        };

        const lectureDuration = this.formatDuration(testLecture.duration);

        // إرسال رسالة تذكير تجريبية
        setTimeout(() => {
            this.sendTelegramMessage(
                `⏰ *تذكير: محاضرة قريبة (تجريبي)*\n\nمحاضرة ${testLecture.subject} ستبدأ بعد 5 دقائق مع ${testLecture.professor} في القاعة ${testLecture.room} - مدة المحاضرة: ${lectureDuration}`,
                'test-reminder'
            );
        }, 3000);

        // إرسال رسالة بداية تجريبية
        setTimeout(() => {
            this.sendTelegramMessage(
                `🎓 *بداية المحاضرة (تجريبي)*\n\nمحاضرة ${testLecture.subject} بدأت الآن مع ${testLecture.professor} في القاعة ${testLecture.room} - مدة المحاضرة: ${lectureDuration}`,
                'test-start'
            );
        }, 8000);

        setTimeout(() => {
            this.showAppNotification('تم إرسال الرسائل التجريبية! تحقق من وصولها في Telegram.', 'success');
        }, 4000);
    }

    updateCurrentInfo() {
        const now = new Date();

        // تحديث الوقت الحالي (12 ساعة مع تمييز صباح/مساء)
        const hours = now.getHours();
        const ampm = hours >= 12 ? 'مساء' : 'صباحاً';
        const displayHours = hours % 12 || 12;
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');

        const timeString = `${displayHours}:${minutes}:${seconds} ${ampm}`;
        const timeElement = document.getElementById('currentTime');
        timeElement.textContent = timeString;
        timeElement.className = `current-time ${hours >= 12 ? 'pm' : 'am'}`;

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
            'thursday': 'الخميس',
            'friday': 'الجمعه'
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
        navigator.serviceWorker.register('sw-telegram.js').then(registration => {
            console.log('ServiceWorker registration successful');
        }, err => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}