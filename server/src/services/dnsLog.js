const fs = require('fs');
const { run, query, queryOne } = require('../db');

// Common BIND query log patterns (multiple formats)
// Format 1 (detailed): 28-Apr-2026 14:30:00.123 client @0x7f... 192.168.1.1#12345 (example.com): query: example.com IN A +E(0) (10.0.0.1)
// Format 2 (short): 28-Apr-2026 14:30:00.123 queries: client 192.168.1.1#12345 (example.com): query: example.com IN A
// Format 3 (syslog): Apr 28 14:30:00 host named[1234]: client @0x... 192.168.1.1#12345: query: example.com IN A
// Format 4 (minimal): ... client 10.0.0.1#53 (example.com): query: example.com IN A
const QUERY_LOG_REGEX = /(\d+-\w+-\d+\s+\d+:\d+:\d+\.\d+|\w+\s+\d+\s+\d+:\d+:\d+)\s+.*?client\s+(?:@\S+\s+)?(\d+\.\d+\.\d+\.\d+|\[[:0-9a-fA-F]+\])#\d+\s+\(([^)]*)\):\s+query:\s+(\S+)\s+(\S+)\s+(\S+)\s*([+-]\S+)?/;

// Simpler fallback pattern — extract domain, type, and optional flags from any line with "query:"
const SIMPLE_QUERY_REGEX = /query:\s+(\S+)\s+(\S+)\s+(\S+)\s*([+-]\S+)?/;

// BIND response code mapping from query log flags
// +E(0) = NOERROR, -E(0) = NXDOMAIN, +T(0) = NOERROR (TCP), etc.
const FLAG_TO_RCODE = {
  '+': 'NOERROR',
  '-': 'NXDOMAIN',
  '-E': 'NXDOMAIN',
  '+E': 'NOERROR',
  '+T': 'NOERROR',
  '-T': 'NXDOMAIN',
  '+D': 'NOERROR',
  '-D': 'NXDOMAIN',
  '-S': 'SERVFAIL',
  '+S': 'NOERROR',
};

function rcodeFromFlags(flags) {
  if (!flags) return 'NOERROR';
  const clean = flags.replace(/\(\d+\)/, '').trim();
  return FLAG_TO_RCODE[clean] || (clean.startsWith('-') ? 'NXDOMAIN' : 'NOERROR');
}

// Auto-cleanup: keep only last 7 days of logs
const MAX_LOG_DAYS = 7;

let logWatcher = null;
let logFilePath = null;
let lastPosition = 0;
let pollTimer = null;

/**
 * Find BIND query log file by scanning named.conf logging blocks and common paths
 */
function findQueryLog() {
  const { getPaths } = require('./bind');
  const paths = getPaths();

  const candidates = [];

  // Parse named.conf — only extract file paths inside logging {} blocks
  const configPath = paths.configPath;
  try {
    const config = fs.readFileSync(configPath, 'utf8');

    // Find all logging { ... } blocks (including named.conf.local etc.)
    const includeRegex = /include\s+"([^"]+)"/g;
    let fullConfig = config;
    let incMatch;
    while ((incMatch = includeRegex.exec(config)) !== null) {
      try {
        if (fs.existsSync(incMatch[1])) {
          fullConfig += '\n' + fs.readFileSync(incMatch[1], 'utf8');
        }
      } catch {}
    }

    // Extract only file paths inside logging blocks
    const loggingBlockMatch = fullConfig.match(/logging\s*\{([\s\S]*?)\}\s*;/);
    if (loggingBlockMatch) {
      const logBlock = loggingBlockMatch[1];
      const fileRegex = /file\s+"([^"]+)"/g;
      let m;
      while ((m = fileRegex.exec(logBlock)) !== null) {
        candidates.push(m[1]);
      }
    }
  } catch {}

  // Only return paths found inside logging {} blocks in named.conf
  // Don't fall through to system logs like /var/log/messages
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Parse a single BIND query log line
 */
function parseQueryLine(line) {
  // Try full pattern first
  let match = line.match(QUERY_LOG_REGEX);
  if (match) {
    return {
      timestamp: match[1],
      client_ip: match[2].replace(/[\[\]]/g, ''),
      query_name: match[3],
      query_type: match[6],
      response_code: rcodeFromFlags(match[7]),
    };
  }

  // Try simpler pattern
  match = line.match(SIMPLE_QUERY_REGEX);
  if (match) {
    return {
      query_name: match[1],
      query_type: match[3],
      response_code: rcodeFromFlags(match[4]),
    };
  }

  return null;
}

/**
 * Write parsed DNS log entries to database
 */
