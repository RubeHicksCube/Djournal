const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const PDFDocument = require('pdfkit');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8001;

// Import database and data access functions
const { db } = require('./database');
const dataAccess = require('./dataAccess');
const { initializeDefaultAdmin } = require('./initData');

// Import proper auth middleware
const { generateToken, authMiddleware } = require('./middleware/auth');

app.use(cors());
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// Helper function to get or initialize user state from database
function getUserState(userId) {
  const currentDate = new Date().toISOString().slice(0, 10);

  // Get daily state (bedtime, wake time)
  const dailyState = dataAccess.getDailyState(userId, currentDate) || {
    previous_bedtime: '',
    wake_time: ''
  };

  // Get templates
  const templates = dataAccess.getCustomFieldTemplates(userId);

  // Get daily custom field values (template-based)
  const dailyFieldsFromDB = dataAccess.getDailyCustomFields(userId, currentDate);

  // Separate template-based and daily-only fields
  const templateFields = dailyFieldsFromDB.filter(f => f.isTemplate);
  const dailyOnlyFields = dailyFieldsFromDB.filter(f => !f.isTemplate);

  // Merge templates with values
  const customFields = templates.map(template => {
    const valueField = templateFields.find(f => f.key === template.key);
    return {
      id: template.id,
      key: template.key,
      value: valueField ? valueField.value : ''
    };
  });

  // Get tasks
  const tasksFromDB = dataAccess.getDailyTasks(userId, currentDate);
  const dailyTasks = tasksFromDB.map(t => ({
    id: t.id,
    text: t.text,
    completed: t.done
  }));

  // Get activity entries
  const entriesFromDB = dataAccess.getActivityEntries(userId, currentDate);
  const entries = entriesFromDB.map(e => ({
    id: e.id,
    timestamp: new Date(e.timestamp).toLocaleTimeString('en-US', { hour12: false }),
    text: e.text,
    image: null // Images not yet implemented in database
  }));

  // Get time since trackers (persistent)
  const timeSinceTrackers = dataAccess.getTimeSinceTrackers(userId);

  // Get duration trackers (persistent)
  const durationTrackers = dataAccess.getDurationTrackers(userId);

  // Get custom counters
  const customCountersFromDB = dataAccess.getCustomCounters(userId);
  const customCounters = customCountersFromDB.map(counter => ({
    id: counter.id,
    name: counter.name,
    value: dataAccess.getCustomCounterValue(counter.id, currentDate)
  }));

  return {
    date: currentDate,
    previousBedtime: dailyState.previous_bedtime || '',
    wakeTime: dailyState.wake_time || '',
    customFields: customFields,
    dailyCustomFields: dailyOnlyFields.map(f => ({
      id: f.id,
      key: f.key,
      value: f.value
    })),
    dailyTasks: dailyTasks,
    customCounters: customCounters,
    entries: entries,
    timeSinceTrackers: timeSinceTrackers,
    durationTrackers: durationTrackers
  };
}

