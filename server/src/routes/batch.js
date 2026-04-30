const express = require('express');
const { query, queryOne, run } = require('../db');
const bindService = require('../services/bind');
const { generateZoneFile, generateSerial } = require('../utils/zonefile');
const { validateRecord, validateRecordName, validateZoneRecords } = require('../utils/validators');
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const { addLog, getClientIp } = require('../utils/logger');
const { parse: csvParse } = require('csv-parse/sync');
const { stringify: csvStringify } = require('csv-stringify/sync');

const router = express.Router();

router.use(authMiddleware);
router.use(requireRole('super_admin', 'ops_admin'));

// ─── Helpers ────────────────────────────────────────────────────

function getZoneOrFail(name) {
  const zone = queryOne('SELECT * FROM zones WHERE name = ?', [name]);
  if (!zone) throw { status: 404, message: 'Zone 不存在' };
  if (zone.type === 'forward') throw { status: 400, message: '无法向转发 Zone 添加记录' };
  if (zone.type === 'slave') throw { status: 403, message: '无法修改从属 Zone 的记录' };
  return zone;
}

function normalizeRecord(rec) {
  // Convert numeric fields from strings (CSV) to integers
  if (rec.ttl !== undefined && rec.ttl !== null && rec.ttl !== '') rec.ttl = parseInt(rec.ttl, 10) || undefined;
  if (rec.priority !== undefined && rec.priority !== null && rec.priority !== '') rec.priority = parseInt(rec.priority, 10) || 0;
  if (rec.weight !== undefined && rec.weight !== null && rec.weight !== '') rec.weight = parseInt(rec.weight, 10) || 0;
  if (rec.port !== undefined && rec.port !== null && rec.port !== '') rec.port = parseInt(rec.port, 10) || 0;
  return rec;
}

function validateSingleRecord(rec) {
  rec = normalizeRecord(rec);
  const errors = [];
  const nameErr = validateRecordName(rec.name);
  if (nameErr) errors.push(nameErr);

  const valErrors = validateRecord(rec.type, rec.value, rec.priority, rec.weight, rec.port, rec.ttl);
  errors.push(...valErrors);
  return errors;
}

// Regenerate zone file and reload BIND (single call for batch operations)
function regenerateAndReload(zone) {
  if (zone.type === 'forward') return { success: true };
  const newSerial = generateSerial(zone.soa_serial);
  zone.soa_serial = newSerial;
  const records = query('SELECT * FROM records WHERE zone_id = ?', [zone.id]);
  const zoneContent = generateZoneFile(zone.name, records, zone);
  bindService.writeZoneFile(zone.name, zoneContent);
  run('UPDATE zones SET soa_serial = ? WHERE id = ?', [newSerial, zone.id]);

  if (!bindService.isZoneInNamedConf(zone.name)) {
    bindService.addToNamedConf(zone.name, zone.file_path, zone.type);
    bindService.reconfig();
  }

  let result = bindService.reloadZone(zone.name);
  if (!result.success) {
    const reconfigResult = bindService.reconfig();
    if (reconfigResult.success) {
      result = bindService.reloadZone(zone.name);
    }
  }
  return result;
}

// ─── Batch Create ───────────────────────────────────────────────

// POST /api/zones/:name/records/batch
router.post('/:name/records/batch', (req, res) => {
  let zone;
  try {
    zone = getZoneOrFail(req.params.name);
  } catch (e) {
    return res.status(e.status).json({ error: e.message });
  }

  const { records } = req.body;
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: '请提供记录数组' });
  }

  if (records.length > 500) {
    return res.status(400).json({ error: '单次批量操作最多 500 条记录' });
  }

  const results = { created: [], errors: [] };

  // Validate all records first
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const valErrors = validateSingleRecord(rec);
    if (valErrors.length > 0) {
      results.errors.push({ index: i, name: rec.name, type: rec.type, errors: valErrors });
    }
  }

  if (results.errors.length > 0) {
    return res.status(400).json({ error: '部分记录校验失败', details: results.errors });
  }

  // Insert all valid records
  try {
    for (const rec of records) {
      const result = run(
        'INSERT INTO records (zone_id, name, type, value, ttl, priority, weight, port) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [zone.id, rec.name, rec.type, rec.value, rec.ttl || 3600, rec.priority || null, rec.weight || null, rec.port || null]
      );
      results.created.push({ id: result.lastInsertRowid, name: rec.name, type: rec.type });
    }

    // Single regenerate + reload for all records
    regenerateAndReload(zone);

    addLog({
      userId: req.user.id, username: req.user.username,
      action: 'batch_create_records', target: req.params.name,
      detail: `批量创建 ${results.created.length} 条记录`,
      ip: getClientIp(req),
    });

    res.status(201).json({
      message: `成功创建 ${results.created.length} 条记录`,
      created: results.created,
    });
  } catch (err) {
    addLog({
      userId: req.user.id, username: req.user.username,
      action: 'batch_create_records', target: req.params.name,
      detail: err.message, ip: getClientIp(req), status: 'failed',
    });
    res.status(500).json({ error: '批量创建失败：' + err.message });
  }
});

