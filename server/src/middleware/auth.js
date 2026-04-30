const jwt = require('jsonwebtoken');
const { config } = require('../config');

const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, config.jwtSecret);

    // Session timeout check: reject tokens older than SESSION_TIMEOUT
    if (decoded.iat) {
      const tokenAge = Date.now() / 1000 - decoded.iat;
      if (tokenAge > SESSION_TIMEOUT / 1000) {
        return res.status(401).json({ error: '会话已超时，请重新登录' });
      }
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token expired or invalid' });
  }
}

// Role-based access control middleware
// Usage: requireRole('super_admin', 'ops_admin')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: '未登录' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: '权限不足，需要角色：' + roles.join(' 或 ') });
    }
    next();
  };
}

module.exports = authMiddleware;
module.exports.requireRole = requireRole;
