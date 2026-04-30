const express = require('express');
const { query, queryOne, run } = require('../db');
const bindService = require('../services/bind');
const { generateZoneFile, generateSerial } = require('../utils/zonefile');
const { validateRecord, validateRecordName, validateZoneRecords } = require('../utils/validators');
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const { addLog, getClientIp } = require('../utils/logger');

const router = express.Router();

router.use(authMiddleware);

// ─── Conflict Check Helpers ────────────────────────────────────

const CNAME_CONFLICT_TYPES = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'SRV', 'CAA', 'PTR'];

// Wildcard conflict check
function checkWildcardConflict(zoneId, name, excludeId) {
  if (name === '*') return null; // wildcard itself — no conflict

  const wildcards = query(
    'SELECT id, type FROM records WHERE zone_id = ? AND name = ?' + (excludeId ? ' AND id != ?' : ''),
    excludeId ? [zoneId, '*', excludeId] : [zoneId, '*']
  );

  if (wildcards.length === 0) return null;

  const hasWildcardCname = wildcards.some(r => r.type === 'CNAME');
  if (hasWildcardCname) {
    return { type: 'error', msg: `已存在泛域名 CNAME（*.zone）。添加特定记录 "${name}" 可能冲突 — BIND 会通过泛域名 CNAME 解析特定名称。` };
  }

  return { type: 'warning', msg: `该 Zone 已存在泛域名记录（*）。特定记录 "${name}" 将优先解析。` };
}

function checkCnameConflict(zoneId, name, type, excludeId) {
  // CNAME on @ is forbidden
  if (type === 'CNAME' && (name === '@' || name === '')) {
    return '根域名（@）不允许添加 CNAME 记录';
  }

  const existingRecords = query(
    'SELECT id, name, type FROM records WHERE zone_id = ? AND name = ?' + (excludeId ? ' AND id != ?' : ''),
    excludeId ? [zoneId, name, excludeId] : [zoneId, name]
  );

  if (existingRecords.length === 0) return null;

  // If adding CNAME, check no other types exist for same name
  if (type === 'CNAME') {
    const conflicts = existingRecords.filter(r => r.type !== 'CNAME');
    if (conflicts.length > 0) {
      return `无法添加 CNAME："${name}" 已存在 ${conflicts.map(r => r.type).join(', ')} 记录`;
    }
  }

  // If adding non-CNAME, check no CNAME exists for same name
  if (type !== 'CNAME') {
    const cnameConflict = existingRecords.find(r => r.type === 'CNAME');
    if (cnameConflict) {
      return `无法添加 ${type}："${name}" 已存在 CNAME 记录`;
    }
  }

  return null;
}

// ─── Routes ────────────────────────────────────────────────────

// GET /api/zones/:name/records
router.get('/:name/records', (req, res) => {
  const zone = queryOne('SELECT * FROM zones WHERE name = ?', [req.params.name]);
  if (!zone) return res.status(404).json({ error: 'Zone 不存在' });

  if (zone.type === 'forward') return res.json({ records: [] });

  const records = query('SELECT * FROM records WHERE zone_id = ? ORDER BY type, name', [zone.id]);
  res.json({ records });
});

