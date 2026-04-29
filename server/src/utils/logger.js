const { run } = require('../db');

function addLog({ userId = null, username = null, action, target = null, detail = null, ip = null, status = 'success' }) {
  try {
    run(
      'INSERT INTO logs (user_id, username, action, target, detail, ip, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, username, action, target, detail, ip, status]
    );
    const prefix = `[${status.toUpperCase()}]`;
    const user = username || 'system';
    console.log(`[LOG] ${prefix} user=${user} action=${action} target=${target || '-'} detail=${detail || '-'}`);
  } catch (err) {
    console.error('[LOG] Failed to write log:', err.message);
  }
}

function getClientIp(req) {
  return req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || null;
}

module.exports = { addLog, getClientIp };
