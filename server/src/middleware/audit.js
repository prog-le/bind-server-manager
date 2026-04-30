const { writeAuditLog } = require('../utils/audit');
const { getClientIp } = require('../utils/logger');

// Map HTTP methods to audit actions
const METHOD_ACTION_MAP = {
  POST: 'create',
  PUT: 'update',
  DELETE: 'delete',
  PATCH: 'update',
};

/**
 * Audit middleware — automatically logs write operations
 * Place this after authMiddleware in the route chain
 */
function auditMiddleware(req, res, next) {
  // Only audit write operations
  const method = req.method.toUpperCase();
  if (!METHOD_ACTION_MAP[method]) {
    return next();
  }

  // Capture the original json method to intercept the response
  const originalJson = res.json.bind(res);

  res.json = function (body) {
    // Determine action from route path
    const pathParts = req.path.split('/').filter(Boolean);
    const resource = pathParts[0] || 'unknown';
    const action = `${METHOD_ACTION_MAP[method]}_${resource}`;

    // Build target from URL params
    const target = req.params.name || req.params.id || resource;

    // Build detail
    let detail = `${req.method} ${req.originalUrl}`;
    if (req.body && Object.keys(req.body).length > 0) {
      // Don't log passwords
      const safeBody = { ...req.body };
      delete safeBody.password;
      delete safeBody.oldPassword;
      delete safeBody.newPassword;
      detail += ' | ' + JSON.stringify(safeBody).substring(0, 500);
    }

    const status = res.statusCode >= 400 ? 'failed' : 'success';

    try {
      writeAuditLog({
        userId: req.user?.id,
        username: req.user?.username || 'anonymous',
        action,
        target,
        detail,
        ip: getClientIp(req),
        userAgent: req.headers['user-agent']?.substring(0, 200),
        status,
      });
    } catch (err) {
      console.error('Audit log write failed:', err.message);
    }

    return originalJson(body);
  };

  next();
}

module.exports = auditMiddleware;
