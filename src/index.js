// src/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ──
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── RATE LIMITING ──
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: 'درخواست زیاد. لطفاً کمی صبر کنید.' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'تلاش زیاد برای ورود.' } });
app.use('/api/', limiter);
app.use('/api/auth/', authLimiter);

// ── STATIC FILES ──
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

// Serve the frontend (all the HTML pages + api.js) from /public
const publicDir = path.join(__dirname, '..', 'public');
if (fs.existsSync(publicDir)) app.use(express.static(publicDir));

// ── DATABASE INIT ──
require('./utils/initDb');

// ── AUTO-SEED ON FIRST BOOT (useful for platforms with no shell access, e.g. Railway) ──
// اگه دیتابیس خالیه (هیچ کارمندی ثبت نشده)، خودکار داده‌های نمونه رو می‌سازه
// این کار باعث می‌شه بدون دسترسی به ترمینال هم بشه پروژه رو راه‌اندازی کرد
(function autoSeedIfEmpty() {
  try {
    const db = require('./utils/db');
    const workerCount = db.prepare('SELECT COUNT(*) as c FROM workers').get().c;
    if (workerCount === 0) {
      console.log('🌱 دیتابیس خالیه — در حال ساخت داده‌های نمونه...');
      require('./utils/seedDb');
    } else {
      console.log(`✅ دیتابیس از قبل آماده‌ست (${workerCount} کارمند ثبت شده)`);
    }
  } catch (e) {
    console.error('⚠️ خطا در auto-seed:', e.message);
  }
})();

// ── REMINDER SCHEDULER ──
const { startReminderScheduler } = require('./utils/reminders');
startReminderScheduler();

// ── ROUTES ──
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/customers',     require('./routes/customers'));
app.use('/api/workers',       require('./routes/workers'));
app.use('/api/services',      require('./routes/services'));
app.use('/api/appointments',  require('./routes/appointments'));
app.use('/api/reviews',       require('./routes/reviews'));
app.use('/api/payments',      require('./routes/payments'));
app.use('/api/coupons',       require('./routes/coupons'));
app.use('/api/surveys',       require('./routes/surveys'));
app.use('/api/chatbot',       require('./routes/chatbot'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/gallery',       require('./routes/gallery'));
app.use('/api/campaigns',     require('./routes/campaigns'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/settings',      require('./routes/settings'));

// ── HEALTH CHECK ──
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), version: '1.0.0', shop: 'General Barber Shop' });
});

// ── PUBLIC SHOP INFO ──
app.get('/api/public/info', (req, res) => {
  const db = require('./utils/db');
  const keys = ['shop_name','shop_phone','shop_address','shop_open','shop_close'];
  const rows = db.prepare(`SELECT key, value FROM settings WHERE key IN (${keys.map(()=>'?').join(',')})`).all(...keys);
  const info = {};
  rows.forEach(r => info[r.key] = r.value);
  res.json({ success: true, data: info });
});

// ── 404 ──
app.use((req, res) => res.status(404).json({ success: false, error: 'مسیر یافت نشد' }));

// ── ERROR HANDLER ──
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ success: false, error: 'حجم فایل زیاد است' });
  res.status(err.status || 500).json({ success: false, error: process.env.NODE_ENV === 'production' ? 'خطای سرور' : err.message });
});

app.listen(PORT, () => {
  console.log(`\n🚀 General Barber Shop API`);
  console.log(`📡 http://localhost:${PORT}/api`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
