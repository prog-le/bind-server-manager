const express = require('express');
const { query, queryOne } = require('../db');
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const { verifyChainIntegrity } = require('../utils/audit');
const { stringify: csvStringify } = require('csv-stringify/sync');

const router = express.Router();

// All audit routes require auth; only auditor (readonly) can view
router.use(authMiddleware);
router.use(requireRole('readonly'));

// GET /api/audit — list audit logs with pagination and filters
router.get('/', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 50));
  const offset = (page - 1) * pageSize;

  const conditions = [];
  const params = [];

  if (req.query.action) {
    conditions.push('action LIKE ?');
    params.push(`%${req.query.action}%`);
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

  if (req.query.from) {
    conditions.push('created_at >= ?');
    params.push(req.query.from);
  }

  if (req.query.to) {
    conditions.push('created_at <= ?');
    params.push(req.query.to);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const countRow = queryOne(`SELECT COUNT(*) as total FROM audit_logs ${where}`, params);
  const total = countRow ? countRow.total : 0;

  const logs = query(
    `SELECT id, user_id, username, action, target, detail, ip, user_agent, status, created_at FROM audit_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
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

// GET /api/audit/export — export audit logs as CSV or JSON
router.get('/export', (req, res) => {
  const conditions = [];
  const params = [];

  if (req.query.from) {
    conditions.push('created_at >= ?');
    params.push(req.query.from);
  }
  if (req.query.to) {
    conditions.push('created_at <= ?');
    params.push(req.query.to);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const logs = query(
    `SELECT id, username, action, target, detail, ip, status, created_at FROM audit_logs ${where} ORDER BY id ASC`,
    params
  );

  const format = req.query.format || 'csv';

  if (format === 'csv') {
    const csv = csvStringify(logs, {
      header: true,
      columns: ['id', 'username', 'action', 'target', 'detail', 'ip', 'status', 'created_at'],
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit_logs_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('﻿' + csv); // BOM for Excel
  } else {
    res.json({ logs, exported_at: new Date().toISOString() });
  }
});

// GET /api/audit/verify — verify chain integrity
router.get('/verify', (req, res) => {
  const result = verifyChainIntegrity();
  res.json(result);
});

module.exports = router;