function writeLogEntries(entries) {
  for (const entry of entries) {
    try {
      run(
        'INSERT INTO dns_query_logs (client_ip, query_name, query_type, response_code, response_data, response_time_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          entry.client_ip || null,
          entry.query_name,
          entry.query_type || 'A',
          entry.response_code || null,
          entry.response_data || null,
          entry.response_time_ms || null,
          entry.timestamp || new Date().toISOString(),
        ]
      );
    } catch (err) {
      // Silently skip individual entry errors
    }
  }
}

/**
 * Read new lines from the log file since lastPosition
 */
function readNewLines() {
  if (!logFilePath || !fs.existsSync(logFilePath)) return;

  try {
    const stats = fs.statSync(logFilePath);
    if (stats.size <= lastPosition) {
      // File was rotated or truncated
      lastPosition = 0;
    }

    if (stats.size === lastPosition) return; // Nothing new

    const fd = fs.openSync(logFilePath, 'r');
    const buffer = Buffer.alloc(stats.size - lastPosition);
    fs.readSync(fd, buffer, 0, buffer.length, lastPosition);
    fs.closeSync(fd);

    lastPosition = stats.size;

    const newContent = buffer.toString('utf8');
    const lines = newContent.split('\n');

    const entries = [];
    for (const line of lines) {
      if (!line.includes('query:')) continue;
      const parsed = parseQueryLine(line);
      if (parsed) entries.push(parsed);
    }

    if (entries.length > 0) {
      writeLogEntries(entries);
    }
  } catch (err) {
    console.error('DNS log read error:', err.message);
  }
}

/**
 * Start watching BIND query log file
 */
function startLogWatcher() {
  // Always try to enable BIND query logging first (most reliable)
  try {
    const bindService = require('./bind');
    const configured = bindService.ensureQueryLogging();
    if (configured) {
      logFilePath = configured;
      console.log(`DNS query logging configured: ${logFilePath}`);
      // Wait for BIND to create the file after reconfig
      setTimeout(() => {
        if (!fs.existsSync(logFilePath)) {
          try { fs.writeFileSync(logFilePath, '', { flag: 'a' }); } catch {}
        }
        initWatcher();
      }, 3000);
      return true;
    }
  } catch (err) {
    console.error('Failed to enable query logging:', err.message);
  }

  // Fallback: look for existing log file from logging blocks in named.conf
  logFilePath = findQueryLog();
  if (logFilePath) {
    return initWatcher();
  }

  // Last resort: try rndc querylog on
  try {
    const bindService = require('./bind');
    bindService.rndc('querylog on');
    logFilePath = '/var/log/named/query.log';
    setTimeout(() => initWatcher(), 2000);
    return true;
  } catch {}

  console.log('DNS query log monitoring disabled: could not enable query logging');
  return false;
}

function initWatcher() {
  if (!logFilePath) return false;

  // Ensure the log file exists
  if (!fs.existsSync(logFilePath)) {
    try { fs.writeFileSync(logFilePath, '', { flag: 'a' }); } catch {}
  }

  if (!fs.existsSync(logFilePath)) {
    console.log(`DNS query log file does not exist: ${logFilePath}`);
    return false;
  }

  console.log(`Watching DNS query log: ${logFilePath}`);

  // Read existing content from beginning
  lastPosition = 0;
  readNewLines();

  // Watch for changes using fs.watch
  try {
    logWatcher = fs.watch(logFilePath, () => {
      readNewLines();
    });
  } catch (err) {
    console.error('fs.watch failed, falling back to polling:', err.message);
  }

  // Also poll every 5 seconds as fallback (fs.watch is unreliable on some systems)
  pollTimer = setInterval(readNewLines, 5000);

  return true;
}

/**
 * Stop watching log file
 */
function stopLogWatcher() {
  if (logWatcher) {
    logWatcher.close();
    logWatcher = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/**
 * Cleanup old DNS query logs (older than MAX_LOG_DAYS)
 */
function cleanupOldLogs() {
  try {
    const cutoff = new Date(Date.now() - MAX_LOG_DAYS * 86400000).toISOString();
    const result = run('DELETE FROM dns_query_logs WHERE created_at < ?', [cutoff]);
    if (result.changes > 0) {
      console.log(`Cleaned up ${result.changes} old DNS query log entries`);
    }
  } catch (err) {
    console.error('DNS log cleanup error:', err.message);
  }
}

module.exports = {
  startLogWatcher,
  stopLogWatcher,
  cleanupOldLogs,
  findQueryLog,
  parseQueryLine,
  writeLogEntries,
};
