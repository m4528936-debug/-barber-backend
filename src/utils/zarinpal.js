// src/utils/zarinpal.js
const axios = require('axios');

/**
 * اتصال واقعی به درگاه زرین‌پال
 * مستندات: https://docs.zarinpal.com/paymentGateway/
 *
 * اگه ZARINPAL_MERCHANT در .env خالی باشه، حالت sandbox/mock فعال می‌شه
 * تا توسعه و تست بدون مرچنت واقعی هم خراب نشه.
 */

const MERCHANT_ID = process.env.ZARINPAL_MERCHANT;
const CALLBACK_URL = process.env.ZARINPAL_CALLBACK_URL || 'http://localhost:3000/api/payments/verify';
const SANDBOX = !MERCHANT_ID || process.env.ZARINPAL_SANDBOX === '1';

const BASE_URL = SANDBOX
  ? 'https://sandbox.zarinpal.com/pg/v4/payment'
  : 'https://api.zarinpal.com/pg/v4/payment';

const STARTPAY_URL = SANDBOX
  ? 'https://sandbox.zarinpal.com/pg/StartPay/'
  : 'https://www.zarinpal.com/pg/StartPay/';

/**
 * شروع تراکنش — مبلغ به تومان می‌گیره، به ریال تبدیل می‌کنه (زرین‌پال ریالی کار می‌کنه)
 */
async function requestPayment({ amount, description, mobile, email, callbackParams = {} }) {
  // Mock mode: no real merchant configured
  if (!MERCHANT_ID) {
    const fakeAuthority = 'MOCK' + Date.now();
    console.log(`💳 [ZarinPal - MOCK MODE] پرداخت ${amount.toLocaleString()} تومان شبیه‌سازی شد. Authority: ${fakeAuthority}`);
    const qs = new URLSearchParams(callbackParams).toString();
    return {
      success: true,
      mock: true,
      authority: fakeAuthority,
      payment_url: `${CALLBACK_URL}?Authority=${fakeAuthority}&Status=OK&${qs}`,
    };
  }

  try {
    const callbackQs = new URLSearchParams(callbackParams).toString();
    const res = await axios.post(`${BASE_URL}/request.json`, {
      merchant_id: MERCHANT_ID,
      amount: amount * 10, // تومان → ریال
      description: description || 'پرداخت General Barber Shop',
      callback_url: `${CALLBACK_URL}?${callbackQs}`,
      metadata: { mobile, email },
    }, { timeout: 10000 });

    const data = res.data?.data;
    if (!data || data.code !== 100) {
      throw new Error(res.data?.errors?.message || 'خطا در اتصال به درگاه پرداخت');
    }

    return {
      success: true,
      mock: false,
      authority: data.authority,
      payment_url: `${STARTPAY_URL}${data.authority}`,
    };
  } catch (err) {
    console.error('❌ خطای زرین‌پال:', err.response?.data || err.message);
    throw new Error('اتصال به درگاه پرداخت برقرار نشد');
  }
}

/**
 * تأیید تراکنش بعد از بازگشت کاربر از درگاه
 */
async function verifyPayment({ authority, amount }) {
  // Mock mode
  if (!MERCHANT_ID || authority.startsWith('MOCK')) {
    console.log(`💳 [ZarinPal - MOCK MODE] پرداخت تأیید شد. Authority: ${authority}`);
    return { success: true, mock: true, ref_id: 'MOCKREF' + Date.now() };
  }

  try {
    const res = await axios.post(`${BASE_URL}/verify.json`, {
      merchant_id: MERCHANT_ID,
      amount: amount * 10, // تومان → ریال
      authority,
    }, { timeout: 10000 });

    const data = res.data?.data;
    if (!data || ![100, 101].includes(data.code)) {
      throw new Error(res.data?.errors?.message || 'پرداخت تأیید نشد');
    }

    return { success: true, mock: false, ref_id: data.ref_id, card_pan: data.card_pan };
  } catch (err) {
    console.error('❌ خطای تأیید زرین‌پال:', err.response?.data || err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { requestPayment, verifyPayment, SANDBOX };
