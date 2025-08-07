
# تعليمات النشر على Render

## الخطوات المطلوبة:

### 1. توليد مفاتيح VAPID
```bash
npx web-push generate-vapid-keys
```

### 2. إنشاء حساب على Render
- اذهب إلى https://render.com
- سجل حساب جديد
- اربط حسابك على GitHub

### 3. إنشاء Web Service جديد
- اختر "New" ثم "Web Service"
- اختر الـ repository الخاص بك
- استخدم الإعدادات التالية:
  - **Name**: اختر اسم للتطبيق (مثل: lecture-schedule-app)
  - **Environment**: Node
  - **Build Command**: `npm install`
  - **Start Command**: `node server.js`
  - **Plan**: Free (أو المدفوع حسب احتياجك)

### 4. إضافة متغيرات البيئة
في إعدادات الخدمة، أضف:
- `VAPID_PUBLIC_KEY`: المفتاح العام الذي ولدته
- `VAPID_PRIVATE_KEY`: المفتاح الخاص الذي ولدته
- `NODE_ENV`: production

### 5. تحديث رابط التطبيق
في ملف `script.js`، غير:
```javascript
this.backendUrl = 'https://your-app-name.onrender.com';
```
إلى الرابط الحقيقي لتطبيقك على Render.

### 6. رفع التغييرات على GitHub
```bash
git add .
git commit -m "Configure for Render deployment"
git push origin main
```

### 7. النشر
سيتم النشر تلقائياً بمجرد رفع التغييرات على GitHub.

## ملاحظات مهمة:
- الخطة المجانية في Render تتوقف بعد 15 دقيقة من عدم النشاط
- للحصول على خدمة دائمة، استخدم الخطة المدفوعة
- الإشعارات ستعمل بشكل مستمر مع الخطة المدفوعة
- تأكد من إضافة النطاق الخاص بـ Render في إعدادات PWA
