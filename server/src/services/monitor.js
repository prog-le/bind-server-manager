const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');

// In-memory history buffer (last 2 hours, sampled every 30s)
const MAX_HISTORY = 240; // 2h * 60min * 2 samples/min
const history = [];

/**
 * Get named process information (cross-platform: Linux + macOS)
 */
function getProcessInfo() {
  try {
    // Find named PID
    const pidResult = spawnSync('pgrep', ['-x', 'named'], { encoding: 'utf8', timeout: 5000 });
    if (pidResult.status !== 0 || !pidResult.stdout.trim()) {
      return { running: false, pid: null };
    }

    const pids = pidResult.stdout.trim().split('\n');
    const pid = pids[0];

    let memory = { rss: 0, vms: 0 };
    let cpu = { percent: 0, threads: 0 };
    let startTime = null;

    // Use ps for cross-platform process info (Linux, macOS, BSD)
    try {
      const psResult = spawnSync('ps', ['-o', 'rss=,vsz=,%cpu=,nlwp=,lstart=', '-p', pid], {
        encoding: 'utf8', timeout: 5000
      });
      const output = (psResult.stdout || '').trim();
      if (output) {
        const fields = output.split(/\s+/);
        memory.rss = parseInt(fields[0]) * 1024 || 0;   // RSS in kB → bytes
        memory.vms = parseInt(fields[1]) * 1024 || 0;   // VSZ in kB → bytes
        cpu.percent = parseFloat(fields[2]) || 0;        // %CPU snapshot
        cpu.threads = parseInt(fields[3]) || 0;          // NLWP (threads)
        if (fields[4]) {
          // lstart format: "Wed Mar 12 08:30:45 2025"
          startTime = new Date(fields.slice(4).join(' ')).toISOString();
        }
      }
    } catch {}

    return {
      running: true,
      pid: parseInt(pid),
      memory,
      cpu,
      startTime,
    };
  } catch (err) {
    return { running: false, pid: null, error: err.message };
  }
}

/**
 * Check if port 53 is listening (cross-platform: Linux ss + macOS lsof)
 */
function getPortStatus() {
  // Try ss first (Linux)
  try {
    const result = spawnSync('ss', ['-tlnp', 'sport', '=', '53'], { encoding: 'utf8', timeout: 5000 });
    const output = result.stdout || '';
    const tcp = output.includes(':53');

    const udpResult = spawnSync('ss', ['-ulnp', 'sport', '=', '53'], { encoding: 'utf8', timeout: 5000 });
    const udpOutput = udpResult.stdout || '';
    const udp = udpOutput.includes(':53');

    if (result.status === 0 || result.error?.code !== 'ENOENT') {
      return { tcp, udp };
    }
  } catch {}

  // Fallback to lsof (macOS/BSD)
  try {
    const tcpResult = spawnSync('lsof', ['-nP', '-iTCP:53', '-sTCP:LISTEN'], { encoding: 'utf8', timeout: 5000 });
    const udpResult = spawnSync('lsof', ['-nP', '-iUDP:53', '-sUDP:LISTEN'], { encoding: 'utf8', timeout: 5000 });
    return {
      tcp: (tcpResult.stdout || '').includes('named'),
      udp: (udpResult.stdout || '').includes('named'),
    };
  } catch {}

  return { tcp: false, udp: false };
}

/**
 * Get BIND uptime and version via rndc
 */
function getRndcStatus() {
  try {
    const { getPaths } = require('./bind');
    const { rndcPath } = getPaths();
    const result = spawnSync(rndcPath, ['status'], { encoding: 'utf8', timeout: 10000 });
    const output = (result.stdout || '') + (result.stderr || '');

    const version = output.match(/version:\s*(.+)/i)?.[1]?.trim() || null;
    const uptime = output.match(/uptime:\s*(.+)/i)?.[1]?.trim() || null;
    const running = /running|server is up/i.test(output);

    return { running, version, uptime, output: output.trim() };
  } catch (err) {
    return { running: false, error: err.message };
  }
}

/**
 * Get comprehensive monitoring status
 */
function getStatus() {
  const processInfo = getProcessInfo();
  const portStatus = getPortStatus();
  const rndcStatus = getRndcStatus();

  const status = {
    running: processInfo.running || rndcStatus.running,
    pid: processInfo.pid,
    memory: processInfo.memory,
    cpu: processInfo.cpu,
    startTime: processInfo.startTime,
    ports: portStatus,
    rndc: rndcStatus,
    timestamp: new Date().toISOString(),
  };

  // Record to history
  history.push(status);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }

  return status;
}

/**
 * Get monitoring history
 */
function getHistory(hours = 2) {
  const cutoff = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  return history.filter(h => h.timestamp >= cutoff);
}

module.exports = { getStatus, getHistory, getProcessInfo, getPortStatus, getRndcStatus };
