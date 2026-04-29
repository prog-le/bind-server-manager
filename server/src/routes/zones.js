const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const { query, queryOne, run } = require('../db');
const bindService = require('../services/bind');
const { generateZoneFile, generateSerial } = require('../utils/zonefile');
const authMiddleware = require('../middleware/auth');
const { addLog, getClientIp } = require('../utils/logger');

const reloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: '重载请求过多，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = express.Router();

// All routes require auth
router.use(authMiddleware);

// GET /api/zones — list all zones
router.get('/', (req, res) => {
  const zones = query('SELECT * FROM zones ORDER BY name');
  res.json({ zones });
});

// POST /api/zones — create a new zone
router.post('/', [
  body('name').notEmpty()
    .matches(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)
    .custom(v => !v.includes('..') && !v.includes('/'))
    .withMessage('无效的 Zone 名称'),
  body('type').optional().isIn(['master', 'slave', 'forward']),
  body('forwarders').optional().trim(),
  body('forward_type').optional().isIn(['only', 'first']),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, type = 'master', forwarders = '', forward_type = 'only' } = req.body;

  if (type === 'forward' && !forwarders) {
    return res.status(400).json({ error: '转发 Zone 必须指定转发服务器' });
  }

  // Check if zone already exists
  const existing = queryOne('SELECT id FROM zones WHERE name = ?', [name]);
  if (existing) {
    return res.status(409).json({ error: 'Zone 已存在' });
  }

  try {
    const { zoneDir } = bindService.getPaths();
    const filePath = type === 'forward' ? '' : `${zoneDir}${zoneDir.endsWith('/') ? '' : '/'}${name}.db`;

    // Insert into database
    const result = run(
      'INSERT INTO zones (name, type, file_path, forwarders, forward_type) VALUES (?, ?, ?, ?, ?)',
      [name, type, filePath, forwarders || null, type === 'forward' ? forward_type : null]
    );

    const zoneId = result.lastInsertRowid;

    if (type === 'forward') {
      // Forward zones: no records, no zone file, just named.conf entry
      bindService.addToNamedConf(name, null, type, forwarders, forward_type);
      bindService.reconfig();

      addLog({ userId: req.user.id, username: req.user.username, action: 'create_zone', target: name, detail: `type=${type}`, ip: getClientIp(req) });
      res.json({
        zone: { id: zoneId, name, type, forwarders, forward_type },
        message: '转发 Zone 创建成功',
      });
    } else {
      // Master/slave zones: create records + zone file
      const defaultRecords = [
        { name: '@', type: 'NS', value: `ns1.${name}`, ttl: 3600 },
        { name: '@', type: 'NS', value: `ns2.${name}`, ttl: 3600 },
        { name: 'ns1', type: 'A', value: '127.0.0.1', ttl: 3600 },
        { name: 'ns2', type: 'A', value: '127.0.0.1', ttl: 3600 },
      ];

      for (const rec of defaultRecords) {
        run('INSERT INTO records (zone_id, name, type, value, ttl) VALUES (?, ?, ?, ?, ?)',
          [zoneId, rec.name, rec.type, rec.value, rec.ttl]);
      }

      const records = query('SELECT * FROM records WHERE zone_id = ?', [zoneId]);
      const soaSerial = generateSerial();
      const zoneContent = generateZoneFile(name, records, { name, soa_serial: soaSerial });
      bindService.writeZoneFile(name, zoneContent);

      // Persist initial SOA serial
      run('UPDATE zones SET soa_serial = ? WHERE id = ?', [soaSerial, zoneId]);
      bindService.addToNamedConf(name, filePath, type);
      // Use reconfig for new zones so BIND reads the updated named.conf
      bindService.reconfig();

      addLog({ userId: req.user.id, username: req.user.username, action: 'create_zone', target: name, detail: `type=${type}`, ip: getClientIp(req) });
      res.json({
        zone: { id: zoneId, name, type, file_path: filePath },
        message: 'Zone 创建成功',
      });
    }
  } catch (err) {
    addLog({ userId: req.user.id, username: req.user.username, action: 'create_zone', target: name, detail: err.message, ip: getClientIp(req), status: 'failed' });
    res.status(500).json({ error: '创建 Zone 失败：' + err.message });
  }
});

// GET /api/zones/:name — get zone details with records
router.get('/:name', (req, res) => {
  const zone = queryOne('SELECT * FROM zones WHERE name = ?', [req.params.name]);
  if (!zone) {
    return res.status(404).json({ error: 'Zone 不存在' });
  }

  const records = query('SELECT * FROM records WHERE zone_id = ? ORDER BY type, name', [zone.id]);
  res.json({ zone, records });
});