// Helper function to generate YAML frontmatter and markdown content
function generateMarkdownWithYAML(dayData, username = null, userProfileFields = null) {
  let yaml = '---\n';

  // User Information (at the top)
  if (username) {
    yaml += `# User Information\n`;
    yaml += `user: "${username}"\n`;
  }
  yaml += `date: "${dayData.date}"\n`;
  yaml += '\n';

  // Profile Fields (right after user info)
  if (userProfileFields && Object.keys(userProfileFields).length > 0) {
    yaml += '# Profile Fields\n';
    yaml += 'profile:\n';
    Object.entries(userProfileFields).forEach(([key, value]) => {
      yaml += `  ${key}: "${String(value).replace(/"/g, '\\"')}"\n`;
    });
    yaml += '\n';
  }

  // Sleep Metrics
  if (dayData.previousBedtime || dayData.wakeTime) {
    yaml += '# Sleep Metrics\n';
    if (dayData.previousBedtime) {
      yaml += `bedtime: "${dayData.previousBedtime}"\n`;
    }
    if (dayData.wakeTime) {
      yaml += `wake_time: "${dayData.wakeTime}"\n`;
    }
    yaml += '\n';
  }

  // Time Since Trackers (persist across days)
  if (dayData.timeSinceTrackers && dayData.timeSinceTrackers.length > 0) {
    yaml += '# Time Since Trackers (persist across days)\n';
    yaml += 'time_since_trackers:\n';
    dayData.timeSinceTrackers.forEach(t => {
      yaml += `  - name: "${t.name.replace(/"/g, '\\"')}"\n`;
      yaml += `    date: "${t.date}"\n`;
      yaml += `    time_since: "${calculateTimeSince(t.date)}"\n`;
    });
    yaml += '\n';
  }

  // Duration Trackers (persist across days)
  if (dayData.durationTrackers && dayData.durationTrackers.length > 0) {
    yaml += '# Duration Trackers (persist across days)\n';
    yaml += 'duration_trackers:\n';
    dayData.durationTrackers.forEach(t => {
      yaml += `  - name: "${t.name.replace(/"/g, '\\"')}"\n`;
      yaml += `    type: "${t.type}"\n`;
      yaml += `    value: ${t.value}\n`;

      // Add formatted value for better readability
      if (t.type === 'timer') {
        yaml += `    formatted: "${formatDuration(t.value)}"\n`;

        // If timer is running, show current elapsed time
        if (t.isRunning && t.startTime) {
          yaml += `    is_running: true\n`;
          const currentElapsed = getCurrentElapsedTime(t);
          yaml += `    current_time: "${formatDuration(currentElapsed)}"\n`;
        } else {
          yaml += `    is_running: false\n`;
        }
      } else if (t.type === 'counter') {
        yaml += `    formatted: "${t.value} minutes"\n`;
      }
    });
    yaml += '\n';
  }

  // Custom Counters (persist but values reset daily)
  if (dayData.customCounters && dayData.customCounters.length > 0) {
    yaml += '# Custom Counters (persist but values reset daily)\n';
    yaml += 'custom_counters:\n';
    dayData.customCounters.forEach(c => {
      yaml += `  - name: "${c.name}"\n`;
      yaml += `    value: ${c.value}\n`;
    });
    yaml += '\n';
  }

  // Template Fields (persist template, values reset daily)
  if (dayData.customFields && dayData.customFields.length > 0) {
    yaml += '# Template Fields (persist template, values reset daily)\n';
    yaml += 'template_fields:\n';
    dayData.customFields.forEach(f => {
      if (f.value) {
        yaml += `  ${f.key}: "${f.value.replace(/"/g, '\\"')}"\n`;
      }
    });
    yaml += '\n';
  }

  // Daily Fields (do not persist)
  if (dayData.dailyCustomFields && dayData.dailyCustomFields.length > 0) {
    yaml += '# Daily Fields (do not persist)\n';
    yaml += 'daily_fields:\n';
    dayData.dailyCustomFields.forEach(f => {
      if (f.value) {
        yaml += `  ${f.key}: "${f.value.replace(/"/g, '\\"')}"\n`;
      }
    });
    yaml += '\n';
  }

  // Daily Tasks
  if (dayData.dailyTasks && dayData.dailyTasks.length > 0) {
    yaml += '# Daily Tasks\n';
    yaml += 'tasks:\n';
    dayData.dailyTasks.forEach(t => {
      yaml += `  - text: "${t.text.replace(/"/g, '\\"')}"\n`;
      yaml += `    completed: ${t.completed}\n`;
    });
    yaml += '\n';
  }

  yaml += '---\n\n';

  // Markdown content - Activity Entries
  let content = '# Activity Entries\n\n';
  if (dayData.entries && dayData.entries.length > 0) {
    dayData.entries.forEach(e => {
      content += `## ${e.timestamp}\n\n${e.text}\n\n`;

      // Include base64 embedded image if present
      if (e.image) {
        content += `![Entry Image](${e.image})\n\n`;
      }
    });
  } else {
    content += '_No entries today._\n';
  }

  return yaml + content;
}

// Helper function to calculate time since for exports (server-side)
function calculateTimeSince(dateStr) {
  const then = new Date(dateStr);
  const now = new Date();
  let diffMinutes = Math.floor((now - then) / (1000 * 60));

  const years = Math.floor(diffMinutes / (365.25 * 24 * 60));
  diffMinutes -= Math.floor(years * 365.25 * 24 * 60);

  const months = Math.floor(diffMinutes / (30.44 * 24 * 60));
  diffMinutes -= Math.floor(months * 30.44 * 24 * 60);

  const weeks = Math.floor(diffMinutes / (7 * 24 * 60));
  diffMinutes -= weeks * 7 * 24 * 60;

  const days = Math.floor(diffMinutes / (24 * 60));
  diffMinutes -= days * 24 * 60;

  const hours = Math.floor(diffMinutes / 60);
  diffMinutes -= hours * 60;

  const minutes = diffMinutes;

  const parts = [];
  if (years > 0) parts.push(`${years}y`);
  if (months > 0) parts.push(`${months}mo`);
  if (weeks > 0) parts.push(`${weeks}w`);
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return parts.join(' ');
}

