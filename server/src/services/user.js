const { query, queryOne, run } = require('../db');
const bcrypt = require('bcryptjs');

const SALT_ROUNDS = 10;

function findByUsername(username) {
  return queryOne('SELECT * FROM users WHERE username = ?', [username]);
}

function findById(id) {
  return queryOne('SELECT id, username, created_at FROM users WHERE id = ?', [id]);
}

function count() {
  const result = queryOne('SELECT COUNT(*) as count FROM users');
  return result ? result.count : 0;
}

function create(username, password) {
  const hash = bcrypt.hashSync(password, SALT_ROUNDS);
  const result = run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash]);
  return { id: result.lastInsertRowid, username };
}

function verifyPassword(username, password) {
  const user = findByUsername(username);
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password)) return null;
  return { id: user.id, username: user.username };
}

function updatePassword(id, newPassword) {
  const hash = bcrypt.hashSync(newPassword, SALT_ROUNDS);
  run('UPDATE users SET password = ? WHERE id = ?', [hash, id]);
}

function listAll() {
  return query('SELECT id, username, created_at FROM users');
}

function deleteById(id) {
  run('DELETE FROM users WHERE id = ?', [id]);
}

module.exports = {
  findByUsername,
  findById,
  count,
  create,
  verifyPassword,
  updatePassword,
  listAll,
  deleteById,
};
