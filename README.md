# 🚀 General Barber Shop — Backend API

## راه‌اندازی سریع

```bash
cd barber-backend
npm install
cp .env.example .env
npm run db:init
npm run db:seed
npm run dev
```

---

## 📡 Base URL
```
http://localhost:3000/api
```

---

## 🔐 احراز هویت

### مشتری — OTP
```http
POST /api/auth/send-otp
{ "phone": "09120000000" }

POST /api/auth/verify-otp
{ "phone": "09120000000", "code": "1234" }
→ { token, customer, isNew }
```

### مدیر — PIN
```http
POST /api/auth/admin/login
{ "pin": "1234" }
→ { token }
```

### کارمند — رمز عبور
```http
POST /api/auth/worker/login
{ "phone": "09120000001", "password": "123456" }
→ { token, worker }
```

**Header برای همه درخواست‌های محافظت‌شده:**
```
Authorization: Bearer <token>
```

---

## 📅 نوبت‌ها

### دریافت زمان‌های خالی
```http
GET /api/appointments/slots?worker_id=...&date=2024-01-01&service_ids=id1,id2
→ { slots: [{ time, end_time, available }] }
```

### رزرو نوبت (مشتری)
```http
POST /api/appointments
{
  "worker_id": "...",
  "date": "2024-01-01",
  "start_time": "10:00",
  "service_ids": ["id1", "id2"],
  "coupon_code": "WELCOME20",    // اختیاری
  "points_used": 500,            // اختیاری
  "payment_method": "online",    // online | wallet | combined
  "hair_style": "fade"           // اختیاری
}
```

### نوبت‌های من (مشتری)
```http
GET /api/appointments/my?status=done&page=1&limit=10
```

### لغو نوبت (مشتری)
```http
PATCH /api/appointments/:id/cancel
{ "reason": "دلیل لغو" }
→ { cancelFee }
```

### تکمیل نوبت (کارمند/مدیر)
```http
PATCH /api/appointments/:id/done
```

### انتقال نوبت (مدیر)
```http
PATCH /api/appointments/:id/transfer
{ "new_worker_id": "..." }
```

### همه نوبت‌ها (مدیر)
```http
GET /api/appointments?date=2024-01-01&worker_id=...&status=pending&page=1
```

---

## 💈 سرویس‌ها

```http
GET  /api/services                          # لیست عمومی
GET  /api/services/:id                      # جزئیات + قیمت هر کارمند
POST /api/services              (admin)     # ایجاد
PATCH /api/services/:id         (admin)     # ویرایش
DELETE /api/services/:id        (admin)     # حذف نرم
POST /api/services/:id/worker-price (admin) # تنظیم قیمت کارمند
```

**مثال ایجاد سرویس:**
```json
{
  "name": "کوتاهی مو",
  "category": "cutting",
  "description": "کوتاهی با تکنیک مدرن",
  "base_price": 350000,
  "duration_min": 30,
  "is_popular": true
}
```

**دسته‌بندی‌ها:** `cutting | beard | color | perm | skin | package`

---

## 👥 مشتریان

```http
GET   /api/customers/me           (customer)  # پروفایل
PATCH /api/customers/me           (customer)  # ویرایش
GET   /api/customers/me/saved     (customer)  # سرویس‌های ذخیره
POST  /api/customers/me/saved/:id (customer)  # toggle ذخیره
GET   /api/customers/me/wallet    (customer)  # تراکنش‌های کیف پول
GET   /api/customers/me/points    (customer)  # تراکنش‌های امتیاز
GET   /api/customers             (admin)      # لیست مشتریان
PATCH /api/customers/:id/blacklist (admin)    # مسدود کردن
```

---

## ✂️ کارمندان

```http
GET  /api/workers                    # لیست عمومی
GET  /api/workers/me/stats (worker)  # آمار شخصی
GET  /api/workers/me/schedule (worker) # برنامه هفتگی
POST /api/workers/me/leaves (worker) # درخواست مرخصی
PATCH /api/workers/me       (worker) # ویرایش پروفایل
POST /api/workers            (admin) # افزودن کارمند
PATCH /api/workers/leaves/:id (admin)# تأیید/رد مرخصی
```

---

## ⭐ نظرات

