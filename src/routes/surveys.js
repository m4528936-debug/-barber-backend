// src/routes/surveys.js
const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db = require('../utils/db');
const { authCustomer, authAdmin, optionalAuth } = require('../middleware/auth');

// Public: get active survey(s)
router.get('/active', optionalAuth, (req, res) => {
  const surveys = db.prepare('SELECT * FROM surveys WHERE is_active = 1 ORDER BY created_at DESC').all();
  const parsed = surveys.map(s => ({ ...s, questions: JSON.parse(s.questions) }));
  res.json({ success: true, data: parsed });
});

// Customer: submit response
router.post('/:id/respond', authCustomer, (req, res) => {
  const { answers } = req.body;
  const survey = db.prepare('SELECT * FROM surveys WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!survey) return res.status(404).json({ success: false, error: 'فرم یافت نشد' });
  if (!answers) return res.status(400).json({ success: false, error: 'پاسخی ارسال نشده' });

  const id = uuid();
  db.prepare('INSERT INTO survey_responses (id, survey_id, customer_id, answers) VALUES (?,?,?,?)')
    .run(id, survey.id, req.customer.id, JSON.stringify(answers));

  // small thank-you bonus
  db.prepare('UPDATE customers SET points = points + 5 WHERE id = ?').run(req.customer.id);
  db.prepare('INSERT INTO points_transactions (id, customer_id, amount, type, description) VALUES (?,?,?,?,?)')
    .run(uuid(), req.customer.id, 5, 'bonus', 'امتیاز شرکت در نظرسنجی');

  res.status(201).json({ success: true, message: 'پاسخ شما ثبت شد. ممنون! ۵ امتیاز هدیه گرفتی' });
});

// Admin: list all surveys
router.get('/', authAdmin, (req, res) => {
  const surveys = db.prepare('SELECT * FROM surveys ORDER BY created_at DESC').all();
  const withCounts = surveys.map(s => {
    const count = db.prepare('SELECT COUNT(*) as c FROM survey_responses WHERE survey_id = ?').get(s.id).c;
    return { ...s, questions: JSON.parse(s.questions), response_count: count };
  });
  res.json({ success: true, data: withCounts });
});

// Admin: create survey
router.post('/', authAdmin, (req, res) => {
  const { title, description, questions } = req.body;
  if (!title || !questions?.length)
    return res.status(400).json({ success: false, error: 'اطلاعات ناقص' });
  const id = uuid();
  db.prepare('INSERT INTO surveys (id, title, description, questions) VALUES (?,?,?,?)')
    .run(id, title, description || null, JSON.stringify(questions));
  res.status(201).json({ success: true, id });
});

// Admin: toggle active
router.patch('/:id/toggle', authAdmin, (req, res) => {
  const s = db.prepare('SELECT is_active FROM surveys WHERE id = ?').get(req.params.id);
  if (!s) return res.status(404).json({ success: false, error: 'یافت نشد' });
  db.prepare('UPDATE surveys SET is_active = ? WHERE id = ?').run(s.is_active ? 0 : 1, req.params.id);
  res.json({ success: true });
});

// Admin: get results
router.get('/:id/results', authAdmin, (req, res) => {
  const survey = db.prepare('SELECT * FROM surveys WHERE id = ?').get(req.params.id);
  if (!survey) return res.status(404).json({ success: false, error: 'فرم یافت نشد' });
  const responses = db.prepare(`
    SELECT sr.*, c.name as customer_name, c.phone
    FROM survey_responses sr LEFT JOIN customers c ON c.id = sr.customer_id
    WHERE sr.survey_id = ? ORDER BY sr.created_at DESC
  `).all(req.params.id);
  res.json({
    success: true,
    data: {
      survey: { ...survey, questions: JSON.parse(survey.questions) },
      responses: responses.map(r => ({ ...r, answers: JSON.parse(r.answers) }))
    }
  });
});

// Admin: delete survey
router.delete('/:id', authAdmin, (req, res) => {
  db.prepare('DELETE FROM surveys WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