// Helper function to format duration for PDF and exports
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

// Get current elapsed time for running timer
function getCurrentElapsedTime(tracker) {
  if (tracker.type !== 'timer') return tracker.value;

  let totalSeconds = tracker.value || 0;

  if (tracker.isRunning && tracker.startTime) {
    const elapsed = Math.floor((Date.now() - tracker.startTime) / 1000);
    totalSeconds += elapsed;
  }

  return totalSeconds;
}

// Helper function to format date for PDF
function formatDate(dateStr) {
  const date = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${date.getFullYear()}-${months[date.getMonth()]}-${String(date.getDate()).padStart(2, '0')}`;
}

// Helper function to generate PDF report using PDFKit
async function generatePDFReport(dayData, username = null, userProfileFields = null) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    // Header with purple background
    doc.rect(0, 0, doc.page.width, 100).fillAndStroke('#6B46C1', '#6B46C1');
    doc.fillColor('#FFFFFF')
       .fontSize(24)
       .text('DAILY JOURNAL REPORT', 50, 30, { align: 'center' });
    doc.fontSize(14)
       .text(formatDate(dayData.date), 50, 60, { align: 'center' });

    // Move cursor down after header
    doc.fillColor('#000000');
    doc.y = 120;
    doc.moveDown(1);

    // User Information Section
    if (username) {
      doc.fontSize(16).fillColor('#6B46C1').text('USER INFORMATION', { underline: true });
      doc.fontSize(12).fillColor('#000000').text(`Username: ${username}`);
      doc.moveDown();
    }

    // Profile Fields Section
    if (userProfileFields && Object.keys(userProfileFields).length > 0) {
      doc.fontSize(16).fillColor('#6B46C1').text('PROFILE', { underline: true });
      for (const [key, value] of Object.entries(userProfileFields)) {
        const capitalizedKey = key.charAt(0).toUpperCase() + key.slice(1);
        doc.fontSize(12).fillColor('#000000').text(`${capitalizedKey}: ${value}`);
      }
      doc.moveDown();
    }

    // Sleep Metrics
    if (dayData.previousBedtime || dayData.wakeTime) {
      doc.fontSize(16).fillColor('#6B46C1').text('SLEEP METRICS', { underline: true });
      if (dayData.previousBedtime) doc.fontSize(12).fillColor('#000000').text(`Bedtime: ${dayData.previousBedtime}`);
      if (dayData.wakeTime) doc.fontSize(12).fillColor('#000000').text(`Wake Time: ${dayData.wakeTime}`);
      doc.moveDown();
    }

    // Time Since Trackers
    if (dayData.timeSinceTrackers && dayData.timeSinceTrackers.length > 0) {
      doc.fontSize(16).fillColor('#6B46C1').text('TIME SINCE TRACKERS', { underline: true });
      dayData.timeSinceTrackers.forEach(t => {
        const timeSince = calculateTimeSince(t.date);
        doc.fontSize(12).fillColor('#000000').text(`• ${t.name}: ${formatDate(t.date)} (${timeSince})`);
      });
      doc.moveDown();
    }

    // Duration Trackers
    if (dayData.durationTrackers && dayData.durationTrackers.length > 0) {
      doc.fontSize(16).fillColor('#6B46C1').text('DURATION TRACKERS', { underline: true });
      dayData.durationTrackers.forEach(t => {
        if (t.type === 'timer') {
          const storedValue = formatDuration(t.value);
          if (t.isRunning && t.startTime) {
            const currentElapsed = getCurrentElapsedTime(t);
            const currentValue = formatDuration(currentElapsed);
            doc.fontSize(12).fillColor('#000000').text(`• ${t.name} (timer): ${currentValue} [RUNNING - stored: ${storedValue}]`);
          } else {
            doc.fontSize(12).fillColor('#000000').text(`• ${t.name} (timer): ${storedValue}`);
          }
        } else {
          doc.fontSize(12).fillColor('#000000').text(`• ${t.name} (${t.type}): ${t.value} minutes`);
        }
      });
      doc.moveDown();
    }

    // Custom Counters
    if (dayData.customCounters && dayData.customCounters.length > 0) {
      doc.fontSize(16).fillColor('#6B46C1').text('CUSTOM COUNTERS', { underline: true });
      dayData.customCounters.forEach(c => {
        doc.fontSize(12).fillColor('#000000').text(`• ${c.name}: ${c.value}`);
      });
      doc.moveDown();
    }

    // Template Fields
    if (dayData.customFields && dayData.customFields.length > 0) {
      const filledFields = dayData.customFields.filter(f => f.value);
      if (filledFields.length > 0) {
        doc.fontSize(16).fillColor('#6B46C1').text('TEMPLATE FIELDS', { underline: true });
        filledFields.forEach(f => {
          const capitalizedKey = f.key.charAt(0).toUpperCase() + f.key.slice(1);
          doc.fontSize(12).fillColor('#000000').text(`• ${capitalizedKey}: ${f.value}`);
        });
        doc.moveDown();
      }
    }

    // Daily Custom Fields
    if (dayData.dailyCustomFields && dayData.dailyCustomFields.length > 0) {
      const filledFields = dayData.dailyCustomFields.filter(f => f.value);
      if (filledFields.length > 0) {
        doc.fontSize(16).fillColor('#6B46C1').text('DAILY FIELDS', { underline: true });
        filledFields.forEach(f => {
          const capitalizedKey = f.key.charAt(0).toUpperCase() + f.key.slice(1);
          doc.fontSize(12).fillColor('#000000').text(`• ${capitalizedKey}: ${f.value}`);
        });
        doc.moveDown();
      }
    }

    // Daily Tasks
    if (dayData.dailyTasks && dayData.dailyTasks.length > 0) {
      doc.fontSize(16).fillColor('#6B46C1').text('DAILY TASKS', { underline: true });
      dayData.dailyTasks.forEach(t => {
        const check = t.completed ? '✓' : '○';
        doc.fontSize(12).fillColor('#000000').text(`${check} ${t.text}`);
      });
      doc.moveDown();
    }

    // Activity Entries
    if (dayData.entries && dayData.entries.length > 0) {
      doc.fontSize(16).fillColor('#6B46C1').text('ACTIVITY ENTRIES', { underline: true });
      dayData.entries.forEach(e => {
        // Check if we need a new page
        if (doc.y > doc.page.height - 150) {
          doc.addPage();
        }

        doc.strokeColor('#CCCCCC').moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke();
        doc.moveDown(0.5);
        doc.fontSize(11).fillColor('#6B46C1').text(e.timestamp, { continued: false });
        doc.fontSize(12).fillColor('#000000').text(e.text, { align: 'left' });

        // Handle images (base64 embedded images)
        if (e.image) {
          try {
            // Extract base64 data
            const base64Data = e.image.split(',')[1] || e.image;
            const imageBuffer = Buffer.from(base64Data, 'base64');

            // Check if we need a new page for the image
            if (doc.y > doc.page.height - 250) {
              doc.addPage();
            }

            doc.moveDown(0.5);
            doc.image(imageBuffer, 50, doc.y, { width: 400, fit: [400, 300] });
            doc.moveDown(10); // Move down to account for image height
          } catch (imageError) {
            console.error('Error embedding image in PDF:', imageError);
            doc.fontSize(10).fillColor('#999999').text('[Image could not be embedded]');
          }
        }

        doc.moveDown();
      });
    } else {
      doc.fontSize(16).fillColor('#6B46C1').text('ACTIVITY ENTRIES', { underline: true });
      doc.fontSize(12).fillColor('#999999').text('No entries today', { italic: true });
      doc.moveDown();
    }

    doc.end();
  });
}

// Login endpoint
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  // Find user by username or email
  let user = dataAccess.getUserByUsername(username);
  if (!user) {
    user = dataAccess.getUserByEmail(username);
  }

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Verify password using bcrypt
  const passwordValid = bcrypt.compareSync(password, user.password_hash);

  if (!passwordValid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateToken(user);
  res.json({
    success: true,
    token,
    user: { id: user.id, username: user.username, is_admin: user.is_admin }
  });
});

// Get current user
app.get('/api/users/me', authMiddleware, (req, res) => {
  // Look up full user details from database
  const user = dataAccess.getUserById(req.user.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Get user's profile fields from database
  const userProfileFields = dataAccess.getProfileFields(req.user.id);

  res.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email || null,
      is_admin: user.is_admin
    },
    profileFields: userProfileFields
  });
});

// Profile field management
app.put('/api/users/profile-field', authMiddleware, (req, res) => {
  const { key, value } = req.body;

  if (!key || value === undefined) {
    return res.status(400).json({ error: 'Key and value required' });
  }

  // Save the profile field to database
  dataAccess.setProfileField(req.user.id, key, value);

  console.log(`Setting profile field for user ${req.user.id}: ${key} = ${value}`);
  res.json({ success: true });
});

app.delete('/api/users/profile-field/:key', authMiddleware, (req, res) => {
  const { key } = req.params;

  // Remove the profile field from database
  dataAccess.deleteProfileField(req.user.id, key);

  console.log(`Deleting profile field for user ${req.user.id}: ${key}`);
  res.json({ success: true });
});

// Update user profile
app.put('/api/users/me', authMiddleware, (req, res) => {
  const { username, email, currentPassword, newPassword } = req.body;

  // Find user in database
  const user = dataAccess.getUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Prepare updates
  const updates = {};
  if (username) updates.username = username;
  if (email !== undefined) updates.email = email;

  // Update in database
  dataAccess.updateUser(req.user.id, updates);

  console.log(`Updated profile for user ${req.user.id}:`, { username, email });

  // Fetch updated user
  const updatedUser = dataAccess.getUserById(req.user.id);
  res.json({
    success: true,
    user: {
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email
    }
  });
});

// Get all users (admin only)
app.get('/api/users/list', authMiddleware, (req, res) => {
  // Check if user is admin
  console.log('GET /api/users/list - req.user:', req.user);
  if (!req.user || !req.user.is_admin) {
    console.log('403 Forbidden - is_admin:', req.user?.is_admin);
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const userList = dataAccess.getAllUsers();

  res.json({ users: userList });
});

// Create new user (admin only)
app.post('/api/users/create', authMiddleware, (req, res) => {
  const { username, password, email, is_admin } = req.body;

  // Check if user is admin
  if (!req.user || !req.user.is_admin) {
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

  // Check if username already exists
  if (dataAccess.getUserByUsername(username)) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  // Hash the password
  const password_hash = bcrypt.hashSync(password, 10);

  // Create new user in database
  const newUserId = dataAccess.createUser(username, email || null, password_hash, !!is_admin);
  const newUser = dataAccess.getUserById(newUserId);

  console.log(`Created new user:`, { id: newUser.id, username: newUser.username });
  res.json({
    success: true,
    user: {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      is_admin: newUser.is_admin,
      created_at: newUser.created_at
    }
  });
});

// Reset user password (admin only)
app.put('/api/users/:id/reset-password', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  // Check if user is admin
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  // Find target user
  const targetUser = dataAccess.getUserById(parseInt(id));
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Hash new password and update
  const password_hash = bcrypt.hashSync(newPassword, 10);
  dataAccess.updateUser(parseInt(id), { password_hash });

  console.log(`Admin reset password for user: ${targetUser.username}`);
  res.json({ success: true, message: 'Password reset successfully' });
});

// Update user (admin only)
app.put('/api/users/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { username, email, is_admin } = req.body;

  // Check if user is admin
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  // Find target user
  const targetUser = dataAccess.getUserById(parseInt(id));
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Check if new username is already taken
  if (username && username !== targetUser.username) {
    const existingUser = dataAccess.getUserByUsername(username);
    if (existingUser && existingUser.id !== parseInt(id)) {
      return res.status(400).json({ error: 'Username already taken' });
    }
  }

  // Prepare updates
  const updates = {};
  if (username && username !== targetUser.username) {
    updates.username = username;
  }
  if (email !== undefined) {
    updates.email = email || null;
  }
  if (is_admin !== undefined) {
    updates.is_admin = is_admin ? 1 : 0;
  }

  // Update in database
  dataAccess.updateUser(parseInt(id), updates);

  // Fetch updated user
  const updatedUser = dataAccess.getUserById(parseInt(id));
  console.log(`Admin updated user:`, { id: updatedUser.id, username: updatedUser.username, email: updatedUser.email, is_admin: updatedUser.is_admin });
  res.json({
    success: true,
    user: {
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      is_admin: updatedUser.is_admin
    }
  });
});

// Delete user (admin only)
app.delete('/api/users/:id', authMiddleware, (req, res) => {
  const { id } = req.params;

  // Check if user is admin
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const userId = parseInt(id);

  // Prevent deleting yourself
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  // Find user
  const targetUser = dataAccess.getUserById(userId);
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  const deletedUsername = targetUser.username;
  dataAccess.deleteUser(userId);

  console.log(`Admin deleted user: ${deletedUsername}`);
  res.json({ success: true, message: 'User deleted successfully' });
});

// Get current state (Home page data)
app.get('/api/state', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const state = getUserState(userId);
  res.json(state);
});

// Update daily data
app.post('/api/daily', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const data = req.body;
  console.log('Updating daily data:', data);

  const currentDate = new Date().toISOString().slice(0, 10);

  // Update daily state in database
  const previousBedtime = data.previousBedtime !== undefined ? data.previousBedtime : '';
  const wakeTime = data.wakeTime !== undefined ? data.wakeTime : '';

  dataAccess.setDailyState(userId, currentDate, previousBedtime, wakeTime);

  const state = getUserState(userId);
  res.json(state);
});

// Add entry
app.post('/api/entry', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { text, image } = req.body;
  console.log('Adding entry:', text, image ? '(with image)' : '');

  // Validate image size if present (20MB limit)
  if (image) {
    // Base64 encoding adds ~33% overhead, so actual limit is ~15MB of base64
    const sizeInBytes = (image.length * 3) / 4;
    const maxSize = 20 * 1024 * 1024; // 20MB
    if (sizeInBytes > maxSize) {
      return res.status(400).json({ error: 'Image size exceeds 20MB limit' });
    }
  }

  const currentDate = new Date().toISOString().slice(0, 10);

  // Create entry in database
  dataAccess.createActivityEntry(userId, currentDate, text);

  const state = getUserState(userId);
  res.json(state);
});

// Download markdown (current day)
app.get('/api/download', (req, res) => {
  const token = req.query.token;

  // Verify token from query parameter (for direct navigation)
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const userId = decoded.id;

  // Get user info and profile fields from database
  const user = dataAccess.getUserById(userId);
  const username = user ? user.username : null;
  const userProfileFields = dataAccess.getProfileFields(userId);

  const state = getUserState(userId);
  const markdown = generateMarkdownWithYAML(state, username, userProfileFields);

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${state.date}.md"`);
  res.send(markdown);
});

