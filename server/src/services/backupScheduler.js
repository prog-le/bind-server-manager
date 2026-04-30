const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const cron = require('node-cron');
const { query, queryOne, run } = require('../db');
const { config } = require('../config');

const FULL_BACKUP_DIR = path.join(__dirname, '..', '..', 'data', 'full-backups');
let scheduledTask = null;

function ensureBackupDir() {
  if (!fs.existsSync(FULL_BACKUP_DIR)) {
    fs.mkdirSync(FULL_BACKUP_DIR, { recursive: true });
  }
}

/**
 * Create a full backup: zone files + named.conf + database → tar.gz
 */
async function createFullBackup() {
  ensureBackupDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archiveName = `full-backup-${timestamp}.tar.gz`;
  const archivePath = path.join(FULL_BACKUP_DIR, archiveName);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(archivePath);
    const archive = archiver('tar', { gzip: true, gzipOptions: { level: 9 } });

    output.on('close', () => {
      const size = archive.pointer();
      // Record in backups table
      try {
        run(
          "INSERT INTO backups (zone_name, file_type, original_path, backup_path, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
          ['_full_backup_', 'full', 'multiple', archivePath]
        );
      } catch (err) {
        console.error('Failed to record full backup metadata:', err.message);
      }
      resolve({ success: true, path: archivePath, name: archiveName, size });
    });

    archive.on('error', reject);
    archive.pipe(output);

    // 1. Add database file
    if (fs.existsSync(config.dbPath)) {
      archive.file(config.dbPath, { name: 'database/bindmgr.db' });
    }

    // 2. Add named.conf
    const settingsRow = queryOne("SELECT value FROM settings WHERE key = 'bind_config_path'");
    const configPath = settingsRow?.value || '/etc/named.conf';
    if (fs.existsSync(configPath)) {
      archive.file(configPath, { name: `config/named.conf` });
    }

    // 3. Add all zone files
    const zones = query('SELECT name, file_path FROM zones');
    for (const zone of zones) {
      if (zone.file_path && fs.existsSync(zone.file_path)) {
        archive.file(zone.file_path, { name: `zones/${zone.name}.db` });
      }
    }

    // 4. Add backup metadata
    const metadata = {
      created_at: new Date().toISOString(),
      zones: zones.map(z => z.name),
      config_path: configPath,
      version: '1.0.0',
    };
    archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });

    archive.finalize();
  });
}

/**
 * Get schedule config from settings
 */
function getScheduleConfig() {
  const row = queryOne("SELECT value FROM settings WHERE key = 'backup_schedule'");
  if (row) {
    try { return JSON.parse(row.value); } catch {}
  }
  return { enabled: false, cron: '0 2 * * *', retain: 7 };
}

/**
 * Save schedule config
 */
function saveScheduleConfig(cfg) {
  run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ['backup_schedule', JSON.stringify(cfg)]);
  restartScheduler();
}

/**
 * Start the cron scheduler
 */
function startScheduler() {
  const cfg = getScheduleConfig();
  if (!cfg.enabled) return;

  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }

  if (!cron.validate(cfg.cron)) {
    console.error('Invalid backup cron expression:', cfg.cron);
    return;
  }

  scheduledTask = cron.schedule(cfg.cron, async () => {
    console.log('Scheduled full backup starting...');
    try {
      const result = await createFullBackup();
      console.log(`Full backup completed: ${result.name} (${(result.size / 1024 / 1024).toFixed(2)} MB)`);
      pruneFullBackups(cfg.retain || 7);
    } catch (err) {
      console.error('Scheduled backup failed:', err.message);
    }
  }, { timezone: 'Asia/Shanghai' });

  console.log(`Backup scheduler started (cron: ${cfg.cron})`);
}

function restartScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
  startScheduler();
}

function stopScheduler() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

/**
 * Prune old full backups, keeping only `retain` most recent
 */
function pruneFullBackups(retain = 7) {
  ensureBackupDir();
  const files = fs.readdirSync(FULL_BACKUP_DIR)
    .filter(f => f.startsWith('full-backup-') && f.endsWith('.tar.gz'))
    .sort()
    .reverse();

  if (files.length <= retain) return;

  const toDelete = files.slice(retain);
  for (const f of toDelete) {
    try {
      fs.unlinkSync(path.join(FULL_BACKUP_DIR, f));
      console.log(`Pruned old backup: ${f}`);
    } catch {}
  }
}

/**
 * List all full backup files
 */
function listFullBackups() {
  ensureBackupDir();
  const files = fs.readdirSync(FULL_BACKUP_DIR)
    .filter(f => f.endsWith('.tar.gz'))
    .sort()
    .reverse();

  return files.map(f => {
    const stat = fs.statSync(path.join(FULL_BACKUP_DIR, f));
    return {
      name: f,
      path: path.join(FULL_BACKUP_DIR, f),
      size: stat.size,
      created_at: stat.mtime.toISOString(),
    };
  });
}

/**
 * Get file path for a named backup
 */
function getBackupFilePath(name) {
  const safeName = path.basename(name);
  const fullPath = path.join(FULL_BACKUP_DIR, safeName);
  if (!fullPath.startsWith(FULL_BACKUP_DIR)) return null;
  if (!fs.existsSync(fullPath)) return null;
  return fullPath;
}

/**
 * Delete a full backup file
 */
function deleteFullBackup(name) {
  const filePath = getBackupFilePath(name);
  if (!filePath) return false;
  fs.unlinkSync(filePath);
  return true;
}

module.exports = {
  createFullBackup,
  getScheduleConfig,
  saveScheduleConfig,
  startScheduler,
  stopScheduler,
  listFullBackups,
  getBackupFilePath,
  deleteFullBackup,
  pruneFullBackups,
};
