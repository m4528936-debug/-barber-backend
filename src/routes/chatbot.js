// src/routes/chatbot.js
const router = require('express').Router();
const db = require('../utils/db');
const { optionalAuth } = require('../middleware/auth');

/**
 * چت‌بات ساده مبتنی بر قوانین (rule-based) — بدون نیاز به API خارجی هوش مصنوعی.
 * بر اساس کلیدواژه‌های پیام کاربر، جواب مناسب از دیتابیس یا پاسخ‌های ثابت برمی‌گردونه.
 * برای ارتقا به AI واقعی، فقط کافیه تابع getBotReply رو با فراخوانی یک LLM API جایگزین کنی.
 */

const FAQ = [
  { keywords: ['ساعت کار', 'ساعت کاری', 'چند تا چند', 'باز', 'بسته'], reply: null, dynamic: 'hours' },
  { keywords: ['آدرس', 'کجاست', 'کجا هست', 'موقعیت'], reply: null, dynamic: 'address' },
  { keywords: ['قیمت', 'هزینه', 'تعرفه'], reply: 'برای دیدن قیمت دقیق سرویس‌ها، به بخش «سرویس‌ها» توی اپ سر بزن — همه قیمت‌ها اونجا واضح نوشته شده 💈' },
  { keywords: ['رزرو', 'نوبت بگیرم', 'وقت بگیرم'], reply: 'برای رزرو نوبت کافیه از منوی پایین روی دکمه ✂️ «رزرو» بزنی، سرویس و کارمند و زمان رو انتخاب کنی!' },
  { keywords: ['لغو', 'کنسل'], reply: 'می‌تونی از بخش پروفایل > تاریخچه نوبت‌ها، نوبتت رو لغو کنی. توجه کن اگه کمتر از ۴ ساعت به نوبت مونده باشه، جریمه کنسلی شامل می‌شه.' },
  { keywords: ['امتیاز', 'وفاداری', 'پوینت'], reply: 'با هر نوبت ۱۰۰ امتیاز می‌گیری! هر ۱۰۰ امتیاز معادل ۱۰,۰۰۰ تومان تخفیفه. جزئیات کامل توی صفحه «امتیاز» هست.' },
  { keywords: ['معرفی', 'دعوت', 'کد معرفی'], reply: 'کد معرفی اختصاصی خودت رو توی پروفایل پیدا می‌کنی. هر دوستی که باهاش ثبت‌نام کنه، تو ۲۰۰ امتیاز و اون ۱۰۰ امتیاز هدیه می‌گیره 🎁' },
  { keywords: ['کیف پول', 'شارژ'], reply: 'از پروفایل، بخش کیف پول، دکمه «+ شارژ» رو بزن و از طریق درگاه پرداخت شارژ کن.' },
  { keywords: ['تخفیف', 'کد تخفیف', 'کوپن'], reply: 'کدهای تخفیف فعال رو موقع رزرو نوبت می‌تونی وارد کنی. برای کدهای ویژه، منتظر پیامک و اعلان‌های ما باش!' },
  { keywords: ['سلام', 'درود', 'وقت بخیر'], reply: 'سلام! خوش اومدی به General Barber Shop 👋 چطور می‌تونم کمکت کنم؟' },
  { keywords: ['ممنون', 'مرسی', 'تشکر'], reply: 'خواهش می‌کنم! هر سوال دیگه‌ای داشتی در خدمتم 🙏' },
  { keywords: ['کارمند', 'آرایشگر'], reply: 'می‌تونی موقع رزرو، از بین کارمندان ما یکی رو انتخاب کنی. پروفایل هر کدوم شامل امتیاز و تخصصشونه.' },
  { keywords: ['پارکینگ', 'ماشین'], reply: 'اطلاعات پارکینگ رو می‌تونی از بخش تماس با ما یا با تماس تلفنی مستقیم بپرسی.' },
];

const DEFAULT_REPLY = 'متوجه نشدم دقیقاً چی می‌خوای بپرسی 🤔 می‌تونی سوالت رو با کلمات دیگه‌ای بپرسی، یا مستقیم با شماره آرایشگاه تماس بگیری.';

function getDynamicReply(type) {
  const rows = db.prepare(`SELECT key, value FROM settings WHERE key IN ('shop_open','shop_close','shop_address','shop_phone')`).all();
  const s = Object.fromEntries(rows.map(r => [r.key, r.value]));
  if (type === 'hours') return `ساعت کاری ما از ${s.shop_open || '۹:۰۰'} تا ${s.shop_close || '۲۲:۰۰'} هست (به جز جمعه‌ها که زودتر تعطیل می‌کنیم).`;
  if (type === 'address') return `آدرس ما: ${s.shop_address || 'کرج'}${s.shop_phone ? ` — تلفن: ${s.shop_phone}` : ''}`;
  return DEFAULT_REPLY;
}

function getBotReply(message) {
  const msg = message.toLowerCase().trim();
  for (const item of FAQ) {
    if (item.keywords.some(k => msg.includes(k))) {
      return item.dynamic ? getDynamicReply(item.dynamic) : item.reply;
    }
  }
  return DEFAULT_REPLY;
}

// POST /api/chatbot/message
router.post('/message', optionalAuth, (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim())
    return res.status(400).json({ success: false, error: 'پیام خالی است' });

  const reply = getBotReply(message);
  res.json({ success: true, reply, timestamp: new Date().toISOString() });
});

// GET /api/chatbot/suggestions — quick reply chips for the UI
router.get('/suggestions', (req, res) => {
  res.json({
    success: true,
    data: [
      'ساعت کاری‌تون چیه؟',
      'چطور نوبت بگیرم؟',
      'امتیازها چطور کار می‌کنه؟',
      'کد معرفی چیه؟',
      'چطور نوبتم رو لغو کنم؟',
    ]
  });
});

module.exports = router;
