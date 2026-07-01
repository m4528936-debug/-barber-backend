// src/utils/initDb.js
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './data/barber.db';
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);

// ── WAL mode for performance ──
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── SCHEMA ──
db.exec(`

-- ━━━━━━━━━━━━━━━━━━━━━━
-- WORKERS (کارمندان)
-- ━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS workers (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name        TEXT NOT NULL,
  phone       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,
  bio         TEXT,
  avatar      TEXT,
  specialties TEXT DEFAULT '[]',       -- JSON array
  is_active   INTEGER DEFAULT 1,
  rating      REAL DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  total_services INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━
-- WORKER SCHEDULES (ساعت کاری)
-- ━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS worker_schedules (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  worker_id   TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL,  -- 0=شنبه ... 6=جمعه
  start_time  TEXT NOT NULL,     -- HH:MM
  end_time    TEXT NOT NULL,
  is_off      INTEGER DEFAULT 0,
  break_start TEXT,
  break_end   TEXT,
  buffer_mins INTEGER DEFAULT 5,
  UNIQUE(worker_id, day_of_week)
);

-- ━━━━━━━━━━━━━━━━━━━━━━
-- WORKER LEAVES (مرخصی)
-- ━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS worker_leaves (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  worker_id   TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  from_date   TEXT NOT NULL,
  to_date     TEXT NOT NULL,
  type        TEXT DEFAULT 'vacation',  -- vacation | sick | personal
  reason      TEXT,
  status      TEXT DEFAULT 'pending',   -- pending | approved | rejected
  approved_by TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━
-- SERVICES (سرویس‌ها)
-- ━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS services (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name         TEXT NOT NULL,
  category     TEXT NOT NULL,  -- cutting | beard | color | perm | skin | package
  description  TEXT,
  image        TEXT,
  base_price   INTEGER NOT NULL,  -- تومان
  duration_min INTEGER NOT NULL,
  is_active    INTEGER DEFAULT 1,
  is_popular   INTEGER DEFAULT 0,
  sort_order   INTEGER DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━
-- SERVICE × WORKER (قیمت هر کارمند)
-- ━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS worker_services (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  worker_id  TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  price      INTEGER,        -- اگر null باشه از base_price استفاده می‌شه
  is_active  INTEGER DEFAULT 1,
  UNIQUE(worker_id, service_id)
);

-- ━━━━━━━━━━━━━━━━━━━━━━
-- CUSTOMERS (مشتریان)
-- ━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS customers (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name         TEXT,
  phone        TEXT UNIQUE NOT NULL,
  avatar       TEXT,
  birth_date   TEXT,
  tier         TEXT DEFAULT 'bronze',   -- bronze | silver | gold
  points       INTEGER DEFAULT 0,
  wallet       INTEGER DEFAULT 0,       -- تومان
  referral_code TEXT UNIQUE,
  referred_by  TEXT REFERENCES customers(id),
  is_blacklisted INTEGER DEFAULT 0,
  cancel_count  INTEGER DEFAULT 0,
  total_spent  INTEGER DEFAULT 0,
  total_visits INTEGER DEFAULT 0,
  last_visit   TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━
-- OTP (احراز هویت)
-- ━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS otps (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  phone      TEXT NOT NULL,
  code       TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used       INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━
-- APPOINTMENTS (نوبت‌ها)
-- ━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS appointments (
  id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  customer_id    TEXT NOT NULL REFERENCES customers(id),
  worker_id      TEXT NOT NULL REFERENCES workers(id),
  date           TEXT NOT NULL,           -- YYYY-MM-DD
  start_time     TEXT NOT NULL,           -- HH:MM
  end_time       TEXT NOT NULL,
  status         TEXT DEFAULT 'pending',  -- pending | confirmed | done | cancelled | no_show
  services       TEXT NOT NULL,           -- JSON array of service IDs
  total_price    INTEGER NOT NULL,
  discount       INTEGER DEFAULT 0,
  final_price    INTEGER NOT NULL,
  payment_method TEXT DEFAULT 'online',   -- online | wallet | combined | cash
  payment_status TEXT DEFAULT 'pending',  -- pending | paid | refunded
  payment_ref    TEXT,
  points_used    INTEGER DEFAULT 0,
  points_earned  INTEGER DEFAULT 0,
  coupon_code    TEXT,
  cancel_reason  TEXT,
  cancel_fee     INTEGER DEFAULT 0,
  hair_style     TEXT,                    -- مدل موی انتخابی
  reminder_sent  INTEGER DEFAULT 0,
  created_at     TEXT DEFAULT (datetime('now')),
  updated_at     TEXT DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━
-- WAITING LIST (لیست انتظار)
-- ━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS waiting_list (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  worker_id   TEXT REFERENCES workers(id),
  date        TEXT NOT NULL,
  service_ids TEXT NOT NULL,
  status      TEXT DEFAULT 'waiting',  -- waiting | notified | booked | expired
  notified_at TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━
-- REVIEWS (نظرات)
-- ━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS reviews (
  id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  appointment_id TEXT NOT NULL REFERENCES appointments(id),
  customer_id    TEXT NOT NULL REFERENCES customers(id),
  worker_id      TEXT NOT NULL REFERENCES workers(id),
  rating         INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment        TEXT,
  image          TEXT,
  status         TEXT DEFAULT 'pending',  -- pending | approved | rejected
  created_at     TEXT DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━
-- COUPONS (کدهای تخفیف)
-- ━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS coupons (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  code         TEXT UNIQUE NOT NULL,
  type         TEXT NOT NULL,      -- percent | fixed
  value        INTEGER NOT NULL,   -- % or تومان
  min_price    INTEGER DEFAULT 0,
  max_uses     INTEGER,
  used_count   INTEGER DEFAULT 0,
  expires_at   TEXT,
  is_active    INTEGER DEFAULT 1,
  for_customer TEXT REFERENCES customers(id),  -- اگر null = همه
  created_at   TEXT DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━
-- POINTS TRANSACTIONS (تراکنش امتیاز)
-- ━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS points_transactions (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  amount      INTEGER NOT NULL,    -- مثبت = کسب، منفی = مصرف
  type        TEXT NOT NULL,       -- earn | spend | bonus | referral | admin
  description TEXT,
  ref_id      TEXT,                -- appointment_id or other
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━
-- WALLET TRANSACTIONS (تراکنش کیف پول)
-- ━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  amount      INTEGER NOT NULL,
  type        TEXT NOT NULL,       -- charge | spend | refund | gift
  description TEXT,
  ref_id      TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━
-- NOTIFICATIONS (اعلان‌ها)
-- ━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  customer_id TEXT REFERENCES customers(id),  -- null = همه
  type        TEXT NOT NULL,   -- appt | cancel | points | promo | reminder | system | wallet
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  data        TEXT DEFAULT '{}',   -- JSON
  is_read     INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━
-- GALLERY (گالری)
-- ━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS gallery (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  image        TEXT NOT NULL,
  caption      TEXT,
  uploaded_by  TEXT NOT NULL,   -- admin | customer_id
  customer_id  TEXT REFERENCES customers(id),
  worker_id    TEXT REFERENCES workers(id),
  service_id   TEXT REFERENCES services(id),
  is_approved  INTEGER DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━
-- CAMPAIGNS (کمپین‌ها)
-- ━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS campaigns (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  target      TEXT DEFAULT 'all',   -- all | bronze | silver | gold | inactive
  channel     TEXT DEFAULT 'sms',   -- sms | whatsapp | push | all
  status      TEXT DEFAULT 'draft', -- draft | sent | scheduled
  sent_count  INTEGER DEFAULT 0,
  scheduled_at TEXT,
  sent_at     TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━
-- SURVEYS (فرم‌های سفارشی نظرسنجی)
-- ━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS surveys (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  title       TEXT NOT NULL,
  description TEXT,
  questions   TEXT NOT NULL,   -- JSON array: [{id,type,label,options}]
  is_active   INTEGER DEFAULT 1,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  survey_id   TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id),
  answers     TEXT NOT NULL,   -- JSON: {questionId: answer}
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━
-- SETTINGS (تنظیمات)
-- ━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━
-- INDEXES
-- ━━━━━━━━━━━━━━━━━━━━━━
CREATE INDEX IF NOT EXISTS idx_appointments_date     ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_appointments_worker   ON appointments(worker_id);
CREATE INDEX IF NOT EXISTS idx_appointments_customer ON appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status   ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_customers_phone       ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_notifications_customer ON notifications(customer_id);
CREATE INDEX IF NOT EXISTS idx_points_customer       ON points_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_wallet_customer       ON wallet_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_worker        ON reviews(worker_id);
CREATE INDEX IF NOT EXISTS idx_otps_phone           ON otps(phone);
CREATE INDEX IF NOT EXISTS idx_survey_responses      ON survey_responses(survey_id);
`);

// Default settings
const defaultSettings = [
  ['shop_name', 'General Barber Shop'],
  ['shop_phone', ''],
  ['shop_address', 'کرج'],
  ['shop_open', '09:00'],
  ['shop_close', '22:00'],
  ['booking_days_ahead', '7'],
  ['cancel_hours_free', '4'],
  ['cancel_fee_percent', '30'],
  ['buffer_minutes', '5'],
  ['sms_reminder', '1'],
  ['whatsapp_reminder', '1'],
  ['points_per_service', '100'],
  ['points_to_toman', '100'],  // 100 امتیاز = 10,000 تومان
  ['bronze_min', '0'],
  ['silver_min', '1000'],
  ['gold_min', '2000'],
  ['referral_reward_giver', '200'],
  ['referral_reward_receiver', '100'],
];

const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
defaultSettings.forEach(([k, v]) => insertSetting.run(k, v));

console.log('✅ Database initialized successfully!');
console.log(`📁 Location: ${path.resolve(DB_PATH)}`);

module.exports = db;
