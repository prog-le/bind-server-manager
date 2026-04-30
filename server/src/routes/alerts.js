const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, queryOne, run } = require('../db');
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const alertManager = require('../services/alerts/alertManager');
const { testEmail } = require('../services/alerts/emailChannel');
const { testWebhook } = require('../services/alerts/webhookChannel');

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('super_admin', 'ops_admin'));

// ===== Alert Rules =====

// GET /api/alerts/rules — list alert rules
router.get('/rules', (req, res) => {
  const rules = query('SELECT * FROM alert_rules ORDER BY id');
  res.json({ rules });
});

// POST /api/alerts/rules — create alert rule
router.post('/rules', [
  body('name').notEmpty(),
  body('condition_type').isIn(Object.values(alertManager.CONDITION_TYPES)),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { name, condition_type, condition_params = {}, channels = [], enabled = true } = req.body;

  const result = run(
    'INSERT INTO alert_rules (name, condition_type, condition_params, channels, enabled) VALUES (?, ?, ?, ?, ?)',
    [name, condition_type, JSON.stringify(condition_params), JSON.stringify(channels), enabled ? 1 : 0]
  );

  res.json({ id: result.lastInsertRowid, message: '告警规则已创建' });
});

// PUT /api/alerts/rules/:id — update alert rule
router.put('/rules/:id', (req, res) => {
  const rule = queryOne('SELECT * FROM alert_rules WHERE id = ?', [req.params.id]);
  if (!rule) return res.status(404).json({ error: '规则不存在' });

  const { name, condition_params, channels, enabled } = req.body;

  run(
    'UPDATE alert_rules SET name = ?, condition_params = ?, channels = ?, enabled = ? WHERE id = ?',
    [
      name ?? rule.name,
      condition_params ? JSON.stringify(condition_params) : rule.condition_params,
      channels ? JSON.stringify(channels) : rule.channels,
      enabled !== undefined ? (enabled ? 1 : 0) : rule.enabled,
      req.params.id,
    ]
  );

  res.json({ message: '规则已更新' });
});

// DELETE /api/alerts/rules/:id — delete alert rule
router.delete('/rules/:id', (req, res) => {
  run('DELETE FROM alert_rules WHERE id = ?', [req.params.id]);
  res.json({ message: '规则已删除' });
});

// ===== Alert History =====

// GET /api/alerts/history — list alert history
router.get('/history', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 50));
  const offset = (page - 1) * pageSize;

  const total = queryOne('SELECT COUNT(*) as total FROM alert_history')?.total || 0;
  const history = query('SELECT * FROM alert_history ORDER BY id DESC LIMIT ? OFFSET ?', [pageSize, offset]);

  res.json({
    history,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
});

// ===== Alert Settings =====

// GET /api/alerts/settings — get alert channel settings
router.get('/settings', (req, res) => {
  const settings = alertManager.getAlertSettings();
  // Mask sensitive fields
  if (settings.email?.smtp_pass) {
    settings.email.smtp_pass = '****';
  }
  res.json({ settings });
});

// PUT /api/alerts/settings/:channel — update channel settings
router.put('/settings/:channel', (req, res) => {
  const channel = req.params.channel;
  if (!['email', 'webhook'].includes(channel)) {
    return res.status(400).json({ error: '不支持的通道类型' });
  }
  alertManager.saveAlertSettings(channel, req.body);
  res.json({ message: `${channel} 配置已保存` });
});

// POST /api/alerts/test/:channel — test alert channel
router.post('/test/:channel', async (req, res) => {
  const channel = req.params.channel;
  const settings = alertManager.getAlertSettings();

  let result;
  if (channel === 'email') {
    if (!settings.email) return res.status(400).json({ error: '请先配置邮件设置' });
    result = await testEmail(settings.email);
  } else if (channel === 'webhook') {
    if (!settings.webhook) return res.status(400).json({ error: '请先配置 Webhook 设置' });
    result = await testWebhook(settings.webhook);
  } else {
    return res.status(400).json({ error: '不支持的通道类型' });
  }

  res.json(result);
});

module.exports = router;
