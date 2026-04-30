const express = require('express');
const { query, queryOne } = require('../db');
const authMiddleware = require('../middleware/auth');
const { stringify: csvStringify } = require('csv-stringify/sync');

const router = express.Router();

router.use(authMiddleware);

// GET /api/dns-logs — list DNS query logs with pagination and filters
router.get('/', (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize) || 100));
  const offset = (page - 1) * pageSize;

  const conditions = [];
  const params = [];

  if (req.query.name) {
    conditions.push('query_name LIKE ?');
    params.push(`%${req.query.name}%`);
  }

  if (req.query.client_ip) {
    conditions.push('client_ip LIKE ?');
    params.push(`%${req.query.client_ip}%`);
  }

  if (req.query.type) {
    conditions.push('query_type = ?');
    params.push(req.query.type);
  }

  if (req.query.response_code) {
    conditions.push('response_code = ?');
    params.push(req.query.response_code);
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

  const countRow = queryOne(`SELECT COUNT(*) as total FROM dns_query_logs ${where}`, params);
  const total = countRow ? countRow.total : 0;

  const logs = query(
    `SELECT * FROM dns_query_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  res.json({
    logs,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
});

// GET /api/dns-logs/stats — DNS query statistics
router.get('/stats', (req, res) => {
  const hours = Math.min(168, Math.max(1, parseInt(req.query.hours) || 24));
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  // Top queried domains
  const topDomains = query(
    `SELECT query_name, COUNT(*) as count FROM dns_query_logs WHERE created_at >= ? GROUP BY query_name ORDER BY count DESC LIMIT 20`,
    [cutoff]
  );

  // Query type distribution
  const typeDistribution = query(
    `SELECT query_type, COUNT(*) as count FROM dns_query_logs WHERE created_at >= ? GROUP BY query_type ORDER BY count DESC`,
    [cutoff]
  );

  // Top client IPs
  const topClients = query(
    `SELECT client_ip, COUNT(*) as count FROM dns_query_logs WHERE created_at >= ? AND client_ip IS NOT NULL GROUP BY client_ip ORDER BY count DESC LIMIT 20`,
    [cutoff]
  );

  // Hourly distribution
  const hourlyDistribution = query(
    `SELECT strftime('%Y-%m-%d %H:00', created_at) as hour, COUNT(*) as count FROM dns_query_logs WHERE created_at >= ? GROUP BY hour ORDER BY hour`,
    [cutoff]
  );

  // Response code distribution
  const responseCodes = query(
    `SELECT response_code, COUNT(*) as count FROM dns_query_logs WHERE created_at >= ? AND response_code IS NOT NULL GROUP BY response_code ORDER BY count DESC`,
    [cutoff]
  );

  // Total count
  const totalRow = queryOne(
    'SELECT COUNT(*) as total FROM dns_query_logs WHERE created_at >= ?',
    [cutoff]
  );

  res.json({
    hours,
    total: totalRow?.total || 0,
    topDomains,
    typeDistribution,
    topClients,
    hourlyDistribution,
    responseCodes,
  });
});

// GET /api/dns-logs/performance — performance statistics
router.get('/performance', (req, res) => {
  const hours = Math.min(168, Math.max(1, parseInt(req.query.hours) || 24));
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();

  // Success rate (NOERROR vs others)
  const successRow = queryOne(
    "SELECT COUNT(*) as cnt FROM dns_query_logs WHERE created_at >= ? AND response_code = 'NOERROR'",
    [cutoff]
  );
  const totalRow = queryOne(
    'SELECT COUNT(*) as total FROM dns_query_logs WHERE created_at >= ?',
    [cutoff]
  );
  const total = totalRow?.total || 0;
  const successCount = successRow?.cnt || 0;
  const successRate = total > 0 ? ((successCount / total) * 100).toFixed(2) : '0.00';

  // Average latency
  const latencyRow = queryOne(
    'SELECT AVG(response_time_ms) as avg_ms, MIN(response_time_ms) as min_ms, MAX(response_time_ms) as max_ms FROM dns_query_logs WHERE created_at >= ? AND response_time_ms IS NOT NULL',
    [cutoff]
  );

  // Latency trend (hourly average)
  const latencyTrend = query(
    `SELECT strftime('%Y-%m-%d %H:00', created_at) as hour, AVG(response_time_ms) as avg_ms, COUNT(*) as count FROM dns_query_logs WHERE created_at >= ? AND response_time_ms IS NOT NULL GROUP BY hour ORDER BY hour`,
    [cutoff]
  );

  // Success rate trend (hourly)
  const successTrend = query(
    `SELECT strftime('%Y-%m-%d %H:00', created_at) as hour, SUM(CASE WHEN response_code = 'NOERROR' THEN 1 ELSE 0 END) as success, COUNT(*) as total FROM dns_query_logs WHERE created_at >= ? GROUP BY hour ORDER BY hour`,
    [cutoff]
  );

  // Request volume trend (hourly)
  const volumeTrend = query(
    `SELECT strftime('%Y-%m-%d %H:00', created_at) as hour, COUNT(*) as count FROM dns_query_logs WHERE created_at >= ? GROUP BY hour ORDER BY hour`,
    [cutoff]
  );

  // Failure distribution by response code
  const failureCodes = query(
    `SELECT response_code, COUNT(*) as count FROM dns_query_logs WHERE created_at >= ? AND response_code != 'NOERROR' AND response_code IS NOT NULL GROUP BY response_code ORDER BY count DESC`,
    [cutoff]
  );

  // Top failing domains
  const failingDomains = query(
    `SELECT query_name, COUNT(*) as count FROM dns_query_logs WHERE created_at >= ? AND response_code != 'NOERROR' AND response_code IS NOT NULL GROUP BY query_name ORDER BY count DESC LIMIT 10`,
    [cutoff]
  );

  // Query type distribution
  const typeDistribution = query(
    `SELECT query_type, COUNT(*) as count FROM dns_query_logs WHERE created_at >= ? GROUP BY query_type ORDER BY count DESC`,
    [cutoff]
  );

  res.json({
    hours,
    total,
    successRate: parseFloat(successRate),
    latency: {
      avg: latencyRow?.avg_ms ? Math.round(latencyRow.avg_ms) : null,
      min: latencyRow?.min_ms || null,
      max: latencyRow?.max_ms || null,
    },
    latencyTrend,
    successTrend,
    volumeTrend,
    failureCodes,
    failingDomains,
    typeDistribution,
  });
});

// GET /api/dns-logs/export — export DNS logs as CSV
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
    `SELECT client_ip, query_name, query_type, response_code, response_data, created_at FROM dns_query_logs ${where} ORDER BY id DESC LIMIT 10000`,
    params
  );

  const csv = csvStringify(logs, {
    header: true,
    columns: ['client_ip', 'query_name', 'query_type', 'response_code', 'response_data', 'created_at'],
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="dns_query_logs_${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + csv);
});

module.exports = router;
