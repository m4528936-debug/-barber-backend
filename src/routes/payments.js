// src/routes/payments.js
const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../utils/db');
const { authCustomer, authAdmin } = require('../middleware/auth');
const zarinpal = require('../utils/zarinpal');

// ── INITIATE APPOINTMENT PAYMENT (real ZarinPal, mock if no merchant configured) ──
router.post('/initiate', authCustomer, async (req, res) => {
  const { appointment_id } = req.body;
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ? AND customer_id = ?').get(appointment_id, req.customer.id);
  if (!appt) return res.status(404).json({ success: false, error: 'نوبت یافت نشد' });
  if (appt.payment_status === 'paid') return res.status(400).json({ success: false, error: 'قبلاً پرداخت شده' });
  if (appt.final_price <= 0) {
    // free appointment (e.g. fully covered by points) — mark paid directly
    db.prepare('UPDATE appointments SET payment_status = "paid", status = "confirmed" WHERE id = ?').run(appointment_id);
    return res.json({ success: true, free: true, message: 'پرداخت نیاز نبود' });
  }

  try {
    const result = await zarinpal.requestPayment({
      amount: appt.final_price,
      description: `رزرو نوبت ${appt.date} - General Barber Shop`,
      mobile: req.customer.phone,
      callbackParams: { appointment_id },
    });

    // store authority so we can verify it later
    db.prepare('UPDATE appointments SET payment_ref = ? WHERE id = ?').run(result.authority, appointment_id);

    res.json({ success: true, payment_url: result.payment_url, amount: appt.final_price, mock: result.mock });
  } catch (e) {
    res.status(502).json({ success: false, error: e.message });
  }
});

// ── VERIFY APPOINTMENT PAYMENT (callback from ZarinPal) ──
router.get('/verify', async (req, res) => {
  const { Authority, appointment_id, Status } = req.query;

  if (Status !== 'OK') {
    if (appointment_id) {
      db.prepare('UPDATE appointments SET payment_status = "pending" WHERE id = ?').run(appointment_id);
    }
    return res.redirect(`/booking.html?payment=failed&reason=cancelled`);
  }

  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(appointment_id);
  if (!appt) return res.redirect(`/booking.html?payment=failed&reason=not_found`);
  if (appt.payment_status === 'paid') return res.redirect(`/booking.html?payment=success&id=${appointment_id}`);

  try {
    const result = await zarinpal.verifyPayment({ authority: Authority, amount: appt.final_price });
    if (!result.success) {
      return res.redirect(`/booking.html?payment=failed&reason=verify_failed`);
    }

    db.prepare('UPDATE appointments SET payment_status = "paid", payment_ref = ?, status = "confirmed" WHERE id = ?')
      .run(result.ref_id, appointment_id);

    db.prepare('INSERT INTO notifications (id, customer_id, type, title, body) VALUES (?,?,?,?,?)')
      .run(uuid(), appt.customer_id, 'appt', '✅ پرداخت موفق', `پرداخت نوبت ${appt.date} ساعت ${appt.start_time} تأیید شد.`);

    res.redirect(`/booking.html?payment=success&id=${appointment_id}&ref=${result.ref_id}`);
  } catch (e) {
    res.redirect(`/booking.html?payment=failed&reason=error`);
  }
});

// ── PAYMENT STATUS CHECK (for frontend polling, in case redirect flow is used) ──
router.get('/status/:appointmentId', authCustomer, (req, res) => {
  const appt = db.prepare('SELECT id, payment_status, status, final_price FROM appointments WHERE id = ? AND customer_id = ?')
    .get(req.params.appointmentId, req.customer.id);
  if (!appt) return res.status(404).json({ success: false, error: 'نوبت یافت نشد' });
  res.json({ success: true, data: appt });
});

// ── CHARGE WALLET (real ZarinPal) ──
router.post('/wallet/charge', authCustomer, async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount < 10000) return res.status(400).json({ success: false, error: 'حداقل شارژ ۱۰,۰۰۰ تومان' });

  try {
    const result = await zarinpal.requestPayment({
      amount,
      description: `شارژ کیف پول General Barber Shop`,
      mobile: req.customer.phone,
      callbackParams: { customer_id: req.customer.id, amount, type: 'wallet' },
    });
    res.json({ success: true, payment_url: result.payment_url, mock: result.mock });
  } catch (e) {
    res.status(502).json({ success: false, error: e.message });
  }
});

// ── WALLET CHARGE CALLBACK ──
router.get('/wallet/verify', async (req, res) => {
  const { Authority, customer_id, amount, Status } = req.query;
  if (Status !== 'OK') return res.redirect('/profile.html?wallet=failed');

  try {
    const result = await zarinpal.verifyPayment({ authority: Authority, amount: parseInt(amount) });
    if (!result.success) return res.redirect('/profile.html?wallet=failed');

    db.prepare('UPDATE customers SET wallet = wallet + ? WHERE id = ?').run(parseInt(amount), customer_id);
    db.prepare('INSERT INTO wallet_transactions (id, customer_id, amount, type, description, ref_id) VALUES (?,?,?,?,?,?)')
      .run(uuid(), customer_id, parseInt(amount), 'charge', 'شارژ کیف پول', result.ref_id);
    db.prepare('INSERT INTO notifications (id, customer_id, type, title, body) VALUES (?,?,?,?,?)')
      .run(uuid(), customer_id, 'wallet', '👛 کیف پول شارژ شد', `${parseInt(amount).toLocaleString()} تومان به کیف پول اضافه شد.`);

    res.redirect('/profile.html?wallet=success');
  } catch (e) {
    res.redirect('/profile.html?wallet=failed');
  }
});

// ── ADMIN: WITHDRAW WALLET ──
router.post('/wallet/withdraw', authAdmin, (req, res) => {
  const { customer_id, amount, note } = req.body;
  const customer = db.prepare('SELECT wallet FROM customers WHERE id = ?').get(customer_id);
  if (!customer || customer.wallet < amount)
    return res.status(400).json({ success: false, error: 'موجودی کافی نیست' });
  db.prepare('UPDATE customers SET wallet = wallet - ? WHERE id = ?').run(amount, customer_id);
  db.prepare('INSERT INTO wallet_transactions (id, customer_id, amount, type, description) VALUES (?,?,?,?,?)')
    .run(uuid(), customer_id, -amount, 'spend', note || 'برداشت توسط مدیر');
  res.json({ success: true });
});

module.exports = router;
