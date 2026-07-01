// src/routes/auth.js
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('../utils/db');
const { signToken, authCustomer, authWorker, authAdmin } = require('../middleware/auth');
const sms = require('../utils/sms');

// ── OTP SEND (مشتری) ──
router.post('/send-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone || !/^09\d{9}$/.test(phone))
    return res.status(400).json({ success: false, error: 'شماره موبایل نامعتبر است' });

  // Rate limit: max 3 OTP requests per phone per 10 minutes
  const recentCount = db.prepare(
    `SELECT COUNT(*) as c FROM otps WHERE phone = ? AND created_at > datetime('now', '-10 minutes')`
  ).get(phone).c;
  if (recentCount >= 3)
    return res.status(429).json({ success: false, error: 'تعداد درخواست‌ها زیاد است. کمی صبر کنید.' });

  // Generate 4-digit OTP
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  // Invalidate old OTPs
  db.prepare('DELETE FROM otps WHERE phone = ?').run(phone);
  db.prepare('INSERT INTO otps (id, phone, code, expires_at) VALUES (?, ?, ?, ?)').run(uuid(), phone, code, expiresAt);

  const smsResult = await sms.sendOtp(phone, code);

  res.json({
    success: true,
    message: 'کد تأیید ارسال شد',
    // فقط وقتی واقعاً SMS نرفته (حالت توسعه) کد رو برمی‌گردونیم تا تست راحت باشه
    ...(smsResult.mode === 'console' && { dev_code: code })
  });
});

// ── OTP VERIFY (مشتری) ──
router.post('/verify-otp', (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !code) return res.status(400).json({ success: false, error: 'اطلاعات ناقص' });

  const otp = db.prepare(
    'SELECT * FROM otps WHERE phone = ? AND code = ? AND used = 0 AND expires_at > datetime("now")'
  ).get(phone, code);

  if (!otp) return res.status(400).json({ success: false, error: 'کد نادرست یا منقضی شده' });

  // Mark OTP as used
  db.prepare('UPDATE otps SET used = 1 WHERE id = ?').run(otp.id);

  // Find or create customer
  let customer = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
  const isNew = !customer;

  if (!customer) {
    const id = uuid();
    const refCode = 'GEN-' + Math.random().toString(36).substr(2, 4).toUpperCase();
    db.prepare(
      'INSERT INTO customers (id, phone, referral_code) VALUES (?, ?, ?)'
    ).run(id, phone, refCode);
    customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);

    // Welcome notification
    db.prepare(
      'INSERT INTO notifications (id, customer_id, type, title, body) VALUES (?, ?, ?, ?, ?)'
    ).run(uuid(), id, 'system', '🎉 خوش اومدی!', 'به General Barber Shop خوش اومدی. با هر سرویس امتیاز بگیر!');
  }

  const token = signToken({ id: customer.id, phone: customer.phone, role: 'customer' });

  res.json({
    success: true,
    isNew,
    token,
    customer: sanitizeCustomer(customer)
  });
});

// ── ADMIN LOGIN (PIN) ──
router.post('/admin/login', (req, res) => {
  const { pin } = req.body;
  const correctPin = process.env.ADMIN_PIN || '1234';
  if (!pin || pin !== correctPin)
    return res.status(401).json({ success: false, error: 'PIN نادرست است' });

  const token = signToken({ role: 'admin', id: 'admin' });
  res.json({ success: true, token, role: 'admin' });
});

// ── ADMIN CHANGE PIN ──
router.post('/admin/change-pin', authAdmin, (req, res) => {
  const { newPin } = req.body;
  if (!newPin || !/^\d{4}$/.test(newPin))
    return res.status(400).json({ success: false, error: 'PIN باید ۴ رقم باشد' });

  // In real app: update env or DB
  res.json({ success: true, message: 'PIN بروزرسانی شد' });
});

// ── WORKER LOGIN ──
router.post('/worker/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) return res.status(400).json({ success: false, error: 'اطلاعات ناقص' });

  const worker = db.prepare('SELECT * FROM workers WHERE phone = ? AND is_active = 1').get(phone);
  if (!worker) return res.status(401).json({ success: false, error: 'کارمند یافت نشد' });

  const valid = await bcrypt.compare(password, worker.password);
  if (!valid) return res.status(401).json({ success: false, error: 'رمز عبور نادرست' });

  const token = signToken({ id: worker.id, phone: worker.phone, role: 'worker' });
  res.json({ success: true, token, worker: sanitizeWorker(worker) });
});

// ── GET ME (customer) ──
router.get('/me', authCustomer, (req, res) => {
  res.json({ success: true, customer: sanitizeCustomer(req.customer) });
});

// ── GET ME (worker) ──
router.get('/worker/me', authWorker, (req, res) => {
  res.json({ success: true, worker: sanitizeWorker(req.worker) });
});

function sanitizeCustomer(c) {
  const { ...safe } = c;
  return safe;
}

function sanitizeWorker(w) {
  const { password, ...safe } = w;
  return safe;
}

module.exports = router;