```http
GET  /api/reviews/worker/:workerId    # نظرات عمومی
POST /api/reviews          (customer) # ثبت نظر
GET  /api/reviews/pending  (admin)    # نظرات در انتظار
PATCH /api/reviews/:id/status (admin) # تأیید/رد
```

---

## 💰 پرداخت

```http
POST /api/payments/initiate  (customer)  # شروع پرداخت
GET  /api/payments/verify               # بازگشت درگاه
POST /api/payments/wallet/charge (customer) # شارژ کیف پول
GET  /api/payments/wallet/verify         # تأیید شارژ
POST /api/payments/wallet/withdraw (admin) # برداشت مدیر
```

---

## 🏷️ کوپن‌ها

```http
POST /api/coupons/validate (customer)  # اعتبارسنجی
GET  /api/coupons          (admin)     # لیست
POST /api/coupons          (admin)     # ایجاد
PATCH /api/coupons/:id/toggle (admin) # فعال/غیرفعال
```

---

## 🔔 اعلان‌ها

```http
GET    /api/notifications         (customer) # لیست
PATCH  /api/notifications/:id/read (customer) # خوانده شد
PATCH  /api/notifications/read-all (customer) # همه خوانده شد
DELETE /api/notifications/:id     (customer) # حذف
POST   /api/notifications/send    (admin)    # ارسال
```

---

## 📣 کمپین‌ها

```http
GET  /api/campaigns           (admin) # لیست
POST /api/campaigns           (admin) # ایجاد
POST /api/campaigns/:id/send  (admin) # ارسال
```

---

## 📸 گالری

```http
GET  /api/gallery                    # تصاویر تأیید شده
POST /api/gallery/upload  (customer) # آپلود
POST /api/gallery/admin/upload (admin) # آپلود مدیر
PATCH /api/gallery/:id/approve (admin) # تأیید
DELETE /api/gallery/:id   (admin)    # حذف
```

---

## 📊 داشبورد مدیر

```http
GET  /api/admin/dashboard     # آمار کامل
POST /api/admin/target        # هدف ماهانه
GET  /api/admin/report        # گزارش PDF
GET  /api/admin/waiting-list  # لیست انتظار
```

---

## ⚙️ تنظیمات

```http
GET   /api/settings         (admin) # همه تنظیمات
PATCH /api/settings         (admin) # بروزرسانی
GET   /api/settings/public          # اطلاعات عمومی
```

---

## 📦 ساختار پروژه

```
barber-backend/
├── src/
│   ├── index.js              # Entry point
│   ├── routes/
│   │   ├── auth.js           # احراز هویت
│   │   ├── appointments.js   # نوبت‌ها
│   │   ├── customers.js      # مشتریان
│   │   ├── workers.js        # کارمندان
│   │   ├── services.js       # سرویس‌ها
│   │   ├── reviews.js        # نظرات
│   │   ├── payments.js       # پرداخت
│   │   ├── coupons.js        # کوپن‌ها
│   │   ├── notifications.js  # اعلان‌ها
│   │   ├── gallery.js        # گالری
│   │   ├── campaigns.js      # کمپین‌ها
│   │   ├── admin.js          # داشبورد مدیر
│   │   └── settings.js       # تنظیمات
│   ├── middleware/
│   │   └── auth.js           # JWT middleware
│   └── utils/
│       ├── db.js             # Database connection
│       ├── initDb.js         # Schema & init
│       └── seedDb.js         # Sample data
├── data/                     # SQLite file
├── uploads/                  # Uploaded images
├── .env.example
└── package.json
```

---

## 🔄 کدهای وضعیت نوبت

| کد | معنی |
|----|------|
| `pending` | در انتظار پرداخت |
| `confirmed` | تأیید شده |
| `done` | انجام شده |
| `cancelled` | لغو شده |
| `no_show` | غیبت مشتری |

---

## 🚀 دیپلوی روی Vercel

```bash
npm i -g vercel
vercel
```

**vercel.json:**
```json
{
  "version": 2,
  "builds": [{ "src": "src/index.js", "use": "@vercel/node" }],
  "routes": [{ "src": "/(.*)", "dest": "src/index.js" }]
}
```

> ⚠️ برای تولید، SQLite رو با **Supabase PostgreSQL** جایگزین کن.

---

## ✅ تغییرات اخیر (رفع مشکلات بک‌اند)

