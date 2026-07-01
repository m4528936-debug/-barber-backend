// src/routes/workers.js
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('../utils/db');
const { authWorker, authAdmin } = require('../middleware/auth');

// Public: list active workers
router.get('/', (req, res) => {
  const workers = db.prepare('SELECT id, name, bio, avatar, specialties, rating, rating_count, total_services FROM workers WHERE is_active = 1').all();
  res.json({ success: true, data: workers });
});

// Worker: get own stats
router.get('/me/stats', authWorker, (req, res) => {
  const wid = req.worker.id;
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 8) + '01';

  const todayStats = db.prepare('SELECT COUNT(*) as count, COALESCE(SUM(final_price),0) as income FROM appointments WHERE worker_id = ? AND date = ? AND status = "done"').get(wid, today);
  const monthStats = db.prepare('SELECT COUNT(*) as count, COALESCE(SUM(final_price),0) as income FROM appointments WHERE worker_id = ? AND date >= ? AND status = "done"').get(wid, monthStart);
  const weeklyIncome = db.prepare(`
    SELECT date, COALESCE(SUM(final_price),0) as income FROM appointments
    WHERE worker_id = ? AND date >= date('now','-7 days') AND status = 'done'
    GROUP BY date ORDER BY date
  `).all(wid);

  res.json({ success: true, data: { today: todayStats, month: monthStats, weekly: weeklyIncome, worker: req.worker } });
});

// Worker: get schedule
router.get('/me/schedule', authWorker, (req, res) => {
  const schedule = db.prepare('SELECT * FROM worker_schedules WHERE worker_id = ? ORDER BY day_of_week').all(req.worker.id);
  res.json({ success: true, data: schedule });
});

// Worker: request leave
router.post('/me/leaves', authWorker, (req, res) => {
  const { from_date, to_date, type, reason } = req.body;
  const id = uuid();
  db.prepare('INSERT INTO worker_leaves (id, worker_id, from_date, to_date, type, reason) VALUES (?,?,?,?,?,?)').run(id, req.worker.id, from_date, to_date, type || 'vacation', reason || null);
  res.status(201).json({ success: true, message: 'درخواست مرخصی ثبت شد' });
});

// Worker: get leaves
router.get('/me/leaves', authWorker, (req, res) => {
  const leaves = db.prepare('SELECT * FROM worker_leaves WHERE worker_id = ? ORDER BY created_at DESC').all(req.worker.id);
  res.json({ success: true, data: leaves });
});

// Worker: update profile
router.patch('/me', authWorker, (req, res) => {
  const { name, bio, specialties } = req.body;
  db.prepare('UPDATE workers SET name = COALESCE(?,name), bio = COALESCE(?,bio), specialties = COALESCE(?,specialties), updated_at = datetime("now") WHERE id = ?')
    .run(name || null, bio || null, specialties ? JSON.stringify(specialties) : null, req.worker.id);
  res.json({ success: true });
});

// Admin: create worker
router.post('/', authAdmin, async (req, res) => {
  const { name, phone, password, specialties, bio } = req.body;
  if (!name || !phone || !password) return res.status(400).json({ success: false, error: 'اطلاعات ناقص' });
  const hash = await bcrypt.hash(password, 10);
  const id = uuid();
  db.prepare('INSERT INTO workers (id, name, phone, password, bio, specialties) VALUES (?,?,?,?,?,?)').run(id, name, phone, hash, bio || null, JSON.stringify(specialties || []));
  // Default schedule (Sat-Thu 9-22)
  for (let day = 0; day <= 5; day++) {
    db.prepare('INSERT INTO worker_schedules (id, worker_id, day_of_week, start_time, end_time) VALUES (?,?,?,?,?)').run(uuid(), id, day, '09:00', '22:00');
  }
  db.prepare('INSERT INTO worker_schedules (id, worker_id, day_of_week, start_time, end_time, is_off) VALUES (?,?,?,?,?,1)').run(uuid(), id, 6, '09:00', '22:00');
  res.status(201).json({ success: true, message: 'کارمند اضافه شد' });
});

// Admin: approve/reject leave
router.patch('/leaves/:id', authAdmin, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE worker_leaves SET status = ?, approved_by = "admin" WHERE id = ?').run(status, req.params.id);
  const leave = db.prepare('SELECT * FROM worker_leaves WHERE id = ?').get(req.params.id);
  db.prepare('INSERT INTO notifications (id, customer_id, type, title, body) VALUES (?,?,?,?,?)').run(uuid(), null, 'system', status === 'approved' ? '✅ مرخصی تأیید شد' : '❌ مرخصی رد شد', `درخواست مرخصی شما ${status === 'approved' ? 'تأیید' : 'رد'} شد.`);
  res.json({ success: true });
});

module.exports = router;