// Download PDF (current day)
app.get('/api/download-pdf', async (req, res) => {
  const token = req.query.token;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const userId = decoded.id;

  try {
    const user = dataAccess.getUserById(userId);
    const username = user ? user.username : null;
    const userProfileFields = dataAccess.getProfileFields(userId);

    const state = getUserState(userId);
    const pdfBuffer = await generatePDFReport(state, username, userProfileFields);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${state.date}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
  }
});

// Save daily snapshot (placeholder - will implement with historical data later)
app.post('/api/exports/save-snapshot', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const currentDate = new Date().toISOString().slice(0, 10);

  console.log(`Snapshot save requested for user ${userId} on ${currentDate}`);
  res.json({ success: true, date: currentDate });
});

// Get available export dates for current user (placeholder)
app.get('/api/exports/available-dates', authMiddleware, (req, res) => {
  const userId = req.user.id;

  // TODO: Implement historical data retrieval from database
  const dates = [];

  res.json({ dates });
});

// Delete a specific snapshot (placeholder)
app.delete('/api/exports/snapshot/:date', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { date } = req.params;

  console.log(`Snapshot deletion requested for user ${userId}, date ${date}`);
  res.json({ success: true, dates: [] });
});

// Get snapshot retention settings
app.get('/api/exports/retention-settings', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const settings = dataAccess.getSnapshotSettings(userId);
  res.json({ maxDays: settings.max_days, maxCount: settings.max_count });
});

