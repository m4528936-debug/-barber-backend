// src/routes/admin.js
const router = require('express').Router();
const db = require('../utils/db');
const { authAdmin } = require('../middleware/auth');

// ── DASHBOARD STATS ──
router.get('/dashboard', authAdmin, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 8) + '01';
  const weekStart = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  // Today
  const todayStats = db.prepare(`
    SELECT COUNT(*) as appointments,
    COALESCE(SUM(CASE WHEN status='done' THEN final_price ELSE 0 END),0) as income,
    COALESCE(SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END),0) as cancels
    FROM appointments WHERE date = ?
  `).get(today);

  // Month
  const monthStats = db.prepare(`
    SELECT COUNT(*) as appointments,
    COALESCE(SUM(CASE WHEN status='done' THEN final_price ELSE 0 END),0) as income,
    COALESCE(SUM(CASE WHEN status='done' THEN discount ELSE 0 END),0) as discounts
    FROM appointments WHERE date >= ?
  `).get(monthStart);

  // New customers this month
  const newCustomers = db.prepare("SELECT COUNT(*) as c FROM customers WHERE created_at >= ?").get(monthStart).c;

  // Average rating
  const avgRating = db.prepare("SELECT ROUND(AVG(rating),1) as avg FROM reviews WHERE status = 'approved'").get().avg;

  // Daily income last 7 days
  const weeklyIncome = db.prepare(`
    SELECT date, COALESCE(SUM(CASE WHEN status='done' THEN final_price ELSE 0 END),0) as income,
    COUNT(*) as appointments
    FROM appointments WHERE date >= ? GROUP BY date ORDER BY date
  `).all(weekStart);

  // Top services
  const topServices = db.prepare(`
    SELECT s.name, COUNT(*) as count, COALESCE(SUM(a.final_price),0) as income
    FROM appointments a, json_each(a.services) je
    JOIN services s ON s.id = je.value
    WHERE a.status = 'done' AND a.date >= ?
    GROUP BY s.id ORDER BY count DESC LIMIT 5
  `).all(monthStart);

  // Worker performance
  const workerStats = db.prepare(`
    SELECT w.id, w.name, w.rating,
    COUNT(a.id) as appointments,
    COALESCE(SUM(CASE WHEN a.status='done' THEN a.final_price ELSE 0 END),0) as income,
    COALESCE(SUM(CASE WHEN a.status='cancelled' THEN 1 ELSE 0 END),0) as cancels
    FROM workers w LEFT JOIN appointments a ON a.worker_id = w.id AND a.date >= ?
    WHERE w.is_active = 1 GROUP BY w.id
  `).all(monthStart);

  // Leaderboard — ranked by (rating * 20 + services done this month) score
  const leaderboard = db.prepare(`
    SELECT w.id, w.name, w.avatar, w.rating, w.rating_count,
    COALESCE(SUM(CASE WHEN a.status='done' THEN 1 ELSE 0 END),0) as services_this_month,
    COALESCE(SUM(CASE WHEN a.status='done' THEN a.final_price ELSE 0 END),0) as income_this_month
    FROM workers w LEFT JOIN appointments a ON a.worker_id = w.id AND a.date >= ?
    WHERE w.is_active = 1
    GROUP BY w.id
    ORDER BY (w.rating * 20 + services_this_month) DESC
  `).all(monthStart).map((w, i) => ({ ...w, rank: i + 1 }));

  // Customer tiers
  const tiers = db.prepare("SELECT tier, COUNT(*) as count FROM customers GROUP BY tier").all();

  // Peak hours heatmap
  const peakHours = db.prepare(`
    SELECT strftime('%H', start_time) as hour,
    CASE cast(strftime('%w', date) as integer)
      WHEN 6 THEN 0 WHEN 0 THEN 1 WHEN 1 THEN 2
      WHEN 2 THEN 3 WHEN 3 THEN 4 WHEN 4 THEN 5 WHEN 5 THEN 6
    END as day_of_week,
    COUNT(*) as count
    FROM appointments WHERE status = 'done' AND date >= ?
    GROUP BY hour, day_of_week ORDER BY day_of_week, hour
  `).all(weekStart);

  // Pending items
  const pendingReviews = db.prepare("SELECT COUNT(*) as c FROM reviews WHERE status = 'pending'").get().c;
  const pendingLeaves = db.prepare("SELECT COUNT(*) as c FROM worker_leaves WHERE status = 'pending'").get().c;
  const pendingGallery = db.prepare("SELECT COUNT(*) as c FROM gallery WHERE is_approved = 0").get().c;
  const waitingList = db.prepare("SELECT COUNT(*) as c FROM waiting_list WHERE status = 'waiting'").get().c;

  // Smart alerts
  const alerts = [];
  const lastWeekIncome = db.prepare(`SELECT COALESCE(SUM(final_price),0) as inc FROM appointments WHERE status='done' AND date >= date('now','-14 days') AND date < date('now','-7 days')`).get().inc;
  const thisWeekIncome = db.prepare(`SELECT COALESCE(SUM(final_price),0) as inc FROM appointments WHERE status='done' AND date >= date('now','-7 days')`).get().inc;
  if (lastWeekIncome > 0 && thisWeekIncome < lastWeekIncome * 0.8) {
    alerts.push({ type: 'warning', message: `درآمد این هفته ${Math.round((1 - thisWeekIncome / lastWeekIncome) * 100)}٪ کمتر از هفته قبل است` });
  }
  const inactiveCustomers = db.prepare("SELECT COUNT(*) as c FROM customers WHERE last_visit < date('now','-60 days') OR last_visit IS NULL").get().c;
  if (inactiveCustomers > 0) alerts.push({ type: 'info', message: `${inactiveCustomers} مشتری بیش از ۶۰ روز است که نیامده‌اند` });

  // Monthly target
  const targetSetting = db.prepare("SELECT value FROM settings WHERE key = 'monthly_target'").get();
  const monthlyTarget = parseInt(targetSetting?.value || 0);
  const targetProgress = monthlyTarget > 0 ? Math.round(monthStats.income / monthlyTarget * 100) : null;

  res.json({
    success: true,
    data: {
      today: todayStats,
      month: { ...monthStats, newCustomers, target: monthlyTarget, progress: targetProgress },
      avgRating,
      weeklyIncome,
      topServices,
      workerStats,
      leaderboard,
      tiers,
      peakHours,
      pending: { reviews: pendingReviews, leaves: pendingLeaves, gallery: pendingGallery, waitingList },
      alerts
    }
  });
});

