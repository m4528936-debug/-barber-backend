// src/routes/settings.js
const router = require('express').Router();
const db = require('../utils/db');
const { authAdmin } = require('../middleware/auth');
const { gregorianToJalaliDisplay, parseJalaliDisplayToGregorian, todayJalaliDisplay } = require('../utils/jalali');

// Public: convert Jalali display date → Gregorian ISO (for booking calendar)
router.get('/jalali-to-gregorian', (req, res) => {
  const { date } = req.query; // e.g. "۱۷ آذر ۱۴۰۳" or "1403/09/17"
  if (!date) return res.status(400).json({ success: false, error: 'تاریخ ارسال نشده' });
  const iso = parseJalaliDisplayToGregorian(date);
  if (!iso) return res.status(400).json({ success: false, error: 'فرمت تاریخ نامعتبر است' });
  res.json({ success: true, gregorian: iso });
});

// Public: convert Gregorian ISO → Jalali display (for showing dates to user)
router.get('/gregorian-to-jalali', (req, res) => {
  const { date } = req.query; // e.g. "2024-12-07"
  if (!date) return res.status(400).json({ success: false, error: 'تاریخ ارسال نشده' });
  try {
    res.json({ success: true, jalali: gregorianToJalaliDisplay(date) });
  } catch (e) {
    res.status(400).json({ success: false, error: 'فرمت تاریخ نامعتبر است' });
  }
});

const jalaali = require('jalaali-js');

// Public: get real Jalali calendar for a given Jalali year/month
// Used by booking.html to render an accurate Persian calendar grid
router.get('/jalali-calendar', (req, res) => {
  let { jy, jm } = req.query;
  const today = new Date();
  const todayJ = require('../utils/jalali').gregorianToJalali(today);
  jy = jy ? parseInt(jy) : todayJ.jy;
  jm = jm ? parseInt(jm) : todayJ.jm;

  const daysInMonth = jalaali.jalaaliMonthLength(jy, jm);
  // Day of week for the 1st of this Jalali month (0=Sat...6=Fri to match Persian week)
  const firstGreg = jalaali.toGregorian(jy, jm, 1);
  const firstDate = new Date(firstGreg.gy, firstGreg.gm - 1, firstGreg.gd);
  const jsDay = firstDate.getDay(); // 0=Sun
  const startDayOfWeek = (jsDay + 1) % 7; // convert to Sat=0

  const monthNames = require('../utils/jalali').PERSIAN_MONTHS;

  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const greg = jalaali.toGregorian(jy, jm, d);
    const isoDate = `${greg.gy}-${String(greg.gm).padStart(2,'0')}-${String(greg.gd).padStart(2,'0')}`;
    const isPast = new Date(isoDate) < new Date(today.toISOString().split('T')[0]);
    const isToday = isoDate === today.toISOString().split('T')[0];
    days.push({ day: d, isoDate, isPast, isToday });
  }

  res.json({
    success: true,
    data: {
      jy, jm, monthName: monthNames[jm - 1],
      daysInMonth, startDayOfWeek, days,
      prev: jm === 1 ? { jy: jy - 1, jm: 12 } : { jy, jm: jm - 1 },
      next: jm === 12 ? { jy: jy + 1, jm: 1 } : { jy, jm: jm + 1 },
    }
  });
});

// Get all settings
router.get('/', authAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM settings').all();
  const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json({ success: true, data: settings });
});

// Update settings
router.patch('/', authAdmin, (req, res) => {
  const update = db.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime("now")) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at');
  const updateAll = db.transaction((entries) => {
    entries.forEach(([k, v]) => update.run(k, String(v)));
  });
  updateAll(Object.entries(req.body));
  res.json({ success: true });
});

// Public: get shop info
router.get('/public', (req, res) => {
  const keys = ['shop_name', 'shop_phone', 'shop_address', 'shop_open', 'shop_close'];
  const rows = db.prepare(`SELECT key, value FROM settings WHERE key IN (${keys.map(() => '?').join(',')})`).all(...keys);
  const info = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json({ success: true, data: info });
});

module.exports = router;
