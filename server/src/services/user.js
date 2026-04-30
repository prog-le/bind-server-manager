const { query, queryOne, run } = require('../db');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

// Valid roles
const ROLES = ['super_admin', 'ops_admin', 'readonly'];

function findByUsername(username) {
  return queryOne('SELECT * FROM users WHERE username = ?', [username]);
}

function findById(id) {
  return queryOne('SELECT id, username, role, created_at FROM users WHERE id = ?', [id]);
}

function count() {
  const result = queryOne('SELECT COUNT(*) as count FROM users');
  return result ? result.count : 0;
}

function create(username, password, role = 'readonly') {
  if (!ROLES.includes(role)) {
    throw new Error('无效的角色：' + role);
  }
  const hash = bcrypt.hashSync(password, SALT_ROUNDS);
  const result = run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hash, role]);
  return { id: result.lastInsertRowid, username, role };
}

function verifyPassword(username, password) {
  const user = findByUsername(username);
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password)) return null;
  return { id: user.id, username: user.username, role: user.role };
}

function updatePassword(id, newPassword) {
  const hash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
  run('UPDATE users SET password = ? WHERE id = ?', [hash, id]);
}

function updateRole(id, role) {
  if (!ROLES.includes(role)) {
    throw new Error('无效的角色：' + role);
  }
  run('UPDATE users SET role = ? WHERE id = ?', [role, id]);
}

function listAll() {
  return query('SELECT id, username, role, created_at FROM users');
}

function deleteById(id) {
  run('DELETE FROM users WHERE id = ?', [id]);
}

module.exports = {
  ROLES,
  findByUsername,
  findById,
  count,
  create,
  verifyPassword,
  updatePassword,
  updateRole,
  listAll,
  deleteById,
};
