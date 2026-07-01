// src/routes/gallery.js
const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../utils/db');
const multer = require('multer');
const path = require('path');
const { authCustomer, authAdmin, optionalAuth } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: process.env.UPLOAD_DIR || './uploads',
  filename: (req, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5242880 } });

// Public: get approved gallery
router.get('/', (req, res) => {
  const { worker_id, service_id, page = 1, limit = 12 } = req.query;
  const offset = (page - 1) * limit;
  let where = 'WHERE is_approved = 1';
  const params = [];
  if (worker_id) { where += ' AND worker_id = ?'; params.push(worker_id); }
  if (service_id) { where += ' AND service_id = ?'; params.push(service_id); }
  const items = db.prepare(`SELECT * FROM gallery ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
  res.json({ success: true, data: items });
});

// Customer: upload photo
router.post('/upload', authCustomer, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'فایل یافت نشد' });
  const id = uuid();
  const imageUrl = `/uploads/${req.file.filename}`;
  db.prepare('INSERT INTO gallery (id, image, caption, uploaded_by, customer_id) VALUES (?,?,?,?,?)')
    .run(id, imageUrl, req.body.caption || null, req.customer.id, req.customer.id);
  res.status(201).json({ success: true, image: imageUrl, message: 'عکس ارسال شد و پس از تأیید نمایش داده می‌شود' });
});

// Admin: upload photo (auto approved)
router.post('/admin/upload', authAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: 'فایل یافت نشد' });
  const id = uuid();
  const imageUrl = `/uploads/${req.file.filename}`;
  db.prepare('INSERT INTO gallery (id, image, caption, uploaded_by, worker_id, service_id, is_approved) VALUES (?,?,?,?,?,?,1)')
    .run(id, imageUrl, req.body.caption || null, 'admin', req.body.worker_id || null, req.body.service_id || null);
  res.status(201).json({ success: true, image: imageUrl });
});

// Admin: approve/delete
router.patch('/:id/approve', authAdmin, (req, res) => {
  db.prepare('UPDATE gallery SET is_approved = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});
router.delete('/:id', authAdmin, (req, res) => {
  db.prepare('DELETE FROM gallery WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
