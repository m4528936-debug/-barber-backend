// src/routes/campaigns.js
const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../utils/db');
const { authAdmin } = require('../middleware/auth');

// List campaigns
router.get('/', authAdmin, (req, res) => {
  const campaigns = db.prepare('SELECT * FROM campaigns ORDER BY created_at DESC').all();
  res.json({ success: true, data: campaigns });
});

// Create campaign
router.post('/', authAdmin, (req, res) => {
  const { title, message, target, channel, scheduled_at } = req.body;
  if (!title || !message) return res.status(400).json({ success: false, error: 'اطلاعات ناقص' });
  const id = uuid();
  db.prepare('INSERT INTO campaigns (id, title, message, target, channel, scheduled_at) VALUES (?,?,?,?,?,?)')
    .run(id, title, message, target || 'all', channel || 'sms', scheduled_at || null);
  res.status(201).json({ success: true, id });
});

// Send campaign
router.post('/:id/send', authAdmin, (req, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ success: false, error: 'کمپین یافت نشد' });

  // Get target customers
  let customers = [];
  if (campaign.target === 'all') {
    customers = db.prepare('SELECT id, phone FROM customers WHERE is_blacklisted = 0').all();
  } else if (campaign.target === 'inactive') {
    customers = db.prepare("SELECT id, phone FROM customers WHERE last_visit < date('now','-60 days') OR last_visit IS NULL").all();
  } else {
    customers = db.prepare('SELECT id, phone FROM customers WHERE tier = ? AND is_blacklisted = 0').all(campaign.target);
  }

  // Create notifications
  const insert = db.prepare('INSERT INTO notifications (id, customer_id, type, title, body) VALUES (?,?,?,?,?)');
  const sendAll = db.transaction(() => {
    customers.forEach(c => insert.run(uuid(), c.id, 'promo', campaign.title, campaign.message));
  });
  sendAll();

  // TODO: Send actual SMS/WhatsApp
  console.log(`📣 Campaign "${campaign.title}" sent to ${customers.length} customers`);

  db.prepare('UPDATE campaigns SET status = "sent", sent_count = ?, sent_at = datetime("now") WHERE id = ?')
    .run(customers.length, campaign.id);

  res.json({ success: true, sent: customers.length });
});

module.exports = router;