// POST /api/zones/:name/records (ops_admin+)
router.post('/:name/records', requireRole('super_admin', 'ops_admin'), (req, res) => {
  const zone = queryOne('SELECT * FROM zones WHERE name = ?', [req.params.name]);
  if (!zone) return res.status(404).json({ error: 'Zone 不存在' });

  if (zone.type === 'forward') {
    return res.status(400).json({ error: '无法向转发 Zone 添加记录' });
  }
  if (zone.type === 'slave') {
    return res.status(403).json({ error: '无法修改从属 Zone 的记录，从属 Zone 为只读' });
  }

  const { name, type, value, ttl, priority, weight, port } = req.body;

  // Validate record name format
  const nameError = validateRecordName(name);
  if (nameError) {
    return res.status(400).json({ error: nameError });
  }

  // Validate record
  const errors = validateRecord(type, value, priority, weight, port, ttl);
  if (errors.length > 0) {
    return res.status(400).json({ errors: errors.map(msg => ({ msg })) });
  }

  // Check CNAME conflicts
  const conflict = checkCnameConflict(zone.id, name, type);
  if (conflict) {
    return res.status(409).json({ error: conflict });
  }

  // Check wildcard conflict
  const wildcardCheck = checkWildcardConflict(zone.id, name);
  if (wildcardCheck?.type === 'error') {
    return res.status(409).json({ error: wildcardCheck.msg });
  }

  // Zone-level NS/SOA validation (simulate adding this record)
  const currentRecords = query('SELECT * FROM records WHERE zone_id = ?', [zone.id]);
  const simulatedRecords = [...currentRecords, { name, type, value }];
  const zoneValidation = validateZoneRecords(simulatedRecords, zone.name);
  if (zoneValidation.errors.length > 0) {
    return res.status(400).json({ errors: zoneValidation.errors.map(msg => ({ msg })) });
  }

  // Collect warnings
  let warning = null;
  if (wildcardCheck?.type === 'warning') {
    warning = wildcardCheck.msg;
  }
  if (zoneValidation.warnings.length > 0) {
    warning = (warning ? warning + '\n' : '') + zoneValidation.warnings.join('\n');
  }

  try {
    const result = run(
      'INSERT INTO records (zone_id, name, type, value, ttl, priority, weight, port) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [zone.id, name, type, value, ttl || 3600, priority || null, weight || null, port || null]
    );

    regenerateAndReload(zone);

    const record = queryOne('SELECT * FROM records WHERE id = ?', [result.lastInsertRowid]);
    addLog({ userId: req.user.id, username: req.user.username, action: 'create_record', target: `${name}.${req.params.name}`, detail: `${type} ${value}`, ip: getClientIp(req) });
    const resp = { record };
    if (warning) resp.warning = warning;
    res.status(201).json(resp);
  } catch (err) {
    addLog({ userId: req.user.id, username: req.user.username, action: 'create_record', target: `${name}.${req.params.name}`, detail: err.message, ip: getClientIp(req), status: 'failed' });
    res.status(500).json({ error: '创建记录失败：' + err.message });
  }
});

// PUT /api/zones/:name/records/:id (ops_admin+)
router.put('/:name/records/:id', requireRole('super_admin', 'ops_admin'), (req, res) => {
  const zone = queryOne('SELECT * FROM zones WHERE name = ?', [req.params.name]);
  if (!zone) return res.status(404).json({ error: 'Zone 不存在' });

  if (zone.type === 'forward') {
    return res.status(400).json({ error: '无法修改转发 Zone 的记录' });
  }
  if (zone.type === 'slave') {
    return res.status(403).json({ error: '无法修改从属 Zone 的记录，从属 Zone 为只读' });
  }

  const record = queryOne('SELECT * FROM records WHERE id = ? AND zone_id = ?', [req.params.id, zone.id]);
  if (!record) return res.status(404).json({ error: '记录不存在' });

  const { name, type, value, ttl, priority, weight, port } = req.body;

  // Validate record name format
  const nameError = validateRecordName(name);
  if (nameError) {
    return res.status(400).json({ error: nameError });
  }

  // Validate record
  const errors = validateRecord(type, value, priority, weight, port, ttl);
  if (errors.length > 0) {
    return res.status(400).json({ errors: errors.map(msg => ({ msg })) });
  }

  // Check CNAME conflicts (exclude current record)
  const conflict = checkCnameConflict(zone.id, name, type, parseInt(req.params.id));
  if (conflict) {
    return res.status(409).json({ error: conflict });
  }

  // Check wildcard conflict (exclude current record)
  const wildcardCheck = checkWildcardConflict(zone.id, name, parseInt(req.params.id));
  if (wildcardCheck?.type === 'error') {
    return res.status(409).json({ error: wildcardCheck.msg });
  }

  // Zone-level NS/SOA validation (simulate updating this record)
  const currentRecords = query('SELECT * FROM records WHERE zone_id = ?', [zone.id]);
  const simulatedRecords = currentRecords
    .filter(r => r.id !== parseInt(req.params.id))
    .concat([{ name, type, value }]);
  const zoneValidation = validateZoneRecords(simulatedRecords, zone.name);
  if (zoneValidation.errors.length > 0) {
    return res.status(400).json({ errors: zoneValidation.errors.map(msg => ({ msg })) });
  }

  try {
    const oldDetail = `${record.type} ${record.value}`;
    run(
      'UPDATE records SET name = ?, type = ?, value = ?, ttl = ?, priority = ?, weight = ?, port = ? WHERE id = ?',
      [name, type, value, ttl || 3600, priority || null, weight || null, port || null, req.params.id]
    );

    regenerateAndReload(zone);

    const updated = queryOne('SELECT * FROM records WHERE id = ?', [req.params.id]);
    addLog({ userId: req.user.id, username: req.user.username, action: 'update_record', target: `${name}.${req.params.name}`, detail: `${oldDetail} -> ${type} ${value}`, ip: getClientIp(req) });
    const resp = { record: updated };
    if (wildcardCheck?.type === 'warning') resp.warning = wildcardCheck.msg;
    if (zoneValidation.warnings.length > 0) {
      resp.warning = (resp.warning ? resp.warning + '\n' : '') + zoneValidation.warnings.join('\n');
    }
    res.json(resp);
  } catch (err) {
    addLog({ userId: req.user.id, username: req.user.username, action: 'update_record', target: `${name}.${req.params.name}`, detail: err.message, ip: getClientIp(req), status: 'failed' });
    res.status(500).json({ error: '更新记录失败：' + err.message });
  }
});

