// src/routes/reviews.js
const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../utils/db');
const { authCustomer, authAdmin } = require('../middleware/auth');

// Public: get approved reviews for worker
router.get('/worker/:workerId', (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;
  const reviews = db.prepare(`
    SELECT r.*, c.name as customer_name, c.avatar as customer_avatar
    FROM reviews r JOIN customers c ON c.id = r.customer_id
    WHERE r.worker_id = ? AND r.status = 'approved'
    ORDER BY r.created_at DESC LIMIT ? OFFSET ?
  `).all(req.params.workerId, parseInt(limit), offset);

  const stats = db.prepare(`
    SELECT COUNT(*) as total, AVG(rating) as avg,
    SUM(CASE WHEN rating=5 THEN 1 ELSE 0 END) as s5,
    SUM(CASE WHEN rating=4 THEN 1 ELSE 0 END) as s4,
    SUM(CASE WHEN rating=3 THEN 1 ELSE 0 END) as s3,
    SUM(CASE WHEN rating=2 THEN 1 ELSE 0 END) as s2,
    SUM(CASE WHEN rating=1 THEN 1 ELSE 0 END) as s1
    FROM reviews WHERE worker_id = ? AND status = 'approved'
  `).get(req.params.workerId);

  res.json({ success: true, data: reviews, stats });
});

// Customer: submit review
router.post('/', authCustomer, (req, res) => {
  const { appointment_id, rating, comment } = req.body;
  if (!appointment_id || !rating)
    return res.status(400).json({ success: false, error: 'اطلاعات ناقص' });
  if (rating < 1 || rating > 5)
    return res.status(400).json({ success: false, error: 'امتیاز باید بین ۱ تا ۵ باشد' });

  const appt = db.prepare('SELECT * FROM appointments WHERE id = ? AND customer_id = ? AND status = "done"').get(appointment_id, req.customer.id);
  if (!appt) return res.status(404).json({ success: false, error: 'نوبت یافت نشد یا تکمیل نشده' });

  const existing = db.prepare('SELECT id FROM reviews WHERE appointment_id = ?').get(appointment_id);
  if (existing) return res.status(400).json({ success: false, error: 'قبلاً نظر ثبت کرده‌اید' });

  const id = uuid();
  db.prepare('INSERT INTO reviews (id, appointment_id, customer_id, worker_id, rating, comment) VALUES (?,?,?,?,?,?)')
    .run(id, appointment_id, req.customer.id, appt.worker_id, rating, comment || null);

  // Bonus points for review
  db.prepare('UPDATE customers SET points = points + 10 WHERE id = ?').run(req.customer.id);
  db.prepare('INSERT INTO points_transactions (id, customer_id, amount, type, description) VALUES (?,?,?,?,?)')
    .run(uuid(), req.customer.id, 10, 'bonus', 'امتیاز ثبت نظر');

  res.status(201).json({ success: true, message: 'نظر شما ثبت شد و پس از تأیید نمایش داده می‌شود' });
});

// Admin: get pending reviews
router.get('/pending', authAdmin, (req, res) => {
  const reviews = db.prepare(`
    SELECT r.*, c.name as customer_name, w.name as worker_name
    FROM reviews r JOIN customers c ON c.id = r.customer_id JOIN workers w ON w.id = r.worker_id
    WHERE r.status = 'pending' ORDER BY r.created_at DESC
  `).all();
  res.json({ success: true, data: reviews });
});

// Admin: approve/reject review
router.patch('/:id/status', authAdmin, (req, res) => {
  const { status } = req.body;
  if (!['approved','rejected'].includes(status))
    return res.status(400).json({ success: false, error: 'وضعیت نامعتبر' });

  db.prepare('UPDATE reviews SET status = ? WHERE id = ?').run(status, req.params.id);

  if (status === 'approved') {
    // Recalculate worker rating
    const review = db.prepare('SELECT worker_id FROM reviews WHERE id = ?').get(req.params.id);
    const stats = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as cnt FROM reviews WHERE worker_id = ? AND status = "approved"').get(review.worker_id);
    db.prepare('UPDATE workers SET rating = ?, rating_count = ? WHERE id = ?').run(
      Math.round(stats.avg * 10) / 10, stats.cnt, review.worker_id
    );
  }

  res.json({ success: true });
});

module.exports = router;
