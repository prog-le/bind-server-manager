const express = require('express');
const authMiddleware = require('../middleware/auth');
const monitorService = require('../services/monitor');

const router = express.Router();

router.use(authMiddleware);

// GET /api/monitor/status — current monitoring status
router.get('/status', (req, res) => {
  const status = monitorService.getStatus();
  res.json(status);
});

// GET /api/monitor/history — monitoring history
router.get('/history', (req, res) => {
  const hours = Math.min(24, Math.max(1, parseInt(req.query.hours) || 2));
  const data = monitorService.getHistory(hours);
  res.json({ hours, count: data.length, data });
});

module.exports = router;
