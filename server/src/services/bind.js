const { execSync, execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { query, queryOne, run } = require('../db');
const { config, detectBindPaths } = require('../config');

const BACKUP_DIR = path.join(__dirname, '..', '..', 'data', 'backups');
const MAX_BACKUPS = 50;

// ─── Path Management ───────────────────────────────────────────

function getPaths() {
  const detected = detectBindPaths();
  const configPath = getSetting('bind_config_path') || detected.configPath || '/etc/named.conf';
  const zoneDir = getSetting('bind_zone_dir') || detected.zoneDir || '/var/named/';
  const rndcPath = getSetting('rndc_path') || detected.rndcPath || '/usr/sbin/rndc';
  return { configPath, zoneDir, rndcPath };
}

function getSetting(key) {
  const row = queryOne('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : null;
}

function setSetting(key, value) {
  run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}

// ─── rndc Execution ────────────────────────────────────────────

function rndc(args) {
  const { rndcPath } = getPaths();
  try {
    const output = execSync(`${rndcPath} ${args}`, {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { success: true, output: output.trim() };
  } catch (err) {
    return { success: false, error: err.stderr || err.message };
  }
}

function reloadZone(zoneName) {
  return rndc(`reload ${zoneName}`);
}

function reconfig() {
  return rndc('reconfig');
}

// ─── Backup System ─────────────────────────────────────────────

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function getZoneBackupDir(zoneName) {
  const dir = path.join(BACKUP_DIR, zoneName.replace(/[^a-zA-Z0-9.-]/g, '_'));
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function backupFile(filePath, label) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  ensureBackupDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = path.basename(filePath);
  const backupName = `${baseName}.${label || 'bak'}.${timestamp}`;
  const backupPath = path.join(BACKUP_DIR, backupName);

  fs.copyFileSync(filePath, backupPath);

  // Record backup metadata in DB
  try {
    run('INSERT INTO backups (file_type, original_path, backup_path, created_at) VALUES (?, ?, ?, datetime(\'now\'))',
      [label || 'zone', filePath, backupPath]);
  } catch (err) {
    // backups table may not exist yet during first run
    console.error('Failed to record backup metadata:', err.message);
  }

  pruneBackups();
  return backupPath;
}

function backupZoneFile(zoneName, filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const dir = getZoneBackupDir(zoneName);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = path.basename(filePath);
  const backupPath = path.join(dir, `${baseName}.bak.${timestamp}`);

  fs.copyFileSync(filePath, backupPath);

  try {
    run('INSERT INTO backups (zone_name, file_type, original_path, backup_path, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))',
      [zoneName, 'zone', filePath, backupPath]);
  } catch {}

  pruneBackups();
  return backupPath;
}

function backupNamedConf() {
  const { configPath } = getPaths();
  return backupFile(configPath, 'named.conf');
}

function pruneBackups() {
  try {
    const countRow = queryOne('SELECT COUNT(*) as cnt FROM backups');
    if (!countRow || countRow.cnt <= MAX_BACKUPS) return;

    const excess = countRow.cnt - MAX_BACKUPS;
    const old = query('SELECT id, backup_path FROM backups ORDER BY id ASC LIMIT ?', [excess]);
    for (const row of old) {
      try { if (fs.existsSync(row.backup_path)) fs.unlinkSync(row.backup_path); } catch {}
      run('DELETE FROM backups WHERE id = ?', [row.id]);
    }
  } catch {}
}

// ─── Syntax Validation ─────────────────────────────────────────

function checkConfig(configPath) {
  const { rndcPath } = getPaths();
  const checkconfPath = path.join(path.dirname(rndcPath), 'named-checkconf');
  const result = spawnSync(checkconfPath, [configPath], {
    encoding: 'utf8',
    timeout: 10000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status === 0) return { success: true };
  const stderr = (result.stderr || '').trim();
  const stdout = (result.stdout || '').trim();
  return { success: false, error: stderr || stdout || `exit code ${result.status}` };
}

function checkZoneFile(zoneName, filePath) {
  const { rndcPath } = getPaths();
  const checkzonePath = path.join(path.dirname(rndcPath), 'named-checkzone');
  const result = spawnSync(checkzonePath, [zoneName, filePath], {
    encoding: 'utf8',
    timeout: 10000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status === 0) return { success: true };
  const stderr = (result.stderr || '').trim();
  const stdout = (result.stdout || '').trim();
  return { success: false, error: stderr || stdout || `exit code ${result.status}` };
}

// ─── Atomic File Write ─────────────────────────────────────────

function atomicWrite(filePath, content) {
  const tmpPath = filePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

// ─── Zone File Operations ──────────────────────────────────────

function writeZoneFile(zoneName, content) {
  const { zoneDir } = getPaths();
  const zone = queryOne('SELECT * FROM zones WHERE name = ?', [zoneName]);
  if (!zone) throw new Error(`Zone ${zoneName} not found`);

  const filePath = zone.file_path || path.join(zoneDir, `${zoneName}.db`);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write to temp file and validate
  const tmpPath = filePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmpPath, content, 'utf8');

  const checkResult = checkZoneFile(zoneName, tmpPath);
  if (!checkResult.success) {
    try { fs.unlinkSync(tmpPath); } catch {}
    throw new Error(`Zone file syntax error: ${checkResult.error}`);
  }

  // Backup existing file
  backupZoneFile(zoneName, filePath);

  // Atomic rename
  fs.renameSync(tmpPath, filePath);
  return filePath;
}

// ─── named.conf Operations ─────────────────────────────────────

function isZoneInNamedConf(zoneName) {
  const { configPath } = getPaths();
  if (!fs.existsSync(configPath)) return false;

  const content = fs.readFileSync(configPath, 'utf8');
  if (content.includes(`zone "${zoneName}"`)) return true;

  const includeRegex = /include\s+"([^"]+)"/g;
  let match;
  while ((match = includeRegex.exec(content)) !== null) {
    try {
      if (fs.existsSync(match[1])) {
        if (fs.readFileSync(match[1], 'utf8').includes(`zone "${zoneName}"`)) return true;
      }
    } catch {}
  }
  return false;
}

function addToNamedConf(zoneName, filePath, type = 'master', forwarders = null, forwardType = 'only') {
  if (isZoneInNamedConf(zoneName)) return;

  let entry;
  if (type === 'forward') {
    const forwarderList = forwarders ? forwarders.split(/[;,]/).filter(Boolean).map(f => f.trim()).join('; ') + ';' : '';
    entry = `\nzone "${zoneName}" {\n    type forward;\n    forward ${forwardType};\n    forwarders { ${forwarderList} };\n};\n`;
  } else {
    entry = `\nzone "${zoneName}" {\n    type ${type};\n    file "${filePath}";\n    allow-transfer { none; };\n};\n`;
  }

  const { configPath } = getPaths();
  const targets = [configPath];
  const includeCandidates = ['/etc/bind/named.conf.local', '/etc/named.conf.local', '/etc/named/named.conf.local'];
  for (const p of includeCandidates) {
    if (p !== configPath && fs.existsSync(p)) targets.push(p);
  }

  for (const target of targets) {
    try {
      const original = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
      const newContent = original + entry;

      // Validate before writing
      const tmpPath = target + '.tmp.' + process.pid;
      fs.writeFileSync(tmpPath, newContent, 'utf8');
      const checkResult = checkConfig(tmpPath);
      if (!checkResult.success) {
        try { fs.unlinkSync(tmpPath); } catch {}
        console.error(`named-checkconf failed for ${target}:`, checkResult.error);
        continue;
      }

      // Backup and atomic write
      backupFile(target, 'named.conf');
      fs.renameSync(tmpPath, target);
      console.log(`Added zone "${zoneName}" to ${target}`);
      return;
    } catch (err) {
      console.error(`Failed to write to ${target}:`, err.message);
    }
  }

  // Fallback: create main config
  try {
    const tmpPath = configPath + '.tmp.' + process.pid;
    fs.writeFileSync(tmpPath, entry, 'utf8');
    const checkResult = checkConfig(tmpPath);
    if (!checkResult.success) {
      try { fs.unlinkSync(tmpPath); } catch {}
      throw new Error(`named-checkconf failed: ${checkResult.error}`);
    }
    fs.renameSync(tmpPath, configPath);
    console.log(`Created ${configPath} with zone "${zoneName}"`);
  } catch (err) {
    console.error(`Failed to create ${configPath}:`, err.message);
    throw new Error('Cannot write zone entry to any config file');
  }
}

function removeFromNamedConf(zoneName) {
  const { configPath } = getPaths();
  if (!fs.existsSync(configPath)) return;

  let content = fs.readFileSync(configPath, 'utf8');
  const escapedName = escapeRegex(zoneName);
  const zoneRegex = new RegExp(`\\n?zone\\s+"${escapedName}"\\s*\\{`);
  const match = content.match(zoneRegex);
  if (!match) return;

  const startIdx = match.index;
  let depth = 0;
  let endIdx = startIdx;

  for (let i = startIdx; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) {
        endIdx = i + 1;
        if (endIdx < content.length && content[endIdx] === ';') endIdx++;
        if (endIdx < content.length && content[endIdx] === '\n') endIdx++;
        break;
      }
    }
  }

  const newContent = (content.slice(0, startIdx) + content.slice(endIdx)).trim() + '\n';

  // Validate before writing
  const tmpPath = configPath + '.tmp.' + process.pid;
  fs.writeFileSync(tmpPath, newContent, 'utf8');
  const checkResult = checkConfig(tmpPath);
  if (!checkResult.success) {
    try { fs.unlinkSync(tmpPath); } catch {}
    throw new Error(`named-checkconf failed after removing zone: ${checkResult.error}`);
  }

  backupFile(configPath, 'named.conf');
  fs.renameSync(tmpPath, configPath);
}

// ─── Status ────────────────────────────────────────────────────

function checkStatus() {
  const { rndcPath } = getPaths();

  // Strategy 1: try rndc status (handles non-zero exit codes)
  try {
    const result = spawnSync(rndcPath, ['status'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = (result.stdout || '').trim();
    const stderr = (result.stderr || '').trim();

    if (result.status === 0 || stdout.includes('running') || stdout.includes('uptime') || stdout.includes('version')) {
      return { running: true, output: stdout || 'BIND is running' };
    }

    // rndc failed — fall through to process check
  } catch {}

  // Strategy 2: check if named process is running
  try {
    const pidResult = spawnSync('pgrep', ['-x', 'named'], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (pidResult.status === 0 && pidResult.stdout.trim()) {
      return { running: true, output: `named process running (PID: ${pidResult.stdout.trim()})` };
    }
  } catch {}

  // Strategy 3: check if port 53 is listening
  try {
    const ssResult = spawnSync('ss', ['-tlnp', 'sport', '=', '53'], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (ssResult.stdout && ssResult.stdout.includes('named')) {
      return { running: true, output: 'named is listening on port 53' };
    }
  } catch {}

  // Strategy 4: check /proc for named
  try {
    const pidFile = '/var/run/named/named.pid' ;
    if (fs.existsSync(pidFile)) {
      const pid = fs.readFileSync(pidFile, 'utf8').trim();
      if (pid && fs.existsSync(`/proc/${pid}`)) {
        return { running: true, output: `named running (PID from pidfile: ${pid})` };
      }
    }
  } catch {}

  return { running: false, error: 'BIND/named process not detected' };
}

function deleteZoneFile(filePath) {
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  getPaths,
  getSetting,
  setSetting,
  rndc,
  reloadZone,
  reconfig,
  backupZoneFile,
  backupNamedConf,
  writeZoneFile,
  addToNamedConf,
  removeFromNamedConf,
  isZoneInNamedConf,
  checkStatus,
  checkConfig,
  checkZoneFile,
  deleteZoneFile,
};
