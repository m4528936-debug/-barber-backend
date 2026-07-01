// src/routes/appointments.js
const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../utils/db');
const { authCustomer, authWorker, authAdmin } = require('../middleware/auth');

// ── GET AVAILABLE SLOTS ──
router.get('/slots', (req, res) => {
  const { worker_id, date, service_ids } = req.query;
  if (!worker_id || !date) return res.status(400).json({ success: false, error: 'اطلاعات ناقص' });

  const worker = db.prepare('SELECT * FROM workers WHERE id = ? AND is_active = 1').get(worker_id);
  if (!worker) return res.status(404).json({ success: false, error: 'کارمند یافت نشد' });

  // Get day of week (0=Sat ... 6=Fri in Persian calendar)
  const d = new Date(date);
  const jsDay = d.getDay(); // 0=Sun
  const persianDay = (jsDay + 1) % 7; // convert to Sat=0

  const schedule = db.prepare(
    'SELECT * FROM worker_schedules WHERE worker_id = ? AND day_of_week = ?'
  ).get(worker_id, persianDay);

  if (!schedule || schedule.is_off)
    return res.json({ success: true, slots: [], message: 'این روز تعطیل است' });

  // Check leaves
  const leave = db.prepare(
    'SELECT * FROM worker_leaves WHERE worker_id = ? AND status = "approved" AND from_date <= ? AND to_date >= ?'
  ).get(worker_id, date, date);
  if (leave) return res.json({ success: true, slots: [], message: 'کارمند مرخصی است' });

  // Calculate total service duration
  let totalDuration = 30;
  if (service_ids) {
    const ids = service_ids.split(',');
    const services = db.prepare(
      `SELECT SUM(duration_min) as total FROM services WHERE id IN (${ids.map(() => '?').join(',')})`
    ).get(...ids);
    if (services?.total) totalDuration = services.total;
  }

  // Get existing appointments for this day
  const existing = db.prepare(
    'SELECT start_time, end_time FROM appointments WHERE worker_id = ? AND date = ? AND status NOT IN ("cancelled")'
  ).all(worker_id, date);

  const buffer = schedule.buffer_mins || 5;
  const slots = generateSlots(
    schedule.start_time, schedule.end_time,
    totalDuration, buffer,
    schedule.break_start, schedule.break_end,
    existing, date
  );

  res.json({ success: true, slots, date, worker_id });
});

function generateSlots(start, end, duration, buffer, breakStart, breakEnd, existing, date) {
  const slots = [];
  const now = new Date();
  let current = timeToMins(start);
  const endMins = timeToMins(end);

  while (current + duration <= endMins) {
    const slotStart = minsToTime(current);
    const slotEnd = minsToTime(current + duration);

    // Check if in break
    let inBreak = false;
    if (breakStart && breakEnd) {
      const bs = timeToMins(breakStart), be = timeToMins(breakEnd);
      if (current < be && current + duration > bs) inBreak = true;
    }

    // Check if in the past
    const slotDateTime = new Date(`${date}T${slotStart}`);
    const isPast = slotDateTime <= now;

    // Check if overlaps with existing
    const isBooked = existing.some(e => {
      const es = timeToMins(e.start_time), ee = timeToMins(e.end_time);
      return current < ee && current + duration > es;
    });

    if (!inBreak && !isPast && !isBooked) {
      slots.push({ time: slotStart, end_time: slotEnd, available: true });
    }

    current += duration + buffer;
  }

  return slots;
}

