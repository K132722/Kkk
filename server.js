
const express = require('express');
const webpush = require('web-push');
const cors = require('cors');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// إعدادات الأمان والضغط
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// تقديم الملفات الثابتة
app.use(express.static('.', {
  setHeaders: (res, path) => {
    if (path.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    } else if (path.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json');
    }
  }
}));

// مفاتيح VAPID الحقيقية - يمكنك توليدها بتشغيل: npx web-push generate-vapid-keys
// إلى هذا (قراءة من Environment Variables - آمن):
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY
};

// تأكد أيضًا من تحديث إعدادات VAPID:
webpush.setVapidDetails(
  process.env.EMAIL_FOR_VAPID || 'mailto:university@schedule.app',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// إعداد web-push
webpush.setVapidDetails(
  'mailto:university@schedule.app',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// تخزين الاشتراكات (في بيئة الإنتاج استخدم قاعدة بيانات)
let subscriptions = new Map();
let lectureSchedules = new Map();

// Routes

// الصفحة الرئيسية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// الحصول على المفتاح العام
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// تسجيل اشتراك جديد
app.post('/api/subscribe', (req, res) => {
  const { subscription, userId, lectureSchedule } = req.body;
  
  if (!subscription || !userId) {
    return res.status(400).json({ error: 'بيانات الاشتراك مطلوبة' });
  }

  try {
    // حفظ الاشتراك
    subscriptions.set(userId, {
      subscription,
      registeredAt: new Date(),
      lastActive: new Date()
    });

    // حفظ جدول المحاضرات
    if (lectureSchedule && lectureSchedule.length > 0) {
      lectureSchedules.set(userId, lectureSchedule);
    }

    console.log('تم تسجيل اشتراك جديد:', userId);
    
    // إرسال إشعار ترحيب
    setTimeout(() => {
      sendWelcomeNotification(userId);
    }, 2000);

    res.json({ 
      success: true, 
      message: 'تم تسجيل الاشتراك بنجاح',
      vapidPublicKey: vapidKeys.publicKey
    });
  } catch (error) {
    console.error('خطأ في تسجيل الاشتراك:', error);
    res.status(500).json({ error: 'فشل في تسجيل الاشتراك' });
  }
});

// تحديث جدول المحاضرات
app.post('/api/update-schedule', (req, res) => {
  const { userId, lectureSchedule } = req.body;
  
  if (!userId || !lectureSchedule) {
    return res.status(400).json({ error: 'معرف المستخدم وجدول المحاضرات مطلوبان' });
  }

  try {
    lectureSchedules.set(userId, lectureSchedule);
    
    // تحديث آخر نشاط
    if (subscriptions.has(userId)) {
      subscriptions.get(userId).lastActive = new Date();
    }

    console.log(`تم تحديث جدول المحاضرات للمستخدم: ${userId}`);
    res.json({ success: true, message: 'تم تحديث جدول المحاضرات' });
  } catch (error) {
    console.error('خطأ في تحديث الجدول:', error);
    res.status(500).json({ error: 'فشل في تحديث الجدول' });
  }
});

// إرسال إشعار تجريبي
app.post('/api/test-notification', (req, res) => {
  const { userId } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'معرف المستخدم مطلوب' });
  }

  try {
    sendTestNotification(userId);
    res.json({ success: true, message: 'تم إرسال الإشعار التجريبي' });
  } catch (error) {
    console.error('خطأ في إرسال الإشعار التجريبي:', error);
    res.status(500).json({ error: 'فشل في إرسال الإشعار' });
  }
});

// الحصول على إحصائيات الخدمة
app.get('/api/stats', (req, res) => {
  res.json({
    totalSubscriptions: subscriptions.size,
    totalSchedules: lectureSchedules.size,
    serverStartTime: serverStartTime,
    uptime: Date.now() - serverStartTime
  });
});

// endpoint للتحقق من حالة الخادم (يستخدمه Render للـ health check)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: Date.now() - serverStartTime,
    subscriptions: subscriptions.size
  });
});

// إلغاء الاشتراك
app.post('/api/unsubscribe', (req, res) => {
  const { userId } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'معرف المستخدم مطلوب' });
  }

  try {
    subscriptions.delete(userId);
    lectureSchedules.delete(userId);
    
    console.log('تم إلغاء الاشتراك:', userId);
    res.json({ success: true, message: 'تم إلغاء الاشتراك' });
  } catch (error) {
    console.error('خطأ في إلغاء الاشتراك:', error);
    res.status(500).json({ error: 'فشل في إلغاء الاشتراك' });
  }
});

