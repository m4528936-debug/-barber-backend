// src/utils/seedDb.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('./db');

async function seed() {
  console.log('🌱 Seeding database...');

  // ── WORKERS ──
  const pass = await bcrypt.hash('123456', 10);

  const w1Id = uuid(), w2Id = uuid();
  db.prepare('INSERT OR IGNORE INTO workers (id, name, phone, password, bio, specialties, is_active) VALUES (?,?,?,?,?,?,1)')
    .run(w1Id, 'کارمند اول', '09120000001', pass, 'متخصص کوتاهی مدرن و رنگ', JSON.stringify(['کوتاهی','رنگ','هایلایت']));
  db.prepare('INSERT OR IGNORE INTO workers (id, name, phone, password, bio, specialties, is_active) VALUES (?,?,?,?,?,?,1)')
    .run(w2Id, 'کارمند دوم', '09120000002', pass, 'متخصص ریش و خدمات پوست', JSON.stringify(['ریش','پوست','فیشیال']));

  // Schedules
  const insertSch = db.prepare('INSERT OR IGNORE INTO worker_schedules (id, worker_id, day_of_week, start_time, end_time, is_off, break_start, break_end) VALUES (?,?,?,?,?,?,?,?)');
  [w1Id, w2Id].forEach(wid => {
    for (let d = 0; d <= 5; d++) {
      insertSch.run(uuid(), wid, d, '09:00', '22:00', 0, '13:00', '14:00');
    }
    insertSch.run(uuid(), wid, 6, '09:00', '14:00', 1, null, null); // جمعه تعطیل
  });

  // ── SERVICES ──
  const services = [
    { name: 'کوتاهی مو', cat: 'cutting', desc: 'کوتاهی حرفه‌ای با تکنیک‌های مدرن', price: 350000, dur: 30, pop: 1 },
    { name: 'اصلاح ریش', cat: 'beard', desc: 'اصلاح با تیغ کلاسیک و حوله داغ', price: 300000, dur: 20, pop: 0 },
    { name: 'رنگ مو', cat: 'color', desc: 'رنگ با برندهای اروپایی', price: 550000, dur: 90, pop: 0 },
    { name: 'فر مو', cat: 'perm', desc: 'انواع فر و کراتینه', price: 800000, dur: 120, pop: 0 },
    { name: 'خدمات پوست', cat: 'skin', desc: 'فیشیال و پاکسازی عمیق', price: 450000, dur: 45, pop: 0 },
    { name: 'پکیج VIP کامل', cat: 'package', desc: 'کوتاهی + ریش + پوست + ماساژ', price: 1200000, dur: 120, pop: 1 },
  ];

  const svcIds = {};
  services.forEach(s => {
    const id = uuid();
    db.prepare('INSERT OR IGNORE INTO services (id, name, category, description, base_price, duration_min, is_popular) VALUES (?,?,?,?,?,?,?)')
      .run(id, s.name, s.cat, s.desc, s.price, s.dur, s.pop);
    svcIds[s.name] = id;

    // worker services
    [w1Id, w2Id].forEach(wid => {
      db.prepare('INSERT OR IGNORE INTO worker_services (id, worker_id, service_id) VALUES (?,?,?)').run(uuid(), wid, id);
    });
  });

  // ── COUPONS ──
  db.prepare('INSERT OR IGNORE INTO coupons (id, code, type, value, min_price, max_uses) VALUES (?,?,?,?,?,?)')
    .run(uuid(), 'WELCOME20', 'percent', 20, 300000, 100);
  db.prepare('INSERT OR IGNORE INTO coupons (id, code, type, value, min_price) VALUES (?,?,?,?,?)')
    .run(uuid(), 'VIP50', 'fixed', 50000, 500000);
  db.prepare('INSERT OR IGNORE INTO coupons (id, code, type, value) VALUES (?,?,?,?)')
    .run(uuid(), 'GOLD20', 'percent', 20, 0);

  // ── SAMPLE CUSTOMER ──
  const custId = uuid();
  db.prepare('INSERT OR IGNORE INTO customers (id, name, phone, tier, points, wallet, referral_code, total_visits, total_spent) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(custId, 'مشتری نمونه', '09130000001', 'gold', 2400, 120000, 'GEN-M48X', 24, 12000000);

  // ── GALLERY SAMPLES ──
  const galleryItems = [
    { caption: 'کوتاهی فید کلاسیک', wid: w1Id, sid: svcIds['کوتاهی مو'] },
    { caption: 'اصلاح ریش کلاسیک', wid: w2Id, sid: svcIds['اصلاح ریش'] },
    { caption: 'هایلایت طلایی', wid: w1Id, sid: svcIds['رنگ مو'] },
  ];
  galleryItems.forEach(g => {
    db.prepare('INSERT OR IGNORE INTO gallery (id, image, caption, uploaded_by, worker_id, service_id, is_approved) VALUES (?,?,?,?,?,?,1)')
      .run(uuid(), '/uploads/sample.jpg', g.caption, 'admin', g.wid, g.sid);
  });

  // ── SETTINGS ──
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('monthly_target', '80000000')").run();

  console.log('✅ Seed completed!');
  console.log('👤 Worker 1: phone=09120000001, pass=123456');
  console.log('👤 Worker 2: phone=09120000002, pass=123456');
  console.log('🔑 Admin PIN: 1234 (set in .env)');
}

seed().catch(console.error);
