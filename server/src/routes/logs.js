const express = require('express');
const { query, queryOne } = require('../db');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.use(authMiddleware);

// GET /api/logs — list logs with pagination and filters
router.get('/', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 50));
  const offset = (page - 1) * pageSize;

  const conditions = [];
  const params = [];

  if (req.query.action) {
    conditions.push('action = ?');
    params.push(req.query.action);
  }

  if (req.query.username) {
    conditions.push('username LIKE ?');
    params.push(`%${req.query.username}%`);
  }

  if (req.query.keyword) {
    conditions.push('(target LIKE ? OR detail LIKE ?)');
    params.push(`%${req.query.keyword}%`, `%${req.query.keyword}%`);
  }

  if (req.query.status) {
    conditions.push('status = ?');
    params.push(req.query.status);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const countRow = queryOne(`SELECT COUNT(*) as total FROM logs ${where}`, params);
  const total = countRow ? countRow.total : 0;

  const logs = query(
    `SELECT * FROM logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  res.json({
    logs,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

module.exports = router;
