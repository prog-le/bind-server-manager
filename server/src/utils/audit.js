const crypto = require('crypto');
const { query, queryOne, run } = require('../db');

/**
 * Compute chain hash for audit log entry
 * hash = SHA256(prev_hash + action + detail + timestamp + ip)
 */
function computeHash(prevHash, action, detail, timestamp, ip) {
  const data = (prevHash || 'GENESIS') + '|' + (action || '') + '|' + (detail || '') + '|' + (timestamp || '') + '|' + (ip || '');
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Get the hash of the last audit log entry
 */
function getLastHash() {
  const last = queryOne('SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1');
  return last ? last.hash : null;
}

/**
 * Write an audit log entry with chain hashing
 * Audit logs are INSERT-only — no UPDATE or DELETE allowed
 */
function writeAuditLog({ userId, username, action, target, detail, ip, userAgent, status = 'success' }) {
  const timestamp = new Date().toISOString();
  const prevHash = getLastHash();
  const hash = computeHash(prevHash, action, detail, timestamp, ip);

  const result = run(
    'INSERT INTO audit_logs (user_id, username, action, target, detail, ip, user_agent, status, hash, prev_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [userId || null, username || 'system', action, target || null, detail || null, ip || null, userAgent || null, status, hash, prevHash, timestamp]
  );

  return { id: result.lastInsertRowid, hash, prevHash };
}

/**
 * Verify the integrity of the audit log chain
 * Returns { valid: boolean, brokenAt: number|null, total: number }
 */
function verifyChainIntegrity() {
  const logs = query('SELECT id, action, detail, ip, hash, prev_hash, created_at FROM audit_logs ORDER BY id ASC');
  const total = logs.length;

  if (total === 0) return { valid: true, brokenAt: null, total: 0 };

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const expectedPrevHash = i === 0 ? null : logs[i - 1].hash;

    // Verify prev_hash matches
    if (log.prev_hash !== (expectedPrevHash || null) && !(i === 0 && log.prev_hash === null)) {
      return { valid: false, brokenAt: log.id, total, reason: 'prev_hash 不匹配' };
    }

    // Verify hash
    const expectedHash = computeHash(log.prev_hash, log.action, log.detail, log.created_at, log.ip);
    if (log.hash !== expectedHash) {
      return { valid: false, brokenAt: log.id, total, reason: 'hash 校验失败' };
    }
  }

  return { valid: true, brokenAt: null, total };
}

module.exports = { writeAuditLog, verifyChainIntegrity, computeHash };
