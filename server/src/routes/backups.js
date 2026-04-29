const express = require('express');
const fs = require('fs');
const { query, queryOne, run } = require('../db');
const bindService = require('../services/bind');
const authMiddleware = require('../middleware/auth');
const { addLog, getClientIp } = require('../utils/logger');

const router = express.Router();

router.use(authMiddleware);

// GET /api/backups — list backups (optional ?zone= filter)
router.get('/', (req, res) => {
  const { zone, limit } = req.query;
  let sql = 'SELECT * FROM backups';
  const params = [];

  if (zone) {
    sql += ' WHERE zone_name = ?';
    params.push(zone);
  }

  sql += ' ORDER BY created_at DESC';

  const maxLimit = Math.min(parseInt(limit) || 100, 500);
  sql += ' LIMIT ?';
  params.push(maxLimit);

  const backups = query(sql, params);
  res.json({ backups });
});

// GET /api/backups/:id — view backup content
router.get('/:id', (req, res) => {
  const backup = queryOne('SELECT * FROM backups WHERE id = ?', [req.params.id]);
  if (!backup) {
    return res.status(404).json({ error: '备份不存在' });
  }

  if (!fs.existsSync(backup.backup_path)) {
    return res.status(404).json({ error: '备份文件在磁盘上不存在' });
  }

  try {
    const content = fs.readFileSync(backup.backup_path, 'utf8');
    res.json({ backup, content });
  } catch (err) {
    res.status(500).json({ error: '读取备份失败：' + err.message });
  }
});

// POST /api/backups/:id/restore — restore a backup
router.post('/:id/restore', (req, res) => {
  const backup = queryOne('SELECT * FROM backups WHERE id = ?', [req.params.id]);
  if (!backup) {
    return res.status(404).json({ error: '备份不存在' });
  }

  if (!fs.existsSync(backup.backup_path)) {
    return res.status(404).json({ error: '备份文件在磁盘上不存在' });
  }

  try {
    const content = fs.readFileSync(backup.backup_path, 'utf8');

    if (backup.file_type === 'zone') {
      // Restore zone file
      if (!backup.zone_name) {
        return res.status(400).json({ error: '备份元数据中缺少 Zone 名称' });
      }

      // Validate the backup content before restoring
      const checkResult = bindService.checkZoneFile(backup.zone_name, backup.backup_path);
      if (!checkResult.success) {
        return res.status(400).json({
          error: '备份的 Zone 文件存在语法错误，无法恢复',
          details: checkResult.error,
        });
      }

      // Backup current file before restoring
      const zone = queryOne('SELECT * FROM zones WHERE name = ?', [backup.zone_name]);
      if (zone && zone.file_path) {
        bindService.backupZoneFile(backup.zone_name, zone.file_path);
      }

      // Write the backup content to the zone file
      bindService.writeZoneFile(backup.zone_name, content);

      // Reload the zone
      const reloadResult = bindService.reloadZone(backup.zone_name);
      if (!reloadResult.success) {
        bindService.reconfig();
        bindService.reloadZone(backup.zone_name);
      }

      addLog({
        userId: req.user.id,
        username: req.user.username,
        action: 'restore_backup',
        target: backup.zone_name,
        detail: `Restored from backup #${backup.id} (${backup.backup_path})`,
        ip: getClientIp(req),
      });

      res.json({
        message: `Zone "${backup.zone_name}" 已从备份恢复成功`,
        restoredFrom: backup.created_at,
      });
    } else if (backup.file_type === 'named.conf') {
      // Restore named.conf
      const { configPath } = bindService.getPaths();

      // Validate the backup content
      const checkResult = bindService.checkConfig(backup.backup_path);
      if (!checkResult.success) {
        return res.status(400).json({
          error: '备份的配置文件存在语法错误，无法恢复',
          details: checkResult.error,
        });
      }

      // Backup current config before restoring
      bindService.backupNamedConf();

      // Atomic write
      const tmpPath = configPath + '.tmp.' + process.pid;
      fs.writeFileSync(tmpPath, content, 'utf8');
      fs.renameSync(tmpPath, configPath);

      // Reconfig BIND
      bindService.reconfig();

      addLog({
        userId: req.user.id,
        username: req.user.username,
        action: 'restore_backup',
        target: 'named.conf',
        detail: `Restored from backup #${backup.id}`,
        ip: getClientIp(req),
      });

      res.json({
        message: 'named.conf 已从备份恢复成功',
        restoredFrom: backup.created_at,
      });
    } else {
      return res.status(400).json({ error: `未知的备份类型：${backup.file_type}` });
    }
  } catch (err) {
    addLog({
      userId: req.user.id,
      username: req.user.username,
      action: 'restore_backup',
      target: backup.zone_name || backup.file_type,
      detail: err.message,
      ip: getClientIp(req),
      status: 'failed',
    });
    res.status(500).json({ error: '恢复备份失败：' + err.message });
  }
});

module.exports = router;