| مشکل قبلی | راه‌حل |
|---|---|
| تاریخ شمسی فقط placeholder بود (همیشه امروز می‌فرستاد) | `src/utils/jalali.js` با `jalaali-js` اضافه شد + endpoint واقعی `/api/settings/jalali-calendar` که تقویم شمسی واقعی برمی‌گردونه. `booking.html` الان از این تقویم واقعی استفاده می‌کنه |
| OTP فقط `console.log` بود | `src/utils/sms.js` ساخته شد — اگه `SMS_API_KEY` در `.env` خالی باشه همچنان console-mode کار می‌کنه (برای تست)، ولی اگه پر کنی (مثلاً کاوه‌نگار) واقعاً پیامک می‌فرسته. کد همراه با rate-limit (حداکثر ۳ درخواست در ۱۰ دقیقه) |
| یادآوری نوبت پیاده نشده بود | `src/utils/reminders.js` — هر ۵ دقیقه چک می‌کنه نوبت‌هایی که ۲ ساعت دیگه (قابل تنظیم) شروع می‌شن و یادآوری SMS + اعلان داخل اپ می‌فرسته |
| پنل مدیر فقط داشبورد و نوبت‌ها وصل بود | الان تب‌های **مشتریان، سرویس‌ها، حسابداری، نظرات، کمپین‌ها/کوپن، تنظیمات** هم به API واقعی وصل شدن |
| پرداخت فقط mock URL بود | `src/utils/zarinpal.js` ساخته شد — اتصال واقعی به درگاه زرین‌پال (sandbox + production). اگه `ZARINPAL_MERCHANT` خالی باشه خودکار mock می‌مونه و چیزی خراب نمی‌شه. `booking.html` و `profile.html` (شارژ کیف پول) الان واقعاً به درگاه ریدایرکت می‌کنن و موقع برگشت صفحه موفقیت/خطا رو نشون می‌دن |
| آپلود عکس فقط toast بود | پروفایل مشتری الان فایل واقعی می‌گیره و به `/api/gallery/upload` می‌فرسته |
| پنل کارمند: تب درآمد و نظرات mock بودن | الان از `/api/workers/me/stats` و `/api/reviews/worker/:id` دیتای واقعی می‌گیرن (نمودار هفتگی، تراکنش‌ها، نظرات واقعی) |
| لیدربرد کارمندان نبود | داشبورد مدیر الان لیدربرد واقعی داره — رتبه‌بندی بر اساس امتیاز و تعداد سرویس این ماه، با مدال 🥇🥈🥉 |
| فرم سفارشی نظرسنجی نبود | `src/routes/surveys.js` — مدیر می‌تونه فرم بسازه (از تب کمپین‌ها)، مشتری جواب می‌ده و ۵ امتیاز جایزه می‌گیره، مدیر نتایج رو می‌بینه |
| چت‌بات پشتیبانی نبود | `src/routes/chatbot.js` — چت‌بات rule-based (بدون نیاز به API هوش مصنوعی خارجی) که سوالات پرتکرار (ساعت کاری، آدرس، رزرو، امتیاز، تخفیف و…) رو جواب می‌ده. `chatbot-widget.js` یه دکمه شناور به همه صفحات مشتری اضافه می‌کنه |

### تنظیمات SMS (اختیاری)
```env
SMS_PROVIDER=kavenegar
SMS_API_KEY=کلید_API_کاوه‌نگار
SMS_SENDER=شماره_فرستنده
```

### تنظیمات پرداخت (اختیاری)
```env
ZARINPAL_MERCHANT=مرچنت_آی‌دی_واقعی
ZARINPAL_SANDBOX=0   # برای production روی 0 بذار
ZARINPAL_CALLBACK_URL=https://yourdomain.com/api/payments/verify
```
اگه `ZARINPAL_MERCHANT` رو خالی بذاری، سیستم خودکار وارد حالت mock می‌شه — یعنی می‌تونی کل فلوی رزرو و پرداخت رو بدون مرچنت واقعی تست کنی (پرداخت همیشه "موفق" برمی‌گرده).



همه صفحات HTML داخل پوشه `public/` قرار گرفتن و سرور Express خودش اونا رو serve می‌کنه — یعنی فرانت و بک‌اند **یک پروژه واحد** هستن:

