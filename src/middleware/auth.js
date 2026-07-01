// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const db = require('../utils/db');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_change_me';

// ── SIGN TOKEN ──
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '30d' });
}

// ── VERIFY CUSTOMER ──
function authCustomer(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'توکن یافت نشد' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'customer') return res.status(403).json({ success: false, error: 'دسترسی مجاز نیست' });
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(decoded.id);
    if (!customer) return res.status(401).json({ success: false, error: 'مشتری یافت نشد' });
    if (customer.is_blacklisted) return res.status(403).json({ success: false, error: 'حساب شما مسدود شده' });
    req.customer = customer;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'توکن نامعتبر است' });
  }
}

// ── VERIFY WORKER ──
function authWorker(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'توکن یافت نشد' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!['worker', 'admin'].includes(decoded.role)) return res.status(403).json({ success: false, error: 'دسترسی مجاز نیست' });
    const worker = db.prepare('SELECT * FROM workers WHERE id = ?').get(decoded.id);
    if (!worker || !worker.is_active) return res.status(401).json({ success: false, error: 'کارمند یافت نشد' });
    req.worker = worker;
    req.role = decoded.role;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'توکن نامعتبر است' });
  }
}

// ── VERIFY ADMIN (PIN-based) ──
function authAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'توکن یافت نشد' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ success: false, error: 'فقط مدیر دسترسی دارد' });
    req.admin = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'توکن نامعتبر است' });
  }
}

// ── OPTIONAL AUTH (customer or guest) ──
function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role === 'customer') {
      req.customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(decoded.id);
    }
  } catch (e) {}
  next();
}

module.exports = { signToken, authCustomer, authWorker, authAdmin, optionalAuth };