// ─── Batch Update ───────────────────────────────────────────────

// PUT /api/zones/:name/records/batch
router.put('/:name/records/batch', (req, res) => {
  let zone;
  try {
    zone = getZoneOrFail(req.params.name);
  } catch (e) {
    return res.status(e.status).json({ error: e.message });
  }

  const { records } = req.body;
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: '请提供记录数组' });
  }

  const results = { updated: [], errors: [] };

  // Validate and update
  try {
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (!rec.id) {
        results.errors.push({ index: i, error: '缺少记录 ID' });
        continue;
      }

      const existing = queryOne('SELECT * FROM records WHERE id = ? AND zone_id = ?', [rec.id, zone.id]);
      if (!existing) {
        results.errors.push({ index: i, id: rec.id, error: '记录不存在' });
        continue;
      }

      const valErrors = validateSingleRecord(rec);
      if (valErrors.length > 0) {
        results.errors.push({ index: i, id: rec.id, errors: valErrors });
        continue;
      }

      run(
        'UPDATE records SET name = ?, type = ?, value = ?, ttl = ?, priority = ?, weight = ?, port = ? WHERE id = ?',
        [rec.name, rec.type, rec.value, rec.ttl || 3600, rec.priority || null, rec.weight || null, rec.port || null, rec.id]
      );
      results.updated.push({ id: rec.id, name: rec.name, type: rec.type });
    }

    if (results.updated.length > 0) {
      regenerateAndReload(zone);
    }

    addLog({
      userId: req.user.id, username: req.user.username,
      action: 'batch_update_records', target: req.params.name,
      detail: `批量更新 ${results.updated.length} 条记录`,
      ip: getClientIp(req),
    });

    res.json({
      message: `成功更新 ${results.updated.length} 条记录`,
      updated: results.updated,
      errors: results.errors.length > 0 ? results.errors : undefined,
    });
  } catch (err) {
    addLog({
      userId: req.user.id, username: req.user.username,
      action: 'batch_update_records', target: req.params.name,
      detail: err.message, ip: getClientIp(req), status: 'failed',
    });
    res.status(500).json({ error: '批量更新失败：' + err.message });
  }
});

// ─── Batch Delete ───────────────────────────────────────────────

// DELETE /api/zones/:name/records/batch
router.delete('/:name/records/batch', (req, res) => {
  let zone;
  try {
    zone = getZoneOrFail(req.params.name);
  } catch (e) {
    return res.status(e.status).json({ error: e.message });
  }

  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: '请提供记录 ID 数组' });
  }

  try {
    let deleted = 0;
    for (const id of ids) {
      const result = run('DELETE FROM records WHERE id = ? AND zone_id = ?', [id, zone.id]);
      deleted += result.changes;
    }

    if (deleted > 0) {
      regenerateAndReload(zone);
    }

    addLog({
      userId: req.user.id, username: req.user.username,
      action: 'batch_delete_records', target: req.params.name,
      detail: `批量删除 ${deleted} 条记录`,
      ip: getClientIp(req),
    });

    res.json({ message: `成功删除 ${deleted} 条记录`, deleted });
  } catch (err) {
    addLog({
      userId: req.user.id, username: req.user.username,
      action: 'batch_delete_records', target: req.params.name,
      detail: err.message, ip: getClientIp(req), status: 'failed',
    });
    res.status(500).json({ error: '批量删除失败：' + err.message });
  }
});

// ─── Import Records (CSV/JSON) ──────────────────────────────────

// POST /api/zones/:name/records/import
router.post('/:name/records/import', (req, res) => {
  let zone;
  try {
    zone = getZoneOrFail(req.params.name);
  } catch (e) {
    return res.status(e.status).json({ error: e.message });
  }

  const { data, format = 'json' } = req.body;
  if (!data) {
    return res.status(400).json({ error: '请提供导入数据' });
  }

  let records;
  try {
    if (format === 'csv') {
      records = csvParse(data, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } else {
      records = typeof data === 'string' ? JSON.parse(data) : data;
    }
  } catch (err) {
    return res.status(400).json({ error: '数据解析失败：' + err.message });
  }

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: '未解析到有效记录' });
  }

  // Validate all records
  const validationErrors = [];
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const valErrors = validateSingleRecord(rec);
    if (valErrors.length > 0) {
      validationErrors.push({ index: i, name: rec.name, type: rec.type, errors: valErrors });
    }
  }

  if (validationErrors.length > 0) {
    return res.status(400).json({ error: '部分记录校验失败', details: validationErrors });
  }

  // Import records
  try {
    const created = [];
    for (const rec of records) {
      const result = run(
        'INSERT INTO records (zone_id, name, type, value, ttl, priority, weight, port) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [zone.id, rec.name, rec.type, rec.value, rec.ttl || 3600, rec.priority || null, rec.weight || null, rec.port || null]
      );
      created.push({ id: result.lastInsertRowid, name: rec.name, type: rec.type });
    }

    regenerateAndReload(zone);

    addLog({
      userId: req.user.id, username: req.user.username,
      action: 'import_records', target: req.params.name,
      detail: `导入 ${created.length} 条记录 (${format})`,
      ip: getClientIp(req),
    });

    res.status(201).json({
      message: `成功导入 ${created.length} 条记录`,
      created,
    });
  } catch (err) {
    addLog({
      userId: req.user.id, username: req.user.username,
      action: 'import_records', target: req.params.name,
      detail: err.message, ip: getClientIp(req), status: 'failed',
    });
    res.status(500).json({ error: '导入失败：' + err.message });
  }
});

