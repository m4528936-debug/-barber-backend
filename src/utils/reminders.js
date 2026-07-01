// src/utils/reminders.js
const db = require('./db');
const sms = require('./sms');
const { v4: uuid } = require('uuid');

/**
 * هر چند دقیقه یکبار چک می‌کنه ببینه نوبتی هست که ۲ ساعت دیگه شروع می‌شه
 * و هنوز یادآوریش ارسال نشده — اگه بود، SMS + اعلان داخل اپ می‌فرسته.
 */
async function checkAndSendReminders() {
  try {
    const remindHoursBefore = parseInt(
      db.prepare("SELECT value FROM settings WHERE key = 'reminder_hours_before'").get()?.value || '2'
    );

    const smsEnabled = db.prepare("SELECT value FROM settings WHERE key = 'sms_reminder'").get()?.value === '1';
    if (!smsEnabled) return;

    // appointments starting within the reminder window, not yet reminded, not cancelled/done
    const upcoming = db.prepare(`
      SELECT a.*, c.phone, c.name as customer_name, w.name as worker_name
      FROM appointments a
      JOIN customers c ON c.id = a.customer_id
      JOIN workers w ON w.id = a.worker_id
      WHERE a.reminder_sent = 0
        AND a.status IN ('pending', 'confirmed')
        AND datetime(a.date || ' ' || a.start_time) BETWEEN datetime('now') AND datetime('now', '+' || ? || ' hours')
    `).all(remindHoursBefore);

    for (const appt of upcoming) {
      const message = `یادآوری نوبت General Barber Shop\n${appt.worker_name} - ساعت ${appt.start_time}\nمنتظرتیم!`;
      await sms.sendReminder(appt.phone, message);

      db.prepare('UPDATE appointments SET reminder_sent = 1 WHERE id = ?').run(appt.id);
      db.prepare('INSERT INTO notifications (id, customer_id, type, title, body) VALUES (?,?,?,?,?)')
        .run(uuid(), appt.customer_id, 'reminder', '🔔 یادآوری نوبت',
          `نوبت تو ساعت ${appt.start_time} با ${appt.worker_name} نزدیکه!`);
    }

    if (upcoming.length) console.log(`🔔 ${upcoming.length} یادآوری نوبت ارسال شد`);
  } catch (e) {
    console.error('❌ خطا در ارسال یادآوری‌ها:', e.message);
  }
}

/** هر ۵ دقیقه یکبار اجرا می‌شه */
function startReminderScheduler() {
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('reminder_hours_before', '2')").run();
  checkAndSendReminders(); // run once on boot
  setInterval(checkAndSendReminders, 5 * 60 * 1000);
  console.log('⏰ سیستم یادآوری خودکار فعال شد (هر ۵ دقیقه چک می‌کنه)');
}

module.exports = { startReminderScheduler, checkAndSendReminders };
