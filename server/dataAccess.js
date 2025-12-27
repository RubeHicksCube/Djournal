const { db } = require('./database');

// ============================================================================
// USER MANAGEMENT
// ============================================================================

function getAllUsers() {
  return db.prepare('SELECT id, username, email, is_admin, created_at FROM users').all();
}

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

function createUser(username, email, passwordHash, isAdmin = false) {
  const result = db.prepare(
    'INSERT INTO users (username, email, password_hash, is_admin) VALUES (?, ?, ?, ?)'
  ).run(username, email, passwordHash, isAdmin ? 1 : 0);
  return result.lastInsertRowid;
}

function updateUser(id, updates) {
  const fields = [];
  const values = [];

  if (updates.username !== undefined) {
    fields.push('username = ?');
    values.push(updates.username);
  }
  if (updates.email !== undefined) {
    fields.push('email = ?');
    values.push(updates.email);
  }
  if (updates.password_hash !== undefined) {
    fields.push('password_hash = ?');
    values.push(updates.password_hash);
  }

  if (fields.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

function deleteUser(id) {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

// ============================================================================
// PROFILE FIELDS
// ============================================================================

function getProfileFields(userId) {
  const rows = db.prepare('SELECT key, value FROM profile_fields WHERE user_id = ?').all(userId);
  const fields = {};
  rows.forEach(row => {
    fields[row.key] = row.value;
  });
  return fields;
}

function setProfileField(userId, key, value) {
  db.prepare(`
    INSERT INTO profile_fields (user_id, key, value)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value
  `).run(userId, key, value);
}

function deleteProfileField(userId, key) {
  db.prepare('DELETE FROM profile_fields WHERE user_id = ? AND key = ?').run(userId, key);
}

// ============================================================================
// CUSTOM FIELD TEMPLATES
// ============================================================================

function getCustomFieldTemplates(userId) {
  return db.prepare('SELECT id, key FROM custom_field_templates WHERE user_id = ?').all(userId);
}

function createCustomFieldTemplate(userId, key) {
  const result = db.prepare(
    'INSERT INTO custom_field_templates (user_id, key) VALUES (?, ?)'
  ).run(userId, key);
  return result.lastInsertRowid;
}

function deleteCustomFieldTemplate(userId, key) {
  db.prepare('DELETE FROM custom_field_templates WHERE user_id = ? AND key = ?').run(userId, key);
}

// ============================================================================
// TIME SINCE TRACKERS
// ============================================================================

function getTimeSinceTrackers(userId) {
  return db.prepare('SELECT id, name, date FROM time_since_trackers WHERE user_id = ?').all(userId);
}

function createTimeSinceTracker(userId, name, date) {
  const result = db.prepare(
    'INSERT INTO time_since_trackers (user_id, name, date) VALUES (?, ?, ?)'
  ).run(userId, name, date);
  return result.lastInsertRowid;
}

function deleteTimeSinceTracker(id) {
  db.prepare('DELETE FROM time_since_trackers WHERE id = ?').run(id);
}

// ============================================================================
// DURATION TRACKERS
// ============================================================================

function getDurationTrackers(userId) {
  return db.prepare(`
    SELECT id, name, type, is_running, start_time, elapsed_ms, value
    FROM duration_trackers WHERE user_id = ?
  `).all(userId).map(row => ({
    ...row,
    isRunning: Boolean(row.is_running),
    startTime: row.start_time,
    elapsedMs: row.elapsed_ms
  }));
}

function createDurationTracker(userId, name) {
  const result = db.prepare(
    'INSERT INTO duration_trackers (user_id, name, type) VALUES (?, ?, ?)'
  ).run(userId, name, 'timer');
  return result.lastInsertRowid;
}

function updateDurationTracker(id, updates) {
  const fields = [];
  const values = [];

  if (updates.isRunning !== undefined) {
    fields.push('is_running = ?');
    values.push(updates.isRunning ? 1 : 0);
  }
  if (updates.startTime !== undefined) {
    fields.push('start_time = ?');
    values.push(updates.startTime);
  }
  if (updates.elapsedMs !== undefined) {
    fields.push('elapsed_ms = ?');
    values.push(updates.elapsedMs);
  }
  if (updates.value !== undefined) {
    fields.push('value = ?');
    values.push(updates.value);
  }

  if (fields.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE duration_trackers SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

function deleteDurationTracker(id) {
  db.prepare('DELETE FROM duration_trackers WHERE id = ?').run(id);
}

// ============================================================================
// CUSTOM COUNTERS
// ============================================================================

function getCustomCounters(userId) {
  return db.prepare('SELECT id, name FROM custom_counters WHERE user_id = ?').all(userId);
}

function createCustomCounter(userId, name) {
  const result = db.prepare(
    'INSERT INTO custom_counters (user_id, name) VALUES (?, ?)'
  ).run(userId, name);
  return result.lastInsertRowid;
}

function deleteCustomCounter(id) {
  db.prepare('DELETE FROM custom_counters WHERE id = ?').run(id);
}

function getCustomCounterValue(counterId, date) {
  const row = db.prepare(
    'SELECT value FROM custom_counter_values WHERE counter_id = ? AND date = ?'
  ).get(counterId, date);
  return row ? row.value : 0;
}

function setCustomCounterValue(counterId, userId, date, value) {
  db.prepare(`
    INSERT INTO custom_counter_values (counter_id, user_id, date, value)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(counter_id, date) DO UPDATE SET value = excluded.value
  `).run(counterId, userId, date, value);
}

// ============================================================================
// DAILY STATE
// ============================================================================

function getDailyState(userId, date) {
  return db.prepare(
    'SELECT previous_bedtime, wake_time FROM daily_state WHERE user_id = ? AND date = ?'
  ).get(userId, date);
}

function setDailyState(userId, date, previousBedtime, wakeTime) {
  db.prepare(`
    INSERT INTO daily_state (user_id, date, previous_bedtime, wake_time, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, date) DO UPDATE SET
      previous_bedtime = excluded.previous_bedtime,
      wake_time = excluded.wake_time,
      updated_at = CURRENT_TIMESTAMP
  `).run(userId, date, previousBedtime, wakeTime);
}

// ============================================================================
// DAILY CUSTOM FIELDS
// ============================================================================

function getDailyCustomFields(userId, date) {
  return db.prepare(
    'SELECT id, key, value, is_template FROM daily_custom_fields WHERE user_id = ? AND date = ?'
  ).all(userId, date).map(row => ({
    id: row.id,
    key: row.key,
    value: row.value,
    isTemplate: Boolean(row.is_template)
  }));
}

function setDailyCustomField(userId, date, key, value, isTemplate = true) {
  db.prepare(`
    INSERT INTO daily_custom_fields (user_id, date, key, value, is_template)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, date, key) DO UPDATE SET value = excluded.value
  `).run(userId, date, key, value, isTemplate ? 1 : 0);
}

function deleteDailyCustomField(userId, date, key) {
  db.prepare('DELETE FROM daily_custom_fields WHERE user_id = ? AND date = ? AND key = ?')
    .run(userId, date, key);
}

function deleteDailyCustomFieldById(id) {
  db.prepare('DELETE FROM daily_custom_fields WHERE id = ?').run(id);
}

// ============================================================================
// DAILY TASKS
// ============================================================================

function getDailyTasks(userId, date) {
  return db.prepare('SELECT id, text, done FROM daily_tasks WHERE user_id = ? AND date = ?')
    .all(userId, date).map(row => ({
      id: row.id,
      text: row.text,
      done: Boolean(row.done)
    }));
}

function createDailyTask(userId, date, text) {
  const result = db.prepare(
    'INSERT INTO daily_tasks (user_id, date, text) VALUES (?, ?, ?)'
  ).run(userId, date, text);
  return result.lastInsertRowid;
}

function toggleDailyTask(id) {
  db.prepare('UPDATE daily_tasks SET done = NOT done WHERE id = ?').run(id);
}

function deleteDailyTask(id) {
  db.prepare('DELETE FROM daily_tasks WHERE id = ?').run(id);
}

// ============================================================================
// ACTIVITY ENTRIES
// ============================================================================

function getActivityEntries(userId, date) {
  return db.prepare('SELECT id, text, timestamp FROM activity_entries WHERE user_id = ? AND date = ?')
    .all(userId, date);
}

function createActivityEntry(userId, date, text) {
  const result = db.prepare(
    'INSERT INTO activity_entries (user_id, date, text) VALUES (?, ?, ?)'
  ).run(userId, date, text);
  return result.lastInsertRowid;
}

function deleteActivityEntry(id) {
  db.prepare('DELETE FROM activity_entries WHERE id = ?').run(id);
}

// ============================================================================
// SNAPSHOT SETTINGS
// ============================================================================

function getSnapshotSettings(userId) {
  const row = db.prepare('SELECT max_days, max_count FROM snapshot_settings WHERE user_id = ?').get(userId);
  return row || { max_days: 30, max_count: 100 };
}

function setSnapshotSettings(userId, maxDays, maxCount) {
  db.prepare(`
    INSERT INTO snapshot_settings (user_id, max_days, max_count)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET max_days = excluded.max_days, max_count = excluded.max_count
  `).run(userId, maxDays, maxCount);
}

module.exports = {
  // Users
  getAllUsers,
  getUserById,
  getUserByUsername,
  getUserByEmail,
  createUser,
  updateUser,
  deleteUser,

  // Profile fields
  getProfileFields,
  setProfileField,
  deleteProfileField,

  // Custom field templates
  getCustomFieldTemplates,
  createCustomFieldTemplate,
  deleteCustomFieldTemplate,

  // Time since trackers
  getTimeSinceTrackers,
  createTimeSinceTracker,
  deleteTimeSinceTracker,

  // Duration trackers
  getDurationTrackers,
  createDurationTracker,
  updateDurationTracker,
  deleteDurationTracker,

  // Custom counters
  getCustomCounters,
  createCustomCounter,
  deleteCustomCounter,
  getCustomCounterValue,
  setCustomCounterValue,

  // Daily state
  getDailyState,
  setDailyState,

  // Daily custom fields
  getDailyCustomFields,
  setDailyCustomField,
  deleteDailyCustomField,
  deleteDailyCustomFieldById,

  // Daily tasks
  getDailyTasks,
  createDailyTask,
  toggleDailyTask,
  deleteDailyTask,

  // Activity entries
  getActivityEntries,
  createActivityEntry,
  deleteActivityEntry,

  // Snapshot settings
  getSnapshotSettings,
  setSnapshotSettings
};
