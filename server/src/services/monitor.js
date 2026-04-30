const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');

// In-memory history buffer (last 2 hours, sampled every 30s)
const MAX_HISTORY = 240; // 2h * 60min * 2 samples/min
const history = [];

/**
 * Get named process information from /proc
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

    // Read /proc/<pid>/status for memory info
    let memory = { rss: 0, vms: 0 };
    try {
      const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
      const vmrss = status.match(/VmRSS:\s+(\d+)\s+kB/);
      const vmvms = status.match(/VmSize:\s+(\d+)\s+kB/);
      if (vmrss) memory.rss = parseInt(vmrss[1]) * 1024; // bytes
      if (vmvms) memory.vms = parseInt(vmvms[1]) * 1024;
    } catch {}

    // Read /proc/<pid>/stat for CPU info
    let cpu = { percent: 0, threads: 0 };
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const fields = stat.split(/\s+/);
      cpu.threads = parseInt(fields[19]) || 0; // num_threads
    } catch {}

    // Calculate CPU usage from /proc/<pid>/cputime
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const fields = stat.split(/\s+/);
      const utime = parseInt(fields[13]) || 0;
      const stime = parseInt(fields[14]) || 0;
      const totalTime = utime + stime;
      const uptime = os.uptime() * os.cpus().length * 100; // approximate
      if (uptime > 0) {
        cpu.percent = Math.round((totalTime / uptime) * 100 * 100) / 100;
      }
    } catch {}

    // Get process start time
    let startTime = null;
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const fields = stat.split(/\s+/);
      const starttime = parseInt(fields[21]) || 0;
      const clockTick = 100; // sysconf(_SC_CLK_TCK) is usually 100
      const bootTime = parseFloat(fs.readFileSync('/proc/stat', 'utf8')
        .split('\n')
        .find(l => l.startsWith('btime'))
        ?.split(/\s+/)[1] || '0');
      startTime = new Date((bootTime + starttime / clockTick) * 1000).toISOString();
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
 * Check if port 53 is listening
 */
function getPortStatus() {
  try {
    const result = spawnSync('ss', ['-tlnp', 'sport', '=', ':53'], { encoding: 'utf8', timeout: 5000 });
    const output = result.stdout || '';
    const tcp = output.includes(':53');

    const udpResult = spawnSync('ss', ['-ulnp', 'sport', '=', ':53'], { encoding: 'utf8', timeout: 5000 });
    const udpOutput = udpResult.stdout || '';
    const udp = udpOutput.includes(':53');

    return { tcp, udp };
  } catch {
    return { tcp: false, udp: false };
  }
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