// DELETE /api/zones/:name — delete a zone
router.delete('/:name', (req, res) => {
  const zone = queryOne('SELECT * FROM zones WHERE name = ?', [req.params.name]);
  if (!zone) {
    return res.status(404).json({ error: 'Zone 不存在' });
  }

  try {
    // Delete from named.conf
    bindService.removeFromNamedConf(zone.name);

    // Delete zone file (skip for forward zones)
    if (zone.type !== 'forward') {
      bindService.deleteZoneFile(zone.file_path);
    }

    // Delete from database (records cascade)
    run('DELETE FROM records WHERE zone_id = ?', [zone.id]);
    run('DELETE FROM zones WHERE id = ?', [zone.id]);

    addLog({ userId: req.user.id, username: req.user.username, action: 'delete_zone', target: zone.name, detail: `type=${zone.type}`, ip: getClientIp(req) });
    res.json({ message: 'Zone 删除成功' });
  } catch (err) {
    addLog({ userId: req.user.id, username: req.user.username, action: 'delete_zone', target: zone.name, detail: err.message, ip: getClientIp(req), status: 'failed' });
    res.status(500).json({ error: '删除 Zone 失败：' + err.message });
  }
});

// POST /api/zones/:name/reload — manual reload
router.post('/:name/reload', reloadLimiter, (req, res) => {
  const zone = queryOne('SELECT * FROM zones WHERE name = ?', [req.params.name]);
  if (!zone) {
    return res.status(404).json({ error: 'Zone 不存在' });
  }

  try {
    if (zone.type !== 'forward') {
      // Auto-create NS records if missing (BIND requires at least one)
      const nsRecords = query('SELECT * FROM records WHERE zone_id = ? AND type = ?', [zone.id, 'NS']);
      if (nsRecords.length === 0) {
        console.log(`Zone "${zone.name}" has no NS records, auto-creating...`);
        run('INSERT INTO records (zone_id, name, type, value, ttl) VALUES (?, ?, ?, ?, ?)',
          [zone.id, '@', 'NS', `ns1.${zone.name}`, 3600]);
      }

      // Regenerate zone file from DB with auto-incremented SOA serial
      const newSerial = generateSerial(zone.soa_serial);
      zone.soa_serial = newSerial;
      const records = query('SELECT * FROM records WHERE zone_id = ?', [zone.id]);
      const zoneContent = generateZoneFile(zone.name, records, zone);
      bindService.writeZoneFile(zone.name, zoneContent);
      run('UPDATE zones SET soa_serial = ? WHERE id = ?', [newSerial, zone.id]);
    }

    // Ensure zone entry exists in named.conf
    if (!bindService.isZoneInNamedConf(zone.name)) {
      console.log(`Zone "${zone.name}" not found in named.conf, adding...`);
      bindService.addToNamedConf(zone.name, zone.file_path, zone.type, zone.forwarders, zone.forward_type);
      bindService.reconfig();
    }

    const { configPath } = bindService.getPaths();
    console.log(`Using named.conf: ${configPath}`);

    const result = bindService.reloadZone(zone.name);
    if (result.success) {
      addLog({ userId: req.user.id, username: req.user.username, action: 'reload_zone', target: zone.name, ip: getClientIp(req) });
      res.json({ message: 'Zone 重载成功', output: result.output });
    } else {
      // If reload fails, try reconfig + retry
      const reconfigResult = bindService.reconfig();
      if (reconfigResult.success) {
        const retry = bindService.reloadZone(zone.name);
        if (retry.success) {
          addLog({ userId: req.user.id, username: req.user.username, action: 'reload_zone', target: zone.name, detail: 'after reconfig', ip: getClientIp(req) });
          return res.json({ message: 'Zone 重载成功（重新配置后）', output: retry.output });
        }
      }
      let detail = result.error;
      let hint = '';
      if (result.error && result.error.includes('bad zone')) {
        hint = 'BIND 拒绝了 Zone 文件。请检查 NS/MX/SRV 记录是否使用了主机名（而非 IP 地址），以及所有值是否有效。';
      }
      addLog({ userId: req.user.id, username: req.user.username, action: 'reload_zone', target: zone.name, detail, ip: getClientIp(req), status: 'failed' });
      res.status(500).json({ error: '重载失败', details: detail, hint });
    }
  } catch (err) {
    addLog({ userId: req.user.id, username: req.user.username, action: 'reload_zone', target: zone.name, detail: err.message, ip: getClientIp(req), status: 'failed' });
    res.status(500).json({ error: '重载 Zone 失败：' + err.message });
  }
});

module.exports = router;
