// src/utils/sms.js
const axios = require('axios');

/**
 * سرویس پیامک — اگه SMS_API_KEY در .env تنظیم نشده باشه،
 * به‌جای ارسال واقعی، کد رو توی کنسول چاپ می‌کنه (حالت توسعه).
 *
 * در حال حاضر از API کاوه‌نگار پشتیبانی می‌شه. برای سرویس‌های دیگه (ملی‌پیامک، قاصدک)
 * فقط تابع sendViaProvider رو عوض کن.
 */

const PROVIDER = process.env.SMS_PROVIDER || 'kavenegar'; // kavenegar | melipayamak | console
const API_KEY = process.env.SMS_API_KEY;
const SENDER = process.env.SMS_SENDER;

async function sendOtp(phone, code) {
  const message = `کد تأیید General Barber Shop: ${code}\nاین کد تا ۵ دقیقه معتبر است.`;
  return send(phone, message);
}

async function sendReminder(phone, message) {
  return send(phone, message);
}

async function send(phone, message) {
  // No API key configured → dev mode, just log
  if (!API_KEY || PROVIDER === 'console') {
    console.log(`📱 [SMS - DEV MODE] به ${phone}:\n${message}`);
    return { success: true, mode: 'console' };
  }

  try {
    if (PROVIDER === 'kavenegar') {
      return await sendViaKavenegar(phone, message);
    }
    if (PROVIDER === 'melipayamak') {
      return await sendViaMelipayamak(phone, message);
    }
    // Unknown provider → fallback to console
    console.log(`📱 [SMS - UNKNOWN PROVIDER "${PROVIDER}"] به ${phone}:\n${message}`);
    return { success: true, mode: 'console' };
  } catch (err) {
    console.error('❌ خطا در ارسال پیامک:', err.message);
    // Don't crash the request — fallback to console so OTP flow still works
    console.log(`📱 [SMS - FALLBACK after error] به ${phone}:\n${message}`);
    return { success: false, mode: 'fallback', error: err.message };
  }
}

// ── Kavenegar (کاوه‌نگار) ──
async function sendViaKavenegar(phone, message) {
  const url = `https://api.kavenegar.com/v1/${API_KEY}/sms/send.json`;
  const res = await axios.post(url, null, {
    params: { receptor: phone, sender: SENDER, message },
    timeout: 8000,
  });
  if (res.data?.return?.status !== 200) {
    throw new Error(res.data?.return?.message || 'خطای ناشناخته کاوه‌نگار');
  }
  return { success: true, mode: 'kavenegar', data: res.data };
}

// ── ملی‌پیامک (مثال جایگزین) ──
async function sendViaMelipayamak(phone, message) {
  // مستندات: https://www.melipayamak.com/api/
  const url = `https://rest.payamak-panel.com/api/SendSMS/SendSMS`;
  const res = await axios.post(url, {
    username: process.env.SMS_USERNAME,
    password: process.env.SMS_PASSWORD,
    to: phone,
    from: SENDER,
    text: message,
  }, { timeout: 8000 });
  return { success: true, mode: 'melipayamak', data: res.data };
}

module.exports = { sendOtp, sendReminder, send };
