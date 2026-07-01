// src/routes/customers.js
const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../utils/db');
const { authCustomer, authAdmin } = require('../middleware/auth');

// GET profile
router.get('/me', authCustomer, (req, res) => {
  const c = req.customer;
  const stats = db.prepare('SELECT COUNT(*) as total, SUM(final_price) as spent FROM appointments WHERE customer_id = ? AND status = "done"').get(c.id);
  const refs = db.prepare('SELECT COUNT(*) as count FROM customers WHERE referred_by = ?').get(c.id);
  res.json({ success: true, data: { ...c, stats, referrals: refs.count } });
});

// UPDATE profile
router.patch('/me', authCustomer, (req, res) => {
  const { name, birth_date } = req.body;
  db.prepare('UPDATE customers SET name = COALESCE(?, name), birth_date = COALESCE(?, birth_date), updated_at = datetime("now") WHERE id = ?')
    .run(name || null, birth_date || null, req.customer.id);
  const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.customer.id);
  res.json({ success: true, data: updated });
});

// GET saved services
router.get('/me/saved', authCustomer, (req, res) => {
  // Saved services stored in customer profile as JSON
  const c = db.prepare('SELECT saved_services FROM customers WHERE id = ?').get(req.customer.id);
  const ids = JSON.parse(c?.saved_services || '[]');
  if (!ids.length) return res.json({ success: true, data: [] });
  const services = db.prepare(`SELECT * FROM services WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  res.json({ success: true, data: services });
});

// TOGGLE save service
router.post('/me/saved/:serviceId', authCustomer, (req, res) => {
  const cust = db.prepare('SELECT saved_services FROM customers WHERE id = ?').get(req.customer.id);
  let saved = JSON.parse(cust?.saved_services || '[]');
  const idx = saved.indexOf(req.params.serviceId);
  if (idx >= 0) saved.splice(idx, 1);
  else saved.push(req.params.serviceId);
  db.prepare('UPDATE customers SET saved_services = ? WHERE id = ?').run(JSON.stringify(saved), req.customer.id);
  res.json({ success: true, saved });
});

// GET wallet transactions
router.get('/me/wallet', authCustomer, (req, res) => {
  const txs = db.prepare('SELECT * FROM wallet_transactions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50').all(req.customer.id);
  res.json({ success: true, data: txs, balance: req.customer.wallet });
});

// GET points transactions
router.get('/me/points', authCustomer, (req, res) => {
  const txs = db.prepare('SELECT * FROM points_transactions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50').all(req.customer.id);
  res.json({ success: true, data: txs, points: req.customer.points });
});

// Admin: list customers
router.get('/', authAdmin, (req, res) => {
  const { search, tier, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let where = 'WHERE 1=1';
  const params = [];
  if (search) { where += ' AND (name LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (tier) { where += ' AND tier = ?'; params.push(tier); }
  const customers = db.prepare(`SELECT * FROM customers ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
  const total = db.prepare(`SELECT COUNT(*) as c FROM customers ${where}`).get(...params).c;
  res.json({ success: true, data: customers, total });
});

// Admin: blacklist
router.patch('/:id/blacklist', authAdmin, (req, res) => {
  const { is_blacklisted, reason } = req.body;
  db.prepare('UPDATE customers SET is_blacklisted = ? WHERE id = ?').run(is_blacklisted ? 1 : 0, req.params.id);
  res.json({ success: true });
});

module.exports = router;