// ─── Export Records (CSV/JSON) ──────────────────────────────────

// GET /api/zones/:name/records/export?format=csv|json
router.get('/:name/records/export', (req, res) => {
  const zone = queryOne('SELECT * FROM zones WHERE name = ?', [req.params.name]);
  if (!zone) return res.status(404).json({ error: 'Zone 不存在' });

  const records = query('SELECT name, type, value, ttl, priority, weight, port FROM records WHERE zone_id = ? ORDER BY type, name', [zone.id]);
  const format = req.query.format || 'json';

  addLog({
    userId: req.user.id, username: req.user.username,
    action: 'export_records', target: req.params.name,
    detail: `导出 ${records.length} 条记录 (${format})`,
    ip: getClientIp(req),
  });

  if (format === 'csv') {
    const csv = csvStringify(records, {
      header: true,
      columns: ['name', 'type', 'value', 'ttl', 'priority', 'weight', 'port'],
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}_records.csv"`);
    res.send('﻿' + csv); // BOM for Excel compatibility
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}_records.json"`);
    res.json({ zone: req.params.name, records, exported_at: new Date().toISOString() });
  }
});

// ─── Batch Create Subdomains ────────────────────────────────────

// POST /api/zones/:name/subdomains
router.post('/:name/subdomains', (req, res) => {
  let zone;
  try {
    zone = getZoneOrFail(req.params.name);
  } catch (e) {
    return res.status(e.status).json({ error: e.message });
  }

  const { subdomains, type = 'A', value, ttl = 3600 } = req.body;

  if (!Array.isArray(subdomains) || subdomains.length === 0) {
    return res.status(400).json({ error: '请提供子域名列表' });
  }

  if (!value) {
    return res.status(400).json({ error: '请提供目标值（IP 地址或域名）' });
  }

  if (!['A', 'AAAA', 'CNAME'].includes(type)) {
    return res.status(400).json({ error: '子域名仅支持 A、AAAA、CNAME 类型' });
  }

  // Validate value based on type
  const valErrors = validateRecord(type, value);
  if (valErrors.length > 0) {
    return res.status(400).json({ error: '目标值无效', errors: valErrors });
  }

  // Validate and create subdomains
  const results = { created: [], errors: [] };

  for (let i = 0; i < subdomains.length; i++) {
    const sub = subdomains[i].trim().toLowerCase();
    if (!sub) continue;

    // Validate subdomain name
    const nameErr = validateRecordName(sub);
    if (nameErr) {
      results.errors.push({ index: i, name: sub, error: nameErr });
      continue;
    }

    // Check for CNAME conflicts
    if (type === 'CNAME') {
      const existing = query(
        'SELECT id, type FROM records WHERE zone_id = ? AND name = ?',
        [zone.id, sub]
      );
      if (existing.length > 0) {
        results.errors.push({ index: i, name: sub, error: `"${sub}" 已存在记录，无法添加 CNAME` });
        continue;
      }
    }

    try {
      const result = run(
        'INSERT INTO records (zone_id, name, type, value, ttl) VALUES (?, ?, ?, ?, ?)',
        [zone.id, sub, type, value, ttl]
      );
      results.created.push({ id: result.lastInsertRowid, name: sub, type, value });
    } catch (err) {
      results.errors.push({ index: i, name: sub, error: err.message });
    }
  }

  if (results.created.length > 0) {
    regenerateAndReload(zone);
  }

  addLog({
    userId: req.user.id, username: req.user.username,
    action: 'batch_create_subdomains', target: req.params.name,
    detail: `批量创建 ${results.created.length} 个子域名 (${type} ${value})`,
    ip: getClientIp(req),
  });

  res.status(201).json({
    message: `成功创建 ${results.created.length} 个子域名`,
    created: results.created,
    errors: results.errors.length > 0 ? results.errors : undefined,
  });
});

module.exports = router;