// Update snapshot retention settings
app.put('/api/exports/retention-settings', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { maxDays, maxCount } = req.body;

  const parsedMaxDays = maxDays !== undefined ? parseInt(maxDays) : 30;
  const parsedMaxCount = maxCount !== undefined ? parseInt(maxCount) : 100;

  dataAccess.setSnapshotSettings(userId, parsedMaxDays, parsedMaxCount);

  // TODO: Run cleanup with new settings when historical data is implemented

  res.json({
    success: true,
    settings: { maxDays: parsedMaxDays, maxCount: parsedMaxCount },
    dates: []
  });
});

// Export date range (placeholder)
app.post('/api/exports/date-range', authMiddleware, (req, res) => {
  const { startDate, endDate } = req.body;
  const userId = req.user.id;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Start date and end date required' });
  }

  // TODO: Implement historical data retrieval from database
  const exportData = [];

  res.json({ dates: exportData });
});

// Download markdown for date range (placeholder)
app.post('/api/exports/download-range', (req, res) => {
  const { startDate, endDate, token } = req.body;

  // Verify token from body (form submissions can't set headers)
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const userId = decoded.id;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Start date and end date required' });
  }

  // TODO: Implement historical data retrieval
  res.status(404).json({ error: 'No data available for this date range' });
});

