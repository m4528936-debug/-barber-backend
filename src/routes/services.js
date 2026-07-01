// src/routes/services.js
const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../utils/db');
const { authAdmin } = require('../middleware/auth');

// Public: list services
router.get('/', (req, res) => {
  const { category, search } = req.query;
  let where = 'WHERE is_active = 1';
  const params = [];
  if (category) { where += ' AND category = ?'; params.push(category); }
  if (search) { where += ' AND (name LIKE ? OR description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  const services = db.prepare(`SELECT * FROM services ${where} ORDER BY sort_order, is_popular DESC`).all(...params);
  res.json({ success: true, data: services });
});

// Public: single service
router.get('/:id', (req, res) => {
  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
  if (!service) return res.status(404).json({ success: false, error: 'سرویس یافت نشد' });

  // get prices per worker
  const workerPrices = db.prepare(`
    SELECT w.id, w.name, w.avatar, w.rating,
           COALESCE(ws.price, s.base_price) as price
    FROM workers w
    CROSS JOIN services s ON s.id = ?
    LEFT JOIN worker_services ws ON ws.worker_id = w.id AND ws.service_id = s.id
    WHERE w.is_active = 1 AND (ws.is_active = 1 OR ws.id IS NULL)
  `).all(service.id);

  res.json({ success: true, data: { ...service, workers: workerPrices } });
});

// Admin: create service
router.post('/', authAdmin, (req, res) => {
  const { name, category, description, base_price, duration_min, is_popular, sort_order } = req.body;
  if (!name || !category || !base_price || !duration_min)
    return res.status(400).json({ success: false, error: 'اطلاعات ناقص' });
  const id = uuid();
  db.prepare(`INSERT INTO services (id, name, category, description, base_price, duration_min, is_popular, sort_order)
    VALUES (?,?,?,?,?,?,?,?)`).run(id, name, category, description || null, base_price, duration_min, is_popular ? 1 : 0, sort_order || 0);
  res.status(201).json({ success: true, id });
});

// Admin: update service
router.patch('/:id', authAdmin, (req, res) => {
  const { name, category, description, base_price, duration_min, is_active, is_popular, sort_order } = req.body;
  db.prepare(`UPDATE services SET
    name = COALESCE(?,name), category = COALESCE(?,category),
    description = COALESCE(?,description), base_price = COALESCE(?,base_price),
    duration_min = COALESCE(?,duration_min), is_active = COALESCE(?,is_active),
    is_popular = COALESCE(?,is_popular), sort_order = COALESCE(?,sort_order),
    updated_at = datetime('now') WHERE id = ?`
  ).run(name||null,category||null,description||null,base_price||null,duration_min||null,
    is_active!=null?is_active:null, is_popular!=null?is_popular:null, sort_order||null, req.params.id);
  res.json({ success: true });
});

// Admin: delete (soft)
router.delete('/:id', authAdmin, (req, res) => {
  db.prepare('UPDATE services SET is_active = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Admin: set worker price
router.post('/:id/worker-price', authAdmin, (req, res) => {
  const { worker_id, price } = req.body;
  const id = uuid();
  db.prepare(`INSERT INTO worker_services (id, worker_id, service_id, price)
    VALUES (?,?,?,?) ON CONFLICT(worker_id, service_id) DO UPDATE SET price = excluded.price`)
    .run(id, worker_id, req.params.id, price);
  res.json({ success: true });
});

module.exports = router;