```
public/
├── index.html          # صفحه اصلی (Landing)
├── admin.html           # پنل مدیر — وصل به /api/admin, /api/appointments
├── booking.html          # رزرو نوبت — وصل به /api/services, /api/workers, /api/appointments
├── worker.html           # پنل کارمند
├── profile.html          # پروفایل مشتری
├── loyalty.html          # امتیاز و وفاداری
├── services.html         # جستجو سرویس‌ها
├── notifications.html    # اعلان‌ها
└── api.js                # ⭐ کلاینت مشترک API (BarberAPI)
```

### چی الان واقعاً وصله؟

| صفحه | وضعیت اتصال |
|---|---|
| `booking.html` | ✅ کامل: OTP لاگین، سرویس‌های واقعی، کارمندان واقعی، زمان خالی واقعی، ثبت نوبت واقعی |
| `admin.html` | ✅ لاگین با PIN واقعی + داشبورد آماری واقعی + جدول نوبت‌ها واقعی |
| بقیه صفحات | 🔲 هنوز دیتای نمونه (mock) — با همین الگوی `api.js` به‌راحتی قابل اتصاله |

### نحوه اتصال بقیه صفحات (الگو)
هر صفحه‌ای که می‌خوای وصل کنی:
1. `<script src="api.js"></script>` رو بالای اسکریپت اصلی صفحه اضافه کن
2. به‌جای آرایه‌های mock، از متدهای `BarberAPI` استفاده کن، مثلاً:
```js
const res = await BarberAPI.customer.me();
const res = await BarberAPI.notifications.list();
const res = await BarberAPI.customer.wallet();
```
3. برای صفحات محافظت‌شده، اول چک کن:
```js
if (!BarberAPI.isLoggedIn('customer')) { /* نمایش OTP یا ریدایرکت */ }
```

تمام متدهای موجود در `api.js` مستندن (auth, services, workers, appointments, customer, reviews, coupons, payments, notifications, gallery, admin).

---

## 🚀 دیپلوی (Production)

### گزینه ۱ — یک سرور ساده (VPS / Railway / Render)
چون فرانت‌اند الان داخل `public/` هست و توسط همین Express سرو می‌شه، فقط کافیه:

```bash
npm install
npm run db:init
npm run db:seed
NODE_ENV=production npm start
```

سپس کل سایت (هم فرانت هم API) روی یک پورت در دسترسه:
```
https://yourdomain.com/           → صفحه اصلی
https://yourdomain.com/booking.html → رزرو
https://yourdomain.com/admin.html   → پنل مدیر
https://yourdomain.com/api/...      → API
```

### گزینه ۲ — Vercel
> ⚠️ Vercel سرورلسه و فایل SQLite روی دیسک پایدار نمی‌مونه. برای دیپلوی روی Vercel باید دیتابیس رو به **Supabase (Postgres)** مهاجرت بدی (بخش پایین).

```bash
npm i -g vercel
vercel --prod
```
فایل `vercel.json` آماده‌ست و مسیرهای API + فایل‌های `public/` رو هندل می‌کنه.

### چک‌لیست قبل از دیپلوی واقعی
- [ ] `.env` رو با مقادیر واقعی پر کن (`JWT_SECRET` قوی، `ADMIN_PIN` جدید، API پیامک واقعی)
- [ ] در `auth.js` بخش `console.log(OTP)` رو حذف کن و به یک سرویس SMS واقعی (کاوه‌نگار، ملی‌پیامک و ...) وصل کن
- [ ] در `payments.js` بخش mock رو با ZarinPal واقعی جایگزین کن
- [ ] تابع `jalaliDisplayToIso` در `booking.html` فعلاً placeholder هست — با کتابخونه `jalaali-js` جایگزین کن تا تاریخ شمسی درست به میلادی تبدیل بشه
- [ ] CORS رو در `.env` با دامنه واقعی محدود کن (`ALLOWED_ORIGINS`)

---

## 🗄️ مهاجرت به Supabase (برای production واقعی)

```bash
npm install pg
```

سپس `src/utils/db.js` رو با یک wrapper Postgres جایگزین کن که همون متدهای `.prepare().run()/.get()/.all()` رو شبیه‌سازی کنه، یا کوئری‌ها رو به syntax PostgreSQL (`$1, $2...`) تبدیل کن. اسکیمای `initDb.js` با تغییرات جزئی (`TEXT PRIMARY KEY DEFAULT gen_random_uuid()`) روی Postgres هم جواب می‌ده.

