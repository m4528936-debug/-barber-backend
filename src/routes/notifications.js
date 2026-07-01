// src/routes/notifications.js
const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../utils/db');
const { authCustomer, authAdmin } = require('../middleware/auth');

// Get my notifications
router.get('/', authCustomer, (req, res) => {
  const { type, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let where = 'WHERE customer_id = ?';
  const params = [req.customer.id];
  if (type) { where += ' AND type = ?'; params.push(type); }
  const notifs = db.prepare(`SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
  const unread = db.prepare('SELECT COUNT(*) as c FROM notifications WHERE customer_id = ? AND is_read = 0').get(req.customer.id).c;
  res.json({ success: true, data: notifs, unread });
});

// Mark as read
router.patch('/:id/read', authCustomer, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND customer_id = ?').run(req.params.id, req.customer.id);
  res.json({ success: true });
});

// Mark all as read
router.patch('/read-all', authCustomer, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE customer_id = ?').run(req.customer.id);
  res.json({ success: true });
});

// Delete notification
router.delete('/:id', authCustomer, (req, res) => {
  db.prepare('DELETE FROM notifications WHERE id = ? AND customer_id = ?').run(req.params.id, req.customer.id);
  res.json({ success: true });
});

// Admin: send notification to customer(s)
router.post('/send', authAdmin, (req, res) => {
  const { customer_ids, type, title, body, data } = req.body;
  if (!title || !body) return res.status(400).json({ success: false, error: 'اطلاعات ناقص' });

  let targets = [];
  if (!customer_ids || customer_ids === 'all') {
    targets = db.prepare('SELECT id FROM customers WHERE is_blacklisted = 0').all().map(r => r.id);
  } else {
    targets = Array.isArray(customer_ids) ? customer_ids : [customer_ids];
  }

  const insert = db.prepare('INSERT INTO notifications (id, customer_id, type, title, body, data) VALUES (?,?,?,?,?,?)');
  const insertMany = db.transaction((ids) => {
    ids.forEach(cid => insert.run(uuid(), cid, type || 'system', title, body, JSON.stringify(data || {})));
  });
  insertMany(targets);

  res.json({ success: true, sent: targets.length });
});

module.exports = router;