// وظائف الإشعارات

// إرسال إشعار ترحيب
async function sendWelcomeNotification(userId) {
  if (!subscriptions.has(userId)) return;

  const { subscription } = subscriptions.get(userId);
  
  const payload = JSON.stringify({
    title: 'مرحباً بك! 🎓',
    body: 'تم تفعيل نظام الإشعارات بنجاح. ستصلك تذكيرات المحاضرات تلقائياً.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'welcome',
    requireInteraction: true,
    vibrate: [300, 100, 300],
    data: {
      type: 'welcome',
      userId: userId,
      timestamp: Date.now()
    }
  });

  try {
    await webpush.sendNotification(subscription, payload);
    console.log('تم إرسال إشعار الترحيب للمستخدم:', userId);
  } catch (error) {
    console.error('فشل في إرسال إشعار الترحيب:', error);
    // إزالة الاشتراكات المنتهية الصلاحية
    if (error.statusCode === 410) {
      subscriptions.delete(userId);
      lectureSchedules.delete(userId);
    }
  }
}

// إرسال إشعار تجريبي
async function sendTestNotification(userId) {
  if (!subscriptions.has(userId)) return;

  const { subscription } = subscriptions.get(userId);
  
  const payload = JSON.stringify({
    title: 'إشعار تجريبي 🔔',
    body: 'هذا إشعار تجريبي للتأكد من عمل النظام. سيصلك إشعار آخر خلال 5 ثوانٍ.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: 'test',
    requireInteraction: true,
    vibrate: [500, 200, 500],
    data: {
      type: 'test',
      userId: userId,
      timestamp: Date.now()
    }
  });

  try {
    await webpush.sendNotification(subscription, payload);
    console.log('تم إرسال الإشعار التجريبي للمستخدم:', userId);
    
    // إرسال إشعار ثانٍ بعد 5 ثوانٍ
    setTimeout(async () => {
      const secondPayload = JSON.stringify({
        title: 'الإشعار الثاني 🎯',
        body: 'ممتاز! النظام يعمل بشكل مثالي. ستصلك الإشعارات حسب جدول محاضراتك.',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'test-2',
        requireInteraction: true,
        vibrate: [800, 200, 800],
        data: {
          type: 'test-confirmation',
          userId: userId,
          timestamp: Date.now()
        }
      });
      
      try {
        await webpush.sendNotification(subscription, secondPayload);
        console.log('تم إرسال الإشعار التجريبي الثاني للمستخدم:', userId);
      } catch (error) {
        console.error('فشل في إرسال الإشعار التجريبي الثاني:', error);
      }
    }, 5000);
    
  } catch (error) {
    console.error('فشل في إرسال الإشعار التجريبي:', error);
    if (error.statusCode === 410) {
      subscriptions.delete(userId);
      lectureSchedules.delete(userId);
    }
  }
}

// إرسال تذكيرات المحاضرات
async function sendLectureReminder(userId, lecture, minutesBefore = 5) {
  if (!subscriptions.has(userId)) return;

  const { subscription } = subscriptions.get(userId);
  
  const reminderText = minutesBefore > 0 
    ? `محاضرة ${lecture.subject} ستبدأ بعد ${minutesBefore} دقائق`
    : `محاضرة ${lecture.subject} بدأت الآن`;
    
  const payload = JSON.stringify({
    title: minutesBefore > 0 ? 'تذكير: محاضرة قريبة ⏰' : 'بداية المحاضرة 🎓',
    body: `${reminderText} مع ${lecture.professor} في القاعة ${lecture.room}`,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: `lecture-${lecture.id}-${minutesBefore}`,
    requireInteraction: true,
    vibrate: minutesBefore > 0 ? [500, 200, 500, 200, 500] : [800, 200, 800, 200, 800],
    data: {
      type: 'lecture-reminder',
      lectureId: lecture.id,
      minutesBefore: minutesBefore,
      userId: userId,
      timestamp: Date.now(),
      lecture: lecture
    }
  });

  try {
    await webpush.sendNotification(subscription, payload);
    console.log(`تم إرسال تذكير المحاضرة للمستخدم ${userId}: ${lecture.subject} (${minutesBefore} دقائق)`);
  } catch (error) {
    console.error('فشل في إرسال تذكير المحاضرة:', error);
    if (error.statusCode === 410) {
      subscriptions.delete(userId);
      lectureSchedules.delete(userId);
    }
  }
}