// DELETE /api/zones/:name/records/:id (ops_admin+)
router.delete('/:name/records/:id', requireRole('super_admin', 'ops_admin'), (req, res) => {
  const zone = queryOne('SELECT * FROM zones WHERE name = ?', [req.params.name]);
  if (!zone) return res.status(404).json({ error: 'Zone 不存在' });

  if (zone.type === 'forward') {
    return res.status(400).json({ error: '无法删除转发 Zone 的记录' });
  }
  if (zone.type === 'slave') {
    return res.status(403).json({ error: '无法删除从属 Zone 的记录，从属 Zone 为只读' });
  }

  const record = queryOne('SELECT * FROM records WHERE id = ? AND zone_id = ?', [req.params.id, zone.id]);
  if (!record) return res.status(404).json({ error: '记录不存在' });

  // Zone-level NS/SOA validation (simulate deleting this record)
  const currentRecords = query('SELECT * FROM records WHERE zone_id = ?', [zone.id]);
  const simulatedRecords = currentRecords.filter(r => r.id !== parseInt(req.params.id));
  const zoneValidation = validateZoneRecords(simulatedRecords, zone.name);
  if (zoneValidation.errors.length > 0) {
    return res.status(400).json({ errors: zoneValidation.errors.map(msg => ({ msg })) });
  }

  try {
    run('DELETE FROM records WHERE id = ?', [req.params.id]);
    regenerateAndReload(zone);

    addLog({ userId: req.user.id, username: req.user.username, action: 'delete_record', target: `${record.name}.${req.params.name}`, detail: `${record.type} ${record.value}`, ip: getClientIp(req) });
    res.json({ message: '记录删除成功' });
  } catch (err) {
    addLog({ userId: req.user.id, username: req.user.username, action: 'delete_record', target: `${record.name}.${req.params.name}`, detail: err.message, ip: getClientIp(req), status: 'failed' });
    res.status(500).json({ error: '删除记录失败：' + err.message });
  }
});

// Helper: regenerate zone file and reload BIND
function regenerateAndReload(zone) {
  if (zone.type === 'forward') return { success: true };

  // Auto-increment SOA serial
  const newSerial = generateSerial(zone.soa_serial);
  zone.soa_serial = newSerial;

  const records = query('SELECT * FROM records WHERE zone_id = ?', [zone.id]);
  const zoneContent = generateZoneFile(zone.name, records, zone);
  bindService.writeZoneFile(zone.name, zoneContent);

  // Persist updated serial
  run('UPDATE zones SET soa_serial = ? WHERE id = ?', [newSerial, zone.id]);

  if (!bindService.isZoneInNamedConf(zone.name)) {
    console.log(`Zone "${zone.name}" not found in named.conf, adding...`);
    bindService.addToNamedConf(zone.name, zone.file_path, zone.type);
    bindService.reconfig();
  }

  let result = bindService.reloadZone(zone.name);
  if (!result.success) {
    console.error(`rndc reload ${zone.name} failed:`, result.error);
    const reconfigResult = bindService.reconfig();
    if (reconfigResult.success) {
      result = bindService.reloadZone(zone.name);
    }
  }
  return result;
}

module.exports = router;
