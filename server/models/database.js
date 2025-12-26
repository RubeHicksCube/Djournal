const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'ailife.db');

// Ensure data directory exists
if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

const db = new Database(DB_PATH);

// Initialize database tables
function initializeDatabase() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      email TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_admin BOOLEAN DEFAULT 0
    )
  `);

  // Activity data table (user-specific)
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      UNIQUE(user_id, date)
    )
  `);

  // User profile fields table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profile_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      field_key TEXT NOT NULL,
      field_value TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      UNIQUE(user_id, field_key)
    )
  `);

  // Create default admin user if not exists
  const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!existingAdmin) {
    const defaultPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const passwordHash = bcrypt.hashSync(defaultPassword, 10);
    db.prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)').run('admin', passwordHash, 1);
    console.log('Default admin user created with username: admin');
  }
}

// Auth functions
function createUser(username, password, email = null, isAdmin = false) {
  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.prepare('INSERT INTO users (username, password_hash, email, is_admin) VALUES (?, ?, ?, ?)').run(username, passwordHash, email, isAdmin ? 1 : 0);
  return result.lastInsertRowid;
}

function validateUser(identifier, password) {
  // Try username first, prioritizing admin users
  let user = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ? ORDER BY is_admin DESC, id ASC').get(identifier);
  
  // If not found, try email
  if (!user) {
    user = db.prepare('SELECT id, username, password_hash FROM users WHERE email = ? ORDER BY is_admin DESC, id ASC').get(identifier);
  }
  
  if (user && bcrypt.compareSync(password, user.password_hash)) {
    return { id: user.id, username: user.username };
  }
  return null;
}

function getUserById(userId) {
  return db.prepare('SELECT id, username, email, is_admin FROM users WHERE id = ?').get(userId);
}

// Data functions
function getDailyData(userId, date) {
  const result = db.prepare('SELECT data FROM daily_data WHERE user_id = ? AND date = ?').get(userId, date);
  return result ? JSON.parse(result.data) : null;
}

function setDailyData(userId, date, data) {
  const dataJson = JSON.stringify(data);
  const existing = db.prepare('SELECT id FROM daily_data WHERE user_id = ? AND date = ?').get(userId, date);
  
  if (existing) {
    db.prepare('UPDATE daily_data SET data = ? WHERE user_id = ? AND date = ?').run(dataJson, userId, date);
  } else {
    db.prepare('INSERT INTO daily_data (user_id, date, data) VALUES (?, ?, ?)').run(userId, date, dataJson);
  }
}

// Profile field functions
function getProfileFields(userId) {
  const fields = db.prepare('SELECT field_key, field_value FROM user_profile_fields WHERE user_id = ?').all(userId);
  const result = {};
  fields.forEach(field => {
    result[field.field_key] = field.field_value;
  });
  return result;
}

function setProfileField(userId, key, value) {
  const existing = db.prepare('SELECT id FROM user_profile_fields WHERE user_id = ? AND field_key = ?').get(userId, key);
  if (existing) {
    db.prepare('UPDATE user_profile_fields SET field_value = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND field_key = ?').run(value, userId, key);
  } else {
    db.prepare('INSERT INTO user_profile_fields (user_id, field_key, field_value) VALUES (?, ?, ?)').run(userId, key, value);
  }
}

module.exports = {
  db,
  initializeDatabase,
  createUser,
  validateUser,
  getUserById,
  getProfileFields,
  setProfileField,
  getDailyData,
  setDailyData
};