// Download PDF for date range (placeholder)
app.post('/api/exports/download-range-pdf', async (req, res) => {
  const { startDate, endDate, token } = req.body;

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const userId = decoded.id;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Start date and end date required' });
  }

  // TODO: Implement historical data retrieval
  res.status(404).json({ error: 'No data available for this date range' });
});

// Tracker endpoints
app.post('/api/trackers/time-since', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { name, date } = req.body;

  // Create tracker in database
  dataAccess.createTimeSinceTracker(userId, name, date);

  const state = getUserState(userId);
  res.json(state);
});

app.delete('/api/trackers/time-since/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);

  // Delete from database
  dataAccess.deleteTimeSinceTracker(id);

  const state = getUserState(userId);
  res.json(state);
});

app.post('/api/trackers/duration', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { name } = req.body;

  // Create tracker in database
  dataAccess.createDurationTracker(userId, name);

  const state = getUserState(userId);
  res.json(state);
});

app.delete('/api/trackers/duration/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);

  // Delete from database
  dataAccess.deleteDurationTracker(id);

  const state = getUserState(userId);
  res.json(state);
});

// Set manual time for timer
app.post('/api/trackers/manual-time', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { trackerId, startTime, elapsedMs } = req.body;

  // Update tracker in database
  dataAccess.updateDurationTracker(parseInt(trackerId), {
    startTime: startTime,
    elapsedMs: elapsedMs,
    isRunning: false
  });

  console.log(`Set manual time for tracker ${trackerId}: ${elapsedMs}ms`);

  const state = getUserState(userId);
  res.json(state);
});

