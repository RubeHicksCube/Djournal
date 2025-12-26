const express = require('express');
const { createUser, validateUser, getUserById, getProfileFields, setProfileField } = require('../models/database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Get current user info
router.get('/me', authMiddleware, (req, res) => {
  const user = getUserById(req.user.id);
  const profileFields = getProfileFields(req.user.id);
  res.json({ 
    user: { 
      id: user.id, 
      username: user.username, 
      email: user.email, 
      is_admin: !!user.is_admin 
    },
    profileFields 
  });
});

// Update current user profile
router.put('/me', authMiddleware, (req, res) => {
  const { username, currentPassword, newPassword, email } = req.body;
  const userId = req.user.id;

  try {
    // If changing password, verify current password first
    if (newPassword && !currentPassword) {
      return res.status(400).json({ error: 'Current password required to change password' });
    }

    // If changing username or password, validate credentials
    if ((username && username !== req.user.username) || newPassword) {
      const currentUser = validateUser(req.user.username, currentPassword);
      if (!currentUser) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
    }

    // Check if new username is already taken
    if (username && username !== req.user.username) {
      const existingUser = require('../models/database').db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, userId);
      if (existingUser) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }

    // Update user in database
    const db = require('../models/database').db;
    const updates = [];
    const values = [];

    if (username && username !== req.user.username) {
      updates.push('username = ?');
      values.push(username);
    }

    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email);
    }

    if (newPassword) {
      const bcrypt = require('bcrypt');
      const passwordHash = bcrypt.hashSync(newPassword, 10);
      updates.push('password_hash = ?');
      values.push(passwordHash);
    }

    if (updates.length > 0) {
      values.push(userId);
      const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
      db.prepare(sql).run(...values);
    }

    // Get updated user info
    const updatedUser = db.prepare('SELECT id, username, email FROM users WHERE id = ?').get(userId);
    res.json({ success: true, user: updatedUser });

  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Update profile field
router.put('/profile-field', authMiddleware, (req, res) => {
  const { key, value } = req.body;
  const userId = req.user.id;

  if (!key || value === undefined) {
    return res.status(400).json({ error: 'Key and value required' });
  }

  try {
    setProfileField(userId, key, value);
    res.json({ success: true });
  } catch (error) {
    console.error('Profile field update error:', error);
    res.status(500).json({ error: 'Failed to update profile field' });
  }
});

// Delete profile field
router.delete('/profile-field/:key', authMiddleware, (req, res) => {
  const { key } = req.params;
  const userId = req.user.id;

  try {
    const db = require('../models/database').db;
    db.prepare('DELETE FROM user_profile_fields WHERE user_id = ? AND field_key = ?').run(userId, key);
    res.json({ success: true });
  } catch (error) {
    console.error('Profile field delete error:', error);
    res.status(500).json({ error: 'Failed to delete profile field' });
  }
});

// Create new user (admin only)
router.post('/create', authMiddleware, (req, res) => {
  const { username, password, email, is_admin = false } = req.body;
  
  // Only allow user creation by admin users
  if (!req.user.is_admin) {
    return res.status(403).json({ error: 'Unauthorized to create users' });
  }

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  if (username.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    const userId = createUser(username, password, email || null, is_admin);
    const newUser = require('../models/database').db.prepare('SELECT id, username, email, is_admin FROM users WHERE id = ?').get(userId);
    res.json({ success: true, user: newUser });
  } catch (error) {
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: 'Username already exists' });
    } else {
      console.error('User creation error:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  }
});

// Get all users (admin only)
router.get('/list', authMiddleware, (req, res) => {
  if (!req.user.is_admin) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    const db = require('../models/database').db;
    const users = db.prepare('SELECT id, username, email, created_at, is_admin FROM users ORDER BY created_at DESC').all();
    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

module.exports = router;