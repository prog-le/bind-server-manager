const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ENV_PATH = path.join(__dirname, '..', '.env');

// Load .env file if it exists
function loadEnv() {
  if (fs.existsSync(ENV_PATH)) {
    const lines = fs.readFileSync(ENV_PATH, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

loadEnv();

// Ensure JWT_SECRET exists
function ensureJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const secret = crypto.randomBytes(32).toString('hex');
  const envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  fs.appendFileSync(ENV_PATH, `\nJWT_SECRET=${secret}\n`, 'utf8');
  console.log('Generated new JWT_SECRET and saved to .env');
  process.env.JWT_SECRET = secret;
  return secret;
}

const config = {
  port: process.env.PORT || 3000,
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: ensureJwtSecret(),
  jwtExpiresIn: '24h',
  dbPath: path.join(__dirname, '..', 'data', 'bindmgr.db'),
  bind: {
    configPath: null,
    zoneDir: null,
    rndcPath: null,
  },
};

// Allowed base directories for BIND paths (path whitelist)
const localZoneDir = path.join(__dirname, '..', 'data', 'zones');
const ALLOWED_PATHS = {
  config: ['/etc/bind/', '/etc/named/', '/etc/named.conf', '/usr/local/etc/'],
  zone: ['/var/named/', '/var/cache/bind/', '/etc/bind/zones/', localZoneDir],
  rndc: ['/usr/sbin/', '/usr/bin/', '/usr/local/sbin/'],
};

function isPathAllowed(pathValue, category) {
  const allowed = ALLOWED_PATHS[category] || [];
  const resolved = path.resolve(pathValue);
  return allowed.some(base => resolved.startsWith(path.resolve(base)));
}

// Auto-detect BIND paths
function detectBindPaths() {
  const results = { configPath: null, zoneDir: null, rndcPath: null };

  try {
    if (process.platform === 'win32') {
      results.rndcPath = execSync('where rndc', { encoding: 'utf8' }).trim().split('\n')[0];
    } else {
      results.rndcPath = execSync('which rndc', { encoding: 'utf8' }).trim();
    }
  } catch {
    const commonRndc = ['/usr/sbin/rndc', '/usr/bin/rndc', '/usr/local/sbin/rndc'];
    for (const p of commonRndc) {
      try { fs.accessSync(p, fs.constants.X_OK); results.rndcPath = p; break; } catch {}
    }
  }

  const commonConfigPaths = ['/etc/named.conf', '/etc/bind/named.conf', '/etc/named/named.conf', '/usr/local/etc/named.conf'];
  for (const p of commonConfigPaths) {
    try { fs.accessSync(p, fs.constants.R_OK); results.configPath = p; break; } catch {}
  }

  const commonZoneDirs = ['/var/named/', '/var/named/slaves/', '/etc/bind/zones/', '/var/cache/bind/'];
  for (const p of commonZoneDirs) {
    try { if (fs.statSync(p).isDirectory()) { results.zoneDir = p; break; } } catch {}
  }

  return results;
}

module.exports = { config, detectBindPaths, isPathAllowed, ALLOWED_PATHS };