app.post('/api/trackers/timer/start/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);

  // Update tracker in database
  dataAccess.updateDurationTracker(id, {
    isRunning: true,
    startTime: Date.now()
  });

  const state = getUserState(userId);
  res.json(state);
});

app.post('/api/trackers/timer/stop/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);

  // Get current tracker state
  const trackers = dataAccess.getDurationTrackers(userId);
  const tracker = trackers.find(t => t.id === id);

  if (tracker && tracker.type === 'timer' && tracker.isRunning) {
    const elapsed = Date.now() - tracker.startTime;
    const newElapsedMs = tracker.elapsedMs + elapsed;
    const newValue = Math.floor(newElapsedMs / 1000);

    dataAccess.updateDurationTracker(id, {
      elapsedMs: newElapsedMs,
      value: newValue,
      isRunning: false,
      startTime: null
    });
  }

  const state = getUserState(userId);
  res.json(state);
});

app.post('/api/trackers/timer/reset/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);

  // Reset tracker in database
  dataAccess.updateDurationTracker(id, {
    value: 0,
    isRunning: false,
    startTime: null,
    elapsedMs: 0
  });

  const state = getUserState(userId);
  res.json(state);
});

// Custom Counters (water, coffee, calories, etc.)
app.post('/api/custom-counters/create', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Counter name is required' });
  }

  // Create counter in database
  dataAccess.createCustomCounter(userId, name);

  const state = getUserState(userId);
  res.json(state);
});

app.post('/api/custom-counters/:id/increment', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);
  const currentDate = new Date().toISOString().slice(0, 10);

  // Get current value and increment
  const currentValue = dataAccess.getCustomCounterValue(id, currentDate);
  dataAccess.setCustomCounterValue(id, userId, currentDate, currentValue + 1);

  const state = getUserState(userId);
  res.json(state);
});

app.post('/api/custom-counters/:id/decrement', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);
  const currentDate = new Date().toISOString().slice(0, 10);

  // Get current value and decrement (don't go below 0)
  const currentValue = dataAccess.getCustomCounterValue(id, currentDate);
  if (currentValue > 0) {
    dataAccess.setCustomCounterValue(id, userId, currentDate, currentValue - 1);
  }

  const state = getUserState(userId);
  res.json(state);
});

