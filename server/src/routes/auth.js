const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const userService = require('../services/user');
const { config } = require('../config');
const authMiddleware = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');
const { addLog, getClientIp } = require('../utils/logger');

const router = express.Router();

// Login failure tracking (in-memory, per IP)
const loginFailures = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

function getLoginFailures(ip) {
  const entry = loginFailures.get(ip);
  if (!entry) return { count: 0, lockedUntil: 0 };
  if (entry.lockedUntil && Date.now() > entry.lockedUntil) {
    loginFailures.delete(ip);
    return { count: 0, lockedUntil: 0 };
  }
  return entry;
}

function recordLoginFailure(ip) {
  const entry = getLoginFailures(ip);
  const count = entry.count + 1;
  const lockedUntil = count >= MAX_LOGIN_ATTEMPTS ? Date.now() + LOCKOUT_DURATION : 0;
  loginFailures.set(ip, { count, lockedUntil });
  return { count, lockedUntil };
}

function clearLoginFailures(ip) {
  loginFailures.delete(ip);
}

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginFailures.entries()) {
    if (entry.lockedUntil && now > entry.lockedUntil) {
      loginFailures.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// POST /api/auth/register — first user becomes super_admin
router.post('/register', [
  body('username').isLength({ min: 3 }).trim(),
  body('password').isLength({ min: 6 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // Only allow registration if no users exist (first-time setup)
  if (userService.count() > 0) {
    addLog({ action: 'register', username: req.body.username, detail: 'Registration closed', ip: getClientIp(req), status: 'failed' });
    return res.status(403).json({ error: '注册已关闭，用户已存在' });
  }

  const { username, password } = req.body;

  try {
    // First user is super_admin
    const user = userService.create(username, password, 'super_admin');
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });
    addLog({ userId: user.id, username: user.username, action: 'register', ip: getClientIp(req) });
    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    addLog({ action: 'register', username, detail: err.message, ip: getClientIp(req), status: 'failed' });
    res.status(500).json({ error: '创建用户失败：' + err.message });
  }
});

// POST /api/auth/login
router.post('/login', [
  body('username').notEmpty(),
  body('password').notEmpty(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const ip = getClientIp(req);

  // Check lockout
  const failures = getLoginFailures(ip);
  if (failures.lockedUntil && Date.now() < failures.lockedUntil) {
    const remainingSec = Math.ceil((failures.lockedUntil - Date.now()) / 1000);
    addLog({ action: 'login', username: req.body.username, detail: `Account locked for IP ${ip}`, ip, status: 'failed' });
    return res.status(429).json({
      error: `登录尝试过多，账号已锁定 ${Math.ceil(remainingSec / 60)} 分钟`,
      locked: true,
      remainingSeconds: remainingSec,
    });
  }

  const { username, password } = req.body;
  const user = userService.verifyPassword(username, password);

  if (!user) {
    const result = recordLoginFailure(ip);
    const remaining = MAX_LOGIN_ATTEMPTS - result.count;
    addLog({ action: 'login', username, detail: 'Invalid credentials', ip, status: 'failed' });

    const msg = remaining > 0
      ? `用户名或密码错误（还剩 ${remaining} 次尝试机会）`
      : '用户名或密码错误，账号已锁定 15 分钟';

    return res.status(401).json({
      error: msg,
      remainingAttempts: Math.max(0, remaining),
      locked: remaining <= 0,
    });
  }

  // Success — clear failures
  clearLoginFailures(ip);

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
  addLog({ userId: user.id, username: user.username, action: 'login', ip });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
});

// GET /api/auth/me — get current user info
router.get('/me', authMiddleware, (req, res) => {
  const user = userService.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }
  res.json({ user });
});

// GET /api/auth/check — check if any user exists (for first-time setup)
router.get('/check', (req, res) => {
  const hasUsers = userService.count() > 0;
  res.json({ hasUsers });
});

// PUT /api/auth/password — change own password
router.put('/password', authMiddleware, [
  body('oldPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 })
    .matches(/[a-z]/).withMessage('密码需包含小写字母')
    .matches(/[A-Z]/).withMessage('密码需包含大写字母')
    .matches(/[0-9]/).withMessage('密码需包含数字'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { oldPassword, newPassword } = req.body;

  // Verify old password
  const user = userService.findByUsername(req.user.username);
  if (!user || !bcrypt.compareSync(oldPassword, user.password)) {
    addLog({ userId: req.user.id, username: req.user.username, action: 'change_password', detail: '旧密码错误', ip: getClientIp(req), status: 'failed' });
    return res.status(401).json({ error: '旧密码错误' });
  }

  try {
    userService.updatePassword(req.user.id, newPassword);
    addLog({ userId: req.user.id, username: req.user.username, action: 'change_password', ip: getClientIp(req) });
    res.json({ message: '密码修改成功' });
  } catch (err) {
    addLog({ userId: req.user.id, username: req.user.username, action: 'change_password', detail: err.message, ip: getClientIp(req), status: 'failed' });
    res.status(500).json({ error: '密码修改失败：' + err.message });
  }
});

// ===== User Management (super_admin only) =====

// GET /api/auth/users — list all users
router.get('/users', authMiddleware, requireRole('super_admin'), (req, res) => {
  const users = userService.listAll();
  res.json({ users });
});

// POST /api/auth/users — create new user (super_admin only)
router.post('/users', authMiddleware, requireRole('super_admin'), [
  body('username').isLength({ min: 3 }).trim(),
  body('password').isLength({ min: 8 })
    .matches(/[a-z]/).withMessage('密码需包含小写字母')
    .matches(/[A-Z]/).withMessage('密码需包含大写字母')
    .matches(/[0-9]/).withMessage('密码需包含数字'),
  body('role').isIn(userService.ROLES),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { username, password, role } = req.body;

  try {
    const user = userService.create(username, password, role);
    addLog({ userId: req.user.id, username: req.user.username, action: 'create_user', target: username, detail: `角色: ${role}`, ip: getClientIp(req) });
    res.json({ user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    addLog({ userId: req.user.id, username: req.user.username, action: 'create_user', target: username, detail: err.message, ip: getClientIp(req), status: 'failed' });
    res.status(500).json({ error: '创建用户失败：' + err.message });
  }
});

// PUT /api/auth/users/:id/role — update user role (super_admin only)
router.put('/users/:id/role', authMiddleware, requireRole('super_admin'), [
  body('role').isIn(userService.ROLES),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const targetId = parseInt(req.params.id);
  if (targetId === req.user.id) {
    return res.status(400).json({ error: '不能修改自己的角色' });
  }

  const targetUser = userService.findById(targetId);
  if (!targetUser) {
    return res.status(404).json({ error: '用户不存在' });
  }

  try {
    userService.updateRole(targetId, req.body.role);
    addLog({ userId: req.user.id, username: req.user.username, action: 'update_user_role', target: targetUser.username, detail: `新角色: ${req.body.role}`, ip: getClientIp(req) });
    res.json({ message: '角色更新成功' });
  } catch (err) {
    res.status(500).json({ error: '角色更新失败：' + err.message });
  }
});

// DELETE /api/auth/users/:id — delete user (super_admin only)
router.delete('/users/:id', authMiddleware, requireRole('super_admin'), (req, res) => {
  const targetId = parseInt(req.params.id);
  if (targetId === req.user.id) {
    return res.status(400).json({ error: '不能删除自己' });
  }

  const targetUser = userService.findById(targetId);
  if (!targetUser) {
    return res.status(404).json({ error: '用户不存在' });
  }

  try {
    userService.deleteById(targetId);
    addLog({ userId: req.user.id, username: req.user.username, action: 'delete_user', target: targetUser.username, ip: getClientIp(req) });
    res.json({ message: '用户已删除' });
  } catch (err) {
    res.status(500).json({ error: '删除用户失败：' + err.message });
  }
});

// PUT /api/auth/users/:id/reset-password — reset user password (super_admin only, cannot reset other super_admin)
router.put('/users/:id/reset-password', authMiddleware, requireRole('super_admin'), [
  body('newPassword').isLength({ min: 8 })
    .matches(/[a-z]/).withMessage('密码需包含小写字母')
    .matches(/[A-Z]/).withMessage('密码需包含大写字母')
    .matches(/[0-9]/).withMessage('密码需包含数字'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const targetId = parseInt(req.params.id);
  if (targetId === req.user.id) {
    return res.status(400).json({ error: '不能重置自己的密码，请使用"修改密码"功能' });
  }

  const targetUser = userService.findById(targetId);
  if (!targetUser) {
    return res.status(404).json({ error: '用户不存在' });
  }

  // Superadmin can only reset ops_admin and readonly passwords
  if (targetUser.role === 'super_admin') {
    return res.status(403).json({ error: '不能重置其他超级管理员的密码' });
  }

  try {
    userService.updatePassword(targetId, req.body.newPassword);
    addLog({ userId: req.user.id, username: req.user.username, action: 'reset_password', target: targetUser.username, ip: getClientIp(req) });
    res.json({ message: `用户 ${targetUser.username} 的密码已重置` });
  } catch (err) {
    res.status(500).json({ error: '密码重置失败：' + err.message });
  }
});

// PUT /api/auth/users/:id/info — update user info (super_admin only, only ops_admin and readonly)
router.put('/users/:id/info', authMiddleware, requireRole('super_admin'), [
  body('username').optional().isLength({ min: 3 }).trim(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const targetId = parseInt(req.params.id);
  const targetUser = userService.findById(targetId);
  if (!targetUser) {
    return res.status(404).json({ error: '用户不存在' });
  }

  if (targetUser.role === 'super_admin') {
    return res.status(403).json({ error: '不能修改其他超级管理员的信息' });
  }

  const { username } = req.body;
  if (username && username !== targetUser.username) {
    // Check if new username already exists
    if (userService.findByUsername(username)) {
      return res.status(400).json({ error: '用户名已存在' });
    }
    try {
      const { run } = require('../db');
      run('UPDATE users SET username = ? WHERE id = ?', [username, targetId]);
      addLog({ userId: req.user.id, username: req.user.username, action: 'update_user_info', target: targetUser.username, detail: `新用户名: ${username}`, ip: getClientIp(req) });
      res.json({ message: '用户信息已更新' });
    } catch (err) {
      res.status(500).json({ error: '更新失败：' + err.message });
    }
  } else {
    res.json({ message: '无变更' });
  }
});

module.exports = router;
