const express = require('express');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const bindService = require('../services/bind');
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const { addLog, getClientIp } = require('../utils/logger');
const { isPathAllowed } = require('../config');
const { analyzeError } = require('../utils/config-advisor');

const router = express.Router();

router.use(authMiddleware);

// GET /api/settings — get current BIND paths (masked for security)
router.get('/', (req, res) => {
  const paths = bindService.getPaths();
  res.json({
    settings: {
      bind_config_path: paths.configPath,
      bind_zone_dir: paths.zoneDir,
      rndc_path: paths.rndcPath,
    },
  });
});

// PUT /api/settings — update BIND paths with whitelist validation (ops_admin+)
router.put('/', requireRole('super_admin', 'ops_admin'), [
  body('bind_config_path').optional().isString(),
  body('bind_zone_dir').optional().isString(),
  body('rndc_path').optional().isString(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { bind_config_path, bind_zone_dir, rndc_path } = req.body;

  // Validate paths against whitelist
  if (bind_config_path && !isPathAllowed(bind_config_path, 'config')) {
    return res.status(400).json({ error: '配置路径不在允许的目录中' });
  }
  if (bind_zone_dir && !isPathAllowed(bind_zone_dir, 'zone')) {
    return res.status(400).json({ error: 'Zone 目录不在允许的目录中' });
  }
  if (rndc_path && !isPathAllowed(rndc_path, 'rndc')) {
    return res.status(400).json({ error: 'rndc 路径不在允许的目录中' });
  }

  const changes = [];
  if (bind_config_path) { bindService.setSetting('bind_config_path', bind_config_path); changes.push('bind_config_path'); }
  if (bind_zone_dir) { bindService.setSetting('bind_zone_dir', bind_zone_dir); changes.push('bind_zone_dir'); }
  if (rndc_path) { bindService.setSetting('rndc_path', rndc_path); changes.push('rndc_path'); }

  addLog({ userId: req.user.id, username: req.user.username, action: 'update_settings', target: changes.join(', '), ip: getClientIp(req) });

  const paths = bindService.getPaths();
  res.json({
    message: '设置已更新',
    settings: {
      bind_config_path: paths.configPath,
      bind_zone_dir: paths.zoneDir,
      rndc_path: paths.rndcPath,
    },
  });
});

// GET /api/settings/detect — auto-detect BIND paths
router.get('/detect', (req, res) => {
  const { detectBindPaths } = require('../config');
  const detected = detectBindPaths();
  res.json({ detected });
});

// GET /api/settings/status — check BIND status
router.get('/status', (req, res) => {
  const status = bindService.checkStatus();
  res.json(status);
});

// GET /api/settings/check — validate named.conf
router.get('/check', (req, res) => {
  const { configPath } = bindService.getPaths();
  const result = bindService.checkConfig(configPath);
  const issues = result.success ? [] : analyzeError(result.error);
  res.json({
    valid: result.success,
    path: configPath,
    issues,
    raw: result.success ? null : result.error,
  });
});

// GET /api/settings/check-zone/:name — validate a specific zone file
router.get('/check-zone/:name', (req, res) => {
  const zone = query('SELECT * FROM zones WHERE name = ?', [req.params.name])[0];
  if (!zone) return res.status(404).json({ error: 'Zone 不存在' });
  if (zone.type === 'forward') return res.json({ valid: true, message: '转发 Zone 无需校验文件' });

  const result = bindService.checkZoneFile(zone.name, zone.file_path);
  const issues = result.success ? [] : analyzeError(result.error);
  res.json({
    valid: result.success,
    zone: zone.name,
    path: zone.file_path,
    issues,
    raw: result.success ? null : result.error,
  });
});

// GET /api/settings/check-all — validate all zones and config
router.get('/check-all', (req, res) => {
  const { configPath } = bindService.getPaths();

  // Check main config
  const configResult = bindService.checkConfig(configPath);
  const results = {
    config: {
      valid: configResult.success,
      path: configPath,
      issues: configResult.success ? [] : analyzeError(configResult.error),
    },
    zones: [],
    summary: { total: 0, valid: 0, invalid: 0 },
  };

  // Check all zones
  const zones = query('SELECT * FROM zones WHERE type != ?', ['forward']);
  results.summary.total = zones.length;

  for (const zone of zones) {
    const zoneResult = bindService.checkZoneFile(zone.name, zone.file_path);
    const entry = {
      name: zone.name,
      valid: zoneResult.success,
      path: zone.file_path,
      issues: zoneResult.success ? [] : analyzeError(zoneResult.error),
    };
    results.zones.push(entry);
    if (zoneResult.success) results.summary.valid++;
    else results.summary.invalid++;
  }

  // Overall status
  results.summary.healthy = configResult.success && results.summary.invalid === 0;

  res.json(results);
});

module.exports = router;