app.put('/api/custom-counters/:id/set', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);
  const { value } = req.body;
  const currentDate = new Date().toISOString().slice(0, 10);

  if (typeof value === 'number' && value >= 0) {
    dataAccess.setCustomCounterValue(id, userId, currentDate, value);
  }

  const state = getUserState(userId);
  res.json(state);
});

app.delete('/api/custom-counters/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);

  // Delete from database
  dataAccess.deleteCustomCounter(id);

  const state = getUserState(userId);
  res.json(state);
});

// Daily Custom Fields (non-persistent, don't carry over to new dates)
app.post('/api/daily-custom-fields', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { key, value } = req.body;

  if (!key) {
    return res.status(400).json({ error: 'Field key is required' });
  }

  const currentDate = new Date().toISOString().slice(0, 10);

  // Set daily custom field in database (isTemplate = false)
  dataAccess.setDailyCustomField(userId, currentDate, key, value || '', false);

  const state = getUserState(userId);
  res.json(state);
});

app.delete('/api/daily-custom-fields/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);

  // Delete from database
  dataAccess.deleteDailyCustomFieldById(id);

  const state = getUserState(userId);
  res.json(state);
});

// Daily Tasks
app.post('/api/daily-tasks', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Task text is required' });
  }

  const currentDate = new Date().toISOString().slice(0, 10);

  // Create task in database
  dataAccess.createDailyTask(userId, currentDate, text);

  const state = getUserState(userId);
  res.json(state);
});

app.put('/api/daily-tasks/:id/toggle', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);

  // Toggle task in database
  dataAccess.toggleDailyTask(id);

  const state = getUserState(userId);
  res.json(state);
});

app.delete('/api/daily-tasks/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);

  // Delete from database
  dataAccess.deleteDailyTask(id);

  const state = getUserState(userId);
  res.json(state);
});

// Template Custom Fields (persist name, reset value daily)
app.post('/api/custom-field-templates/create', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { key } = req.body;

  if (!key) {
    return res.status(400).json({ error: 'Field key is required' });
  }

  // Check if template already exists for this user
  const existingTemplates = dataAccess.getCustomFieldTemplates(userId);
  if (existingTemplates.find(t => t.key === key)) {
    return res.status(400).json({ error: 'Template already exists' });
  }

  // Create template in database
  const templateId = dataAccess.createCustomFieldTemplate(userId, key);

  // Add to current day's custom fields with empty value
  const currentDate = new Date().toISOString().slice(0, 10);
  dataAccess.setDailyCustomField(userId, currentDate, key, '', true);

  const templates = dataAccess.getCustomFieldTemplates(userId);
  const state = getUserState(userId);
  res.json({ templates, state });
});

app.get('/api/custom-field-templates', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const templates = dataAccess.getCustomFieldTemplates(userId);
  res.json({ templates });
});

app.delete('/api/custom-field-templates/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);

  const state = getUserState(userId);

  // Find the custom field by its ID to get the key
  const customField = state.customFields.find(f => f.id === id);

  if (customField) {
    const key = customField.key;

    // Remove template from database
    dataAccess.deleteCustomFieldTemplate(userId, key);

    // Remove from current day's custom fields
    const currentDate = new Date().toISOString().slice(0, 10);
    dataAccess.deleteDailyCustomField(userId, currentDate, key);
  }

  const templates = dataAccess.getCustomFieldTemplates(userId);
  const updatedState = getUserState(userId);
  res.json({ templates, state: updatedState });
});

// Update template-based custom field value (updates current day only)
app.put('/api/custom-fields/:key', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { key } = req.params;
  const { value } = req.body;

  const currentDate = new Date().toISOString().slice(0, 10);

  // Update field value in database
  dataAccess.setDailyCustomField(userId, currentDate, key, value, true);

  const state = getUserState(userId);
  res.json(state);
});

// Serve static files
app.use(express.static(path.join(__dirname, '../client/dist')));

// Serve SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`=== SERVER WORKING ===`);
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`✅ Database persistence enabled`);

  // Initialize default admin user after server starts
  initializeDefaultAdmin();

  console.log(`=== TEST INSTRUCTIONS ===`);
  console.log(`1. Visit: http://localhost:${PORT}`);
  console.log(`2. Login: admin / admin123`);
  console.log(`3. Navigate to Profile page`);
  console.log(`4. Should see: User Management options`);
  console.log(`5. Should NOT see: "Admin Access Required" message`);
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