// فحص عاجل للمحاضرات التي ستبدأ خلال دقيقتين
function checkUrgentLectures() {
  const now = new Date();
  const currentDay = getCurrentDayKey(now);
  const currentTime = now.getHours() * 60 + now.getMinutes();

  for (const [userId, lectures] of lectureSchedules) {
    if (!subscriptions.has(userId)) continue;

    lectures.forEach(lecture => {
      if (lecture.day === currentDay) {
        const [hours, minutes] = lecture.startTime.split(':').map(Number);
        const lectureTime = hours * 60 + minutes;
        const timeDiff = lectureTime - currentTime;

        // إشعار عاجل للمحاضرات التي ستبدأ خلال دقيقتين
        if (timeDiff >= 1 && timeDiff <= 2) {
          sendLectureReminder(userId, lecture, timeDiff);
        }
      }
    });
  }
}

// فحص المحاضرات وإرسال التذكيرات
function checkLecturesAndSendReminders() {
  const now = new Date();
  const currentDay = getCurrentDayKey(now);
  const currentTime = now.getHours() * 60 + now.getMinutes();

  console.log(`فحص المحاضرات - اليوم: ${currentDay}, الوقت: ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`);

  for (const [userId, lectures] of lectureSchedules) {
    if (!subscriptions.has(userId)) continue;

    lectures.forEach(lecture => {
      if (lecture.day === currentDay) {
        const [hours, minutes] = lecture.startTime.split(':').map(Number);
        const lectureTime = hours * 60 + minutes;
        const timeDiff = lectureTime - currentTime;

        // تذكير قبل 5 دقائق (مع هامش خطأ ±1 دقيقة)
        if (timeDiff >= 4 && timeDiff <= 6) {
          sendLectureReminder(userId, lecture, 5);
        }

        // تذكير عند البداية (مع هامش خطأ ±1 دقيقة)
        if (timeDiff >= -1 && timeDiff <= 1) {
          sendLectureReminder(userId, lecture, 0);
        }
      }
    });
  }
}

// الحصول على مفتاح اليوم الحالي
function getCurrentDayKey(date) {
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

// جدولة فحص المحاضرات كل دقيقة مع ضمان العمل المستمر
cron.schedule('* * * * *', () => {
  try {
    checkLecturesAndSendReminders();
  } catch (error) {
    console.error('خطأ في فحص المحاضرات:', error);
  }
});

// فحص إضافي كل 30 ثانية للتأكد من الإشعارات المهمة
cron.schedule('*/30 * * * * *', () => {
  try {
    checkUrgentLectures();
  } catch (error) {
    console.error('خطأ في الفحص العاجل:', error);
  }
});

// تنظيف الاشتراكات المنتهية الصلاحية كل ساعة
cron.schedule('0 * * * *', () => {
  const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  
  for (const [userId, data] of subscriptions) {
    if (data.lastActive.getTime() < oneWeekAgo) {
      subscriptions.delete(userId);
      lectureSchedules.delete(userId);
      console.log('تم حذف اشتراك منتهي الصلاحية:', userId);
    }
  }
});

// معالجة الأخطاء العامة
app.use((error, req, res, next) => {
  console.error('خطأ في الخادم:', error);
  res.status(500).json({ error: 'خطأ داخلي في الخادم' });
});

// معالجة الطلبات غير الموجودة
app.use((req, res) => {
  res.status(404).json({ error: 'الصفحة غير موجودة' });
});

// متغير لتتبع وقت بداية الخادم
const serverStartTime = Date.now();

// بدء الخادم
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 خادم الإشعارات يعمل على البورت ${PORT}`);
  console.log(`📊 رابط الخادم: http://0.0.0.0:${PORT}`);
  console.log('🔔 نظام الإشعارات جاهز للعمل');
  console.log('⏰ فحص المحاضرات يعمل كل دقيقة');
});

// معالجة إغلاق الخادم بشكل لائق
process.on('SIGTERM', () => {
  console.log('🛑 إيقاف الخادم...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 إيقاف الخادم...');
  process.exit(0);
});