function timeToMins(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
function minsToTime(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ── CREATE APPOINTMENT ──
router.post('/', authCustomer, (req, res) => {
  const { worker_id, date, start_time, service_ids, coupon_code, points_used, payment_method, hair_style } = req.body;
  const customer = req.customer;

  if (!worker_id || !date || !start_time || !service_ids?.length)
    return res.status(400).json({ success: false, error: 'اطلاعات ناقص' });

  // Validate services
  const services = db.prepare(
    `SELECT * FROM services WHERE id IN (${service_ids.map(() => '?').join(',')}) AND is_active = 1`
  ).all(...service_ids);
  if (services.length !== service_ids.length)
    return res.status(400).json({ success: false, error: 'سرویس نامعتبر' });

  // Calculate prices
  const workerServices = db.prepare(
    `SELECT ws.service_id, COALESCE(ws.price, s.base_price) as price
     FROM services s LEFT JOIN worker_services ws ON ws.service_id = s.id AND ws.worker_id = ?
     WHERE s.id IN (${service_ids.map(() => '?').join(',')})`
  ).all(worker_id, ...service_ids);

  const totalPrice = workerServices.reduce((sum, s) => sum + s.price, 0);
  const totalDuration = services.reduce((sum, s) => sum + s.duration_min, 0);

  // Check slot still available
  const conflict = db.prepare(
    `SELECT id FROM appointments WHERE worker_id = ? AND date = ? AND start_time = ? AND status NOT IN ('cancelled')`
  ).get(worker_id, date, start_time);
  if (conflict) return res.status(409).json({ success: false, error: 'این نوبت دیگر در دسترس نیست' });

  // Apply coupon
  let discount = 0;
  let coupon = null;
  if (coupon_code) {
    coupon = db.prepare(
      'SELECT * FROM coupons WHERE code = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > datetime("now"))'
    ).get(coupon_code);
    if (coupon) {
      if (coupon.max_uses && coupon.used_count >= coupon.max_uses)
        return res.status(400).json({ success: false, error: 'ظرفیت کد تخفیف پر شده' });
      if (totalPrice < coupon.min_price)
        return res.status(400).json({ success: false, error: `حداقل مبلغ: ${coupon.min_price.toLocaleString()} تومان` });
      discount = coupon.type === 'percent'
        ? Math.round(totalPrice * coupon.value / 100)
        : coupon.value;
    }
  }

  // Apply points
  let pointsDiscount = 0;
  if (points_used && points_used > 0) {
    if (points_used > customer.points)
      return res.status(400).json({ success: false, error: 'امتیاز کافی ندارید' });
    const settings = db.prepare('SELECT value FROM settings WHERE key = "points_to_toman"').get();
    const rate = parseInt(settings?.value || '100');
    pointsDiscount = Math.round(points_used / rate) * 1000;
  }

  const totalDiscount = discount + pointsDiscount;
  const finalPrice = Math.max(0, totalPrice - totalDiscount);

  // End time
  const [h, m] = start_time.split(':').map(Number);
  const endMins = h * 60 + m + totalDuration;
  const end_time = minsToTime(endMins);

  // Validate payment method
  if (payment_method === 'wallet' && customer.wallet < finalPrice)
    return res.status(400).json({ success: false, error: 'موجودی کیف پول کافی نیست' });

  const id = uuid();
  const pointsEarned = 100; // per appointment

  // ── TRANSACTION ──
  const createAppointment = db.transaction(() => {
    db.prepare(`
      INSERT INTO appointments (id, customer_id, worker_id, date, start_time, end_time,
        services, total_price, discount, final_price, payment_method, payment_status,
        points_used, points_earned, coupon_code, hair_style)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, customer.id, worker_id, date, start_time, end_time,
      JSON.stringify(service_ids), totalPrice, totalDiscount, finalPrice,
      payment_method, payment_method === 'wallet' ? 'paid' : 'pending',
      points_used || 0, pointsEarned, coupon_code || null, hair_style || null);

    // Deduct wallet if needed
    if (payment_method === 'wallet') {
      db.prepare('UPDATE customers SET wallet = wallet - ? WHERE id = ?').run(finalPrice, customer.id);
      db.prepare('INSERT INTO wallet_transactions (id, customer_id, amount, type, description, ref_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(uuid(), customer.id, -finalPrice, 'spend', `پرداخت نوبت ${date}`, id);
    }

    // Deduct points
    if (points_used > 0) {
      db.prepare('UPDATE customers SET points = points - ? WHERE id = ?').run(points_used, customer.id);
      db.prepare('INSERT INTO points_transactions (id, customer_id, amount, type, description, ref_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(uuid(), customer.id, -points_used, 'spend', 'استفاده از امتیاز در نوبت', id);
    }

    // Update coupon usage
    if (coupon) db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?').run(coupon.id);

    // Notification
    db.prepare('INSERT INTO notifications (id, customer_id, type, title, body, data) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuid(), customer.id, 'appt', '✅ نوبت تأیید شد',
        `نوبت شما برای ${date} ساعت ${start_time} ثبت شد.`,
        JSON.stringify({ appointment_id: id }));
  });

  createAppointment();

  const appointment = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
  res.status(201).json({ success: true, data: appointment });
});

// ── GET MY APPOINTMENTS (customer) ──
router.get('/my', authCustomer, (req, res) => {
  const { status, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  let query = `
    SELECT a.*, w.name as worker_name, w.avatar as worker_avatar
    FROM appointments a
    JOIN workers w ON w.id = a.worker_id
    WHERE a.customer_id = ?
  `;
  const params = [req.customer.id];
  if (status) { query += ' AND a.status = ?'; params.push(status); }
  query += ` ORDER BY a.date DESC, a.start_time DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), offset);

  const appointments = db.prepare(query).all(...params);
  const total = db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE customer_id = ?${status ? ' AND status = ?' : ''}`).get(req.customer.id, ...(status ? [status] : [])).c;

  res.json({ success: true, data: appointments, total, page: parseInt(page), pages: Math.ceil(total / limit) });
});

// ── GET WORKER APPOINTMENTS ──
router.get('/worker', authWorker, (req, res) => {
  const { date } = req.query;
  const workerId = req.worker.id;

  const query = date
    ? 'SELECT a.*, c.name as customer_name, c.phone as customer_phone FROM appointments a JOIN customers c ON c.id = a.customer_id WHERE a.worker_id = ? AND a.date = ? ORDER BY a.start_time'
    : 'SELECT a.*, c.name as customer_name, c.phone as customer_phone FROM appointments a JOIN customers c ON c.id = a.customer_id WHERE a.worker_id = ? AND a.date >= date("now") ORDER BY a.date, a.start_time LIMIT 50';

  const params = date ? [workerId, date] : [workerId];
  const appointments = db.prepare(query).all(...params);
  res.json({ success: true, data: appointments });
});

// ── GET ALL APPOINTMENTS (admin) ──
router.get('/', authAdmin, (req, res) => {
  const { date, worker_id, status, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  let where = 'WHERE 1=1';
  const params = [];
  if (date) { where += ' AND a.date = ?'; params.push(date); }
  if (worker_id) { where += ' AND a.worker_id = ?'; params.push(worker_id); }
  if (status) { where += ' AND a.status = ?'; params.push(status); }

  const appointments = db.prepare(`
    SELECT a.*, c.name as customer_name, c.phone as customer_phone,
           w.name as worker_name
    FROM appointments a
    JOIN customers c ON c.id = a.customer_id
    JOIN workers w ON w.id = a.worker_id
    ${where}
    ORDER BY a.date DESC, a.start_time DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  const total = db.prepare(`SELECT COUNT(*) as c FROM appointments a ${where}`).get(...params).c;
  res.json({ success: true, data: appointments, total, page: parseInt(page) });
});

// ── CANCEL APPOINTMENT ──
router.patch('/:id/cancel', authCustomer, (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const customer = req.customer;

  const appt = db.prepare('SELECT * FROM appointments WHERE id = ? AND customer_id = ?').get(id, customer.id);
  if (!appt) return res.status(404).json({ success: false, error: 'نوبت یافت نشد' });
  if (['cancelled', 'done'].includes(appt.status))
    return res.status(400).json({ success: false, error: 'این نوبت قابل لغو نیست' });

  // Check cancellation window
  const apptTime = new Date(`${appt.date}T${appt.start_time}`);
  const hoursLeft = (apptTime - new Date()) / (1000 * 60 * 60);
  const freeHours = parseInt(db.prepare('SELECT value FROM settings WHERE key = "cancel_hours_free"').get()?.value || '4');
  const feePercent = parseInt(db.prepare('SELECT value FROM settings WHERE key = "cancel_fee_percent"').get()?.value || '30');

  let cancelFee = 0;
  if (hoursLeft < freeHours && hoursLeft > 0) {
    cancelFee = Math.round(appt.final_price * feePercent / 100);
  }

  const cancelAction = db.transaction(() => {
    db.prepare('UPDATE appointments SET status = "cancelled", cancel_reason = ?, cancel_fee = ?, updated_at = datetime("now") WHERE id = ?')
      .run(reason || null, cancelFee, id);
    db.prepare('UPDATE customers SET cancel_count = cancel_count + 1 WHERE id = ?').run(customer.id);

    // Refund minus fee
    const refund = appt.final_price - cancelFee;
    if (appt.payment_status === 'paid' && refund > 0) {
      db.prepare('UPDATE customers SET wallet = wallet + ? WHERE id = ?').run(refund, customer.id);
      db.prepare('INSERT INTO wallet_transactions (id, customer_id, amount, type, description, ref_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(uuid(), customer.id, refund, 'refund', `برگشت وجه لغو نوبت${cancelFee ? ` (جریمه: ${cancelFee.toLocaleString()})` : ''}`, id);
    }

    // Refund points
    if (appt.points_used > 0) {
      db.prepare('UPDATE customers SET points = points + ? WHERE id = ?').run(appt.points_used, customer.id);
    }

    db.prepare('INSERT INTO notifications (id, customer_id, type, title, body) VALUES (?, ?, ?, ?, ?)')
      .run(uuid(), customer.id, 'cancel', '❌ نوبت لغو شد',
        cancelFee ? `نوبت لغو شد. جریمه ${cancelFee.toLocaleString()} تومان کسر شد.` : 'نوبت لغو شد. مبلغ به کیف پول برگشت.');

    // Notify waiting list
    const waiting = db.prepare('SELECT * FROM waiting_list WHERE worker_id = ? AND date = ? AND status = "waiting" LIMIT 3').all(appt.worker_id, appt.date);
    waiting.forEach(w => {
      db.prepare('UPDATE waiting_list SET status = "notified", notified_at = datetime("now") WHERE id = ?').run(w.id);
      db.prepare('INSERT INTO notifications (id, customer_id, type, title, body) VALUES (?, ?, ?, ?, ?)')
        .run(uuid(), w.customer_id, 'appt', '🔔 وقت خالی شد!', `نوبت ${appt.date} ساعت ${appt.start_time} خالی شد. سریع رزرو کن!`);
    });
  });

  cancelAction();
  res.json({ success: true, cancelFee, message: cancelFee ? `جریمه ${cancelFee.toLocaleString()} تومان` : 'لغو شد' });
});

// ── MARK DONE (worker/admin) ──
router.patch('/:id/done', authWorker, (req, res) => {
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
  if (!appt) return res.status(404).json({ success: false, error: 'نوبت یافت نشد' });

  const markDone = db.transaction(() => {
    db.prepare('UPDATE appointments SET status = "done", payment_status = "paid", updated_at = datetime("now") WHERE id = ?').run(appt.id);

    // Award points
    db.prepare('UPDATE customers SET points = points + ?, total_visits = total_visits + 1, total_spent = total_spent + ?, last_visit = date("now"), updated_at = datetime("now") WHERE id = ?')
      .run(appt.points_earned, appt.final_price, appt.customer_id);
    db.prepare('INSERT INTO points_transactions (id, customer_id, amount, type, description, ref_id) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuid(), appt.customer_id, appt.points_earned, 'earn', 'امتیاز دریافتی از سرویس', appt.id);

    // Update tier
    const customer = db.prepare('SELECT points, total_visits FROM customers WHERE id = ?').get(appt.customer_id);
    const totalPoints = customer.points;
    const settings = db.prepare('SELECT key, value FROM settings WHERE key IN ("silver_min","gold_min")').all();
    const s = Object.fromEntries(settings.map(r => [r.key, parseInt(r.value)]));
    const tier = totalPoints >= s.gold_min ? 'gold' : totalPoints >= s.silver_min ? 'silver' : 'bronze';
    db.prepare('UPDATE customers SET tier = ? WHERE id = ?').run(tier, appt.customer_id);

    // Update worker stats
    db.prepare('UPDATE workers SET total_services = total_services + 1 WHERE id = ?').run(appt.worker_id);

    // Notification to customer
    db.prepare('INSERT INTO notifications (id, customer_id, type, title, body, data) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuid(), appt.customer_id, 'points', '⭐ امتیاز دریافت کردی!',
        `از سرویس امروز ${appt.points_earned} امتیاز به حسابت اضافه شد.`,
        JSON.stringify({ appointment_id: appt.id }));
  });

  markDone();
  res.json({ success: true, message: 'نوبت تکمیل شد' });
});

// ── TRANSFER APPOINTMENT (admin) ──
router.patch('/:id/transfer', authAdmin, (req, res) => {
  const { new_worker_id } = req.body;
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
  if (!appt) return res.status(404).json({ success: false, error: 'نوبت یافت نشد' });
  const worker = db.prepare('SELECT * FROM workers WHERE id = ? AND is_active = 1').get(new_worker_id);
  if (!worker) return res.status(404).json({ success: false, error: 'کارمند یافت نشد' });

  db.prepare('UPDATE appointments SET worker_id = ?, updated_at = datetime("now") WHERE id = ?').run(new_worker_id, appt.id);
  db.prepare('INSERT INTO notifications (id, customer_id, type, title, body) VALUES (?, ?, ?, ?, ?)')
    .run(uuid(), appt.customer_id, 'appt', 'تغییر کارمند نوبت', `کارمند نوبت ${appt.date} تغییر کرد.`);

  res.json({ success: true, message: 'نوبت منتقل شد' });
});

module.exports = router;