// ── SET MONTHLY TARGET ──
router.post('/target', authAdmin, (req, res) => {
  const { amount } = req.body;
  db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('monthly_target', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(String(amount));
  res.json({ success: true });
});

// ── EXPORT REPORT ──
router.get('/report', authAdmin, (req, res) => {
  const { from, to, type = 'monthly' } = req.query;
  const start = from || new Date(new Date().setDate(1)).toISOString().split('T')[0];
  const end = to || new Date().toISOString().split('T')[0];

  const appointments = db.prepare(`
    SELECT a.*, c.name as customer_name, c.phone, w.name as worker_name
    FROM appointments a
    JOIN customers c ON c.id = a.customer_id
    JOIN workers w ON w.id = a.worker_id
    WHERE a.date BETWEEN ? AND ? ORDER BY a.date, a.start_time
  `).all(start, end);

  const summary = db.prepare(`
    SELECT COUNT(*) as total,
    SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) as done,
    SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) as cancelled,
    COALESCE(SUM(CASE WHEN status='done' THEN final_price ELSE 0 END),0) as income,
    COALESCE(SUM(CASE WHEN status='done' THEN discount ELSE 0 END),0) as discounts
    FROM appointments WHERE date BETWEEN ? AND ?
  `).get(start, end);

  res.json({ success: true, data: { appointments, summary, period: { from: start, to: end } } });
});

// ── WAITING LIST (admin) ──
router.get('/waiting-list', authAdmin, (req, res) => {
  const list = db.prepare(`
    SELECT wl.*, c.name as customer_name, c.phone, w.name as worker_name
    FROM waiting_list wl
    JOIN customers c ON c.id = wl.customer_id
    LEFT JOIN workers w ON w.id = wl.worker_id
    WHERE wl.status = 'waiting' ORDER BY wl.created_at
  `).all();
  res.json({ success: true, data: list });
});

module.exports = router;
