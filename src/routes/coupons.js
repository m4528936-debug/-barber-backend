// src/routes/coupons.js
const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../utils/db');
const { authCustomer, authAdmin } = require('../middleware/auth');

// Validate coupon
router.post('/validate', authCustomer, (req, res) => {
  const { code, total_price } = req.body;
  const coupon = db.prepare('SELECT * FROM coupons WHERE code = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > datetime("now"))').get(code);
  if (!coupon) return res.status(404).json({ success: false, error: 'کد تخفیف نامعتبر است' });
  if (coupon.max_uses && coupon.used_count >= coupon.max_uses)
    return res.status(400).json({ success: false, error: 'ظرفیت این کد پر شده' });
  if (coupon.for_customer && coupon.for_customer !== req.customer.id)
    return res.status(403).json({ success: false, error: 'این کد برای شما نیست' });
  if (total_price && total_price < coupon.min_price)
    return res.status(400).json({ success: false, error: `حداقل مبلغ ${coupon.min_price.toLocaleString()} تومان` });
  const discount = coupon.type === 'percent'
    ? Math.round((total_price || 0) * coupon.value / 100)
    : coupon.value;
  res.json({ success: true, coupon, discount });
});

// Admin: list coupons
router.get('/', authAdmin, (req, res) => {
  const coupons = db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all();
  res.json({ success: true, data: coupons });
});

// Admin: create coupon
router.post('/', authAdmin, (req, res) => {
  const { code, type, value, min_price, max_uses, expires_at, for_customer } = req.body;
  if (!code || !type || !value) return res.status(400).json({ success: false, error: 'اطلاعات ناقص' });
  const id = uuid();
  db.prepare('INSERT INTO coupons (id, code, type, value, min_price, max_uses, expires_at, for_customer) VALUES (?,?,?,?,?,?,?,?)')
    .run(id, code.toUpperCase(), type, value, min_price||0, max_uses||null, expires_at||null, for_customer||null);
  res.status(201).json({ success: true, id });
});

// Admin: toggle active
router.patch('/:id/toggle', authAdmin, (req, res) => {
  const c = db.prepare('SELECT is_active FROM coupons WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ success: false, error: 'یافت نشد' });
  db.prepare('UPDATE coupons SET is_active = ? WHERE id = ?').run(c.is_active ? 0 : 1, req.params.id);
  res.json({ success: true });
});

module.exports = router;
