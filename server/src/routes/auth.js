const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const userService = require('../services/user');
const { config } = require('../config');
const authMiddleware = require('../middleware/auth');
const { addLog, getClientIp } = require('../utils/logger');

const router = express.Router();

// POST /api/auth/register — first user becomes admin
router.post('/register', [
  body('username').isLength({ min: 3 }).trim(),
  body('password').isLength({ min: 6 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // Only allow registration if no users exist
  if (userService.count() > 0) {
    addLog({ action: 'register', username: req.body.username, detail: 'Registration closed', ip: getClientIp(req), status: 'failed' });
    return res.status(403).json({ error: '注册已关闭，用户已存在' });
  }

  const { username, password } = req.body;

  try {
    const user = userService.create(username, password);
    const token = jwt.sign({ id: user.id, username: user.username }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });
    addLog({ userId: user.id, username: user.username, action: 'register', ip: getClientIp(req) });
    res.json({ token, user: { id: user.id, username: user.username } });
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

  const { username, password } = req.body;
  const user = userService.verifyPassword(username, password);

  if (!user) {
    addLog({ action: 'login', username, detail: 'Invalid credentials', ip: getClientIp(req), status: 'failed' });
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
  addLog({ userId: user.id, username: user.username, action: 'login', ip: getClientIp(req) });
  res.json({ token, user: { id: user.id, username: user.username } });
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

// PUT /api/auth/password — change password
router.put('/password', authMiddleware, [
  body('oldPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 }),
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

module.exports = router;
