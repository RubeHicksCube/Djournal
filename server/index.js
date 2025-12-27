const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const PDFDocument = require('pdfkit');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8001;

// Import proper auth middleware
const { generateToken, authMiddleware } = require('./middleware/auth');

// In-memory users (simplified for debugging)
const users = [];

// Hash the default admin password
const adminPasswordHash = bcrypt.hashSync('admin123', 10);

const defaultAdmin = {
  id: 1,
  username: 'admin',
  email: null,
  is_admin: true,
  password_hash: adminPasswordHash
};

app.use(cors());
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// Mock database - single admin user
users.push(defaultAdmin);

// Mock state storage (in-memory) - per user
const userStates = {}; // { userId: dailyState }

// Custom field templates (persist across dates, but values reset) - per user
const customFieldTemplates = {}; // { userId: [...templates] }

// Helper function to get or initialize user state
function getUserState(userId) {
  if (!userStates[userId]) {
    userStates[userId] = {
      date: new Date().toISOString().slice(0, 10),
      previousBedtime: '',
      wakeTime: '',
      customFields: [],           // Template-based custom fields (persist name, reset value daily)
      dailyCustomFields: [],      // Non-persistent custom fields (don't carry over to new dates)
      dailyTasks: [],             // Daily to-do tasks
      customCounters: [],         // Custom counters (e.g., water, coffee, calories)
      entries: [],
      timeSinceTrackers: [],
      durationTrackers: []
    };

    // Load persistent trackers for this user
    loadTrackersIntoState(userId);
  }
  return userStates[userId];
}

// Historical data storage: { userId: { 'YYYY-MM-DD': {...dailyData} } }
const historicalData = {};

// Snapshot retention settings: { userId: { maxDays: 30, maxCount: 100 } }
const snapshotSettings = {};

// Profile fields storage (persist across sessions): { userId: { fieldKey: fieldValue, ... } }
const profileFields = {};

// Persistent tracker storage: { userId: { timeSinceTrackers: [...], durationTrackers: [...], customCounters: [...] } }
const persistentTrackers = {};

let nextId = 1;

// Helper function to initialize persistent trackers for a user
function initializePersistentTrackers(userId) {
  if (!persistentTrackers[userId]) {
    persistentTrackers[userId] = {
      timeSinceTrackers: [],
      durationTrackers: [],
      customCounters: []
    };
  }
}

// Helper function to load trackers from persistent storage into daily state
function loadTrackersIntoState(userId) {
  initializePersistentTrackers(userId);

  const state = getUserState(userId);
  const userTrackers = persistentTrackers[userId];

  // Load time since trackers (persist as-is)
  state.timeSinceTrackers = [...userTrackers.timeSinceTrackers];

  // Load duration trackers (persist as-is)
  state.durationTrackers = [...userTrackers.durationTrackers];

  // Load custom counters (persist structure, but reset values to 0 on new day)
  state.customCounters = userTrackers.customCounters.map(counter => ({
    ...counter,
    value: 0 // Reset value to 0 for new day
  }));
}

// Helper function to save trackers from daily state to persistent storage
function saveTrackersToPersistent(userId) {
  initializePersistentTrackers(userId);

  const state = getUserState(userId);

  // Save current state to persistent storage
  persistentTrackers[userId] = {
    timeSinceTrackers: [...state.timeSinceTrackers],
    durationTrackers: [...state.durationTrackers],
    customCounters: state.customCounters.map(counter => ({
      ...counter
      // Note: We keep the current value in persistent storage
    }))
  };
}

// Helper function to check for date transition and handle accordingly
function checkDateTransition(userId) {
  const state = getUserState(userId);
  const currentDate = new Date().toISOString().slice(0, 10);

  if (state.date !== currentDate) {
    console.log(`Date transition detected for user ${userId}: ${state.date} -> ${currentDate}`);

    // Save old state to history
    saveDailySnapshot(userId);

    // Update to new date
    state.date = currentDate;

    // Reset daily fields
    state.previousBedtime = '';
    state.wakeTime = '';

    // Get user's custom field templates
    const userTemplates = customFieldTemplates[userId] || [];
    state.customFields = userTemplates.map(t => ({ ...t, value: '' }));
    state.dailyCustomFields = [];
    state.dailyTasks = [];
    state.entries = [];

    // Load persistent trackers and reset counter values
    loadTrackersIntoState(userId);
  }
}

// Helper function to clean up old snapshots based on retention settings
function cleanupOldSnapshots(userId) {
  const settings = snapshotSettings[userId] || { maxDays: 30, maxCount: 100 };
  const userHistory = historicalData[userId];

  if (!userHistory) return;

  const dates = Object.keys(userHistory).sort();

  // Cleanup by date (maxDays)
  if (settings.maxDays > 0) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - settings.maxDays);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    dates.forEach(date => {
      if (date < cutoffStr) {
        delete userHistory[date];
        console.log(`Deleted snapshot ${date} (older than ${settings.maxDays} days)`);
      }
    });
  }

  // Cleanup by count (maxCount) - keep only the most recent N snapshots
  const remainingDates = Object.keys(userHistory).sort().reverse();
  if (settings.maxCount > 0 && remainingDates.length > settings.maxCount) {
    const toDelete = remainingDates.slice(settings.maxCount);
    toDelete.forEach(date => {
      delete userHistory[date];
      console.log(`Deleted snapshot ${date} (exceeded max count of ${settings.maxCount})`);
    });
  }
}

// Helper function to save current state to history
function saveDailySnapshot(userId) {
  const state = getUserState(userId);
  const date = state.date;

  if (!historicalData[userId]) {
    historicalData[userId] = {};
  }

  // Deep clone the current state
  historicalData[userId][date] = JSON.parse(JSON.stringify(state));

  console.log(`Saved snapshot for user ${userId} on ${date}`);

  // Cleanup old snapshots
  cleanupOldSnapshots(userId);
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

// Generate token


// Login endpoint
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  // Find user by username or email
  const user = users.find(u => u.username === username || u.email === username);

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
  // Look up full user details from users array
  const user = users.find(u => u.id === req.user.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Get user's profile fields from persistent storage
  const userProfileFields = profileFields[req.user.id] || {};

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

  // Initialize user profile fields if not exists
  if (!profileFields[req.user.id]) {
    profileFields[req.user.id] = {};
  }

  // Save the profile field
  profileFields[req.user.id][key] = value;

  console.log(`Setting profile field for user ${req.user.id}: ${key} = ${value}`);
  res.json({ success: true });
});

app.delete('/api/users/profile-field/:key', authMiddleware, (req, res) => {
  const { key } = req.params;

  // Remove the profile field if it exists
  if (profileFields[req.user.id]) {
    delete profileFields[req.user.id][key];
  }

  console.log(`Deleting profile field for user ${req.user.id}: ${key}`);
  res.json({ success: true });
});

// Update user profile
app.put('/api/users/me', authMiddleware, (req, res) => {
  const { username, email, currentPassword, newPassword } = req.body;

  // Find user in mock array
  const user = users.find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // For this mock implementation, just update the user object
  if (username) user.username = username;
  if (email !== undefined) user.email = email;

  console.log(`Updated profile for user ${req.user.id}:`, { username, email });
  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email
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

  const userList = users.map(u => ({
    id: u.id,
    username: u.username,
    email: u.email,
    is_admin: u.is_admin,
    created_at: new Date().toISOString()
  }));

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
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  // Hash the password
  const password_hash = bcrypt.hashSync(password, 10);

  // Create new user
  const newUser = {
    id: users.length + 1,
    username,
    email: email || null,
    is_admin: !!is_admin,
    password_hash: password_hash
  };

  users.push(newUser);

  console.log(`Created new user:`, { ...newUser, password_hash: '[HIDDEN]' });
  res.json({
    success: true,
    user: {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email,
      is_admin: newUser.is_admin,
      created_at: new Date().toISOString()
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
  const targetUser = users.find(u => u.id === parseInt(id));
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Hash new password
  targetUser.password_hash = bcrypt.hashSync(newPassword, 10);

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
  const targetUser = users.find(u => u.id === parseInt(id));
  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Check if new username is already taken
  if (username && username !== targetUser.username) {
    const existingUser = users.find(u => u.username === username && u.id !== parseInt(id));
    if (existingUser) {
      return res.status(400).json({ error: 'Username already taken' });
    }
    targetUser.username = username;
  }

  // Update email
  if (email !== undefined) {
    targetUser.email = email || null;
  }

  // Update admin status
  if (is_admin !== undefined) {
    targetUser.is_admin = !!is_admin;
  }

  console.log(`Admin updated user:`, { id: targetUser.id, username: targetUser.username, email: targetUser.email, is_admin: targetUser.is_admin });
  res.json({
    success: true,
    user: {
      id: targetUser.id,
      username: targetUser.username,
      email: targetUser.email,
      is_admin: targetUser.is_admin
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

  // Find user index
  const userIndex = users.findIndex(u => u.id === userId);
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }

  const deletedUsername = users[userIndex].username;
  users.splice(userIndex, 1);

  console.log(`Admin deleted user: ${deletedUsername}`);
  res.json({ success: true, message: 'User deleted successfully' });
});

// Get current state (Home page data)
app.get('/api/state', authMiddleware, (req, res) => {
  const userId = req.user.id;

  // Check for date transition and handle tracker persistence
  checkDateTransition(userId);

  const state = getUserState(userId);
  res.json(state);
});

// Update daily data
app.post('/api/daily', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const data = req.body;
  console.log('Updating daily data:', data);

  const state = getUserState(userId);

  // Update state with provided data
  if (data.previousBedtime !== undefined) state.previousBedtime = data.previousBedtime;
  if (data.wakeTime !== undefined) state.wakeTime = data.wakeTime;

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

  const state = getUserState(userId);

  const newEntry = {
    id: nextId++,
    timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
    text: text,
    image: image || null // base64 encoded image data
  };

  state.entries.push(newEntry);
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

  // Check for date transition before export
  checkDateTransition(userId);

  // Auto-save snapshot before export
  saveDailySnapshot(userId);

  // Get user info and profile fields
  const user = users.find(u => u.id === userId);
  const username = user ? user.username : null;
  const userProfileFields = profileFields[userId] || {};

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
    checkDateTransition(userId);

    // Auto-save snapshot before export
    saveDailySnapshot(userId);

    const user = users.find(u => u.id === userId);
    const username = user ? user.username : null;
    const userProfileFields = profileFields[userId] || {};

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

// Save daily snapshot
app.post('/api/exports/save-snapshot', authMiddleware, (req, res) => {
  const userId = req.user.id;
  saveDailySnapshot(userId);

  const state = getUserState(userId);
  res.json({ success: true, date: state.date });
});

// Get available export dates for current user
app.get('/api/exports/available-dates', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const dates = historicalData[userId] ? Object.keys(historicalData[userId]).sort().reverse() : [];

  res.json({ dates });
});

// Delete a specific snapshot
app.delete('/api/exports/snapshot/:date', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { date } = req.params;

  if (!historicalData[userId] || !historicalData[userId][date]) {
    return res.status(404).json({ error: 'Snapshot not found' });
  }

  delete historicalData[userId][date];
  console.log(`Manually deleted snapshot ${date} for user ${userId}`);

  const remainingDates = historicalData[userId] ? Object.keys(historicalData[userId]).sort().reverse() : [];
  res.json({ success: true, dates: remainingDates });
});

// Get snapshot retention settings
app.get('/api/exports/retention-settings', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const settings = snapshotSettings[userId] || { maxDays: 30, maxCount: 100 };
  res.json(settings);
});

// Update snapshot retention settings
app.put('/api/exports/retention-settings', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { maxDays, maxCount } = req.body;

  if (!snapshotSettings[userId]) {
    snapshotSettings[userId] = {};
  }

  if (maxDays !== undefined) {
    snapshotSettings[userId].maxDays = parseInt(maxDays);
  }

  if (maxCount !== undefined) {
    snapshotSettings[userId].maxCount = parseInt(maxCount);
  }

  // Run cleanup with new settings
  cleanupOldSnapshots(userId);

  const remainingDates = historicalData[userId] ? Object.keys(historicalData[userId]).sort().reverse() : [];
  res.json({
    success: true,
    settings: snapshotSettings[userId],
    dates: remainingDates
  });
});

// Export date range
app.post('/api/exports/date-range', authMiddleware, (req, res) => {
  const { startDate, endDate } = req.body;
  const userId = req.user.id;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Start date and end date required' });
  }

  const userHistory = historicalData[userId] || {};
  const dates = Object.keys(userHistory).filter(date => date >= startDate && date <= endDate).sort();

  const exportData = dates.map(date => ({
    date,
    data: userHistory[date]
  }));

  res.json({ dates: exportData });
});

// Download markdown for date range
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

  // Get user info and profile fields
  const user = users.find(u => u.id === userId);
  const username = user ? user.username : null;
  const userProfileFields = profileFields[userId] || {};

  const userHistory = historicalData[userId] || {};
  const dates = Object.keys(userHistory).filter(date => date >= startDate && date <= endDate).sort();

  if (dates.length === 0) {
    return res.status(404).json({ error: 'No data available for this date range' });
  }

  // Generate combined markdown with YAML frontmatter for each day
  let markdown = '';

  dates.forEach((date, index) => {
    const dayData = userHistory[date];
    markdown += generateMarkdownWithYAML(dayData, username, userProfileFields);

    // Add separator between days (but not after the last one)
    if (index < dates.length - 1) {
      markdown += '\n---\n\n';
    }
  });

  const filename = dates.length === 1
    ? `${startDate}.md`
    : `${startDate}_to_${endDate}.md`;

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(markdown);
});

// Download PDF for date range
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

  try {
    const user = users.find(u => u.id === userId);
    const username = user ? user.username : null;
    const userProfileFields = profileFields[userId] || {};

    const userHistory = historicalData[userId] || {};
    const dates = Object.keys(userHistory).filter(date => date >= startDate && date <= endDate).sort();

    if (dates.length === 0) {
      return res.status(404).json({ error: 'No data available for this date range' });
    }

    // Generate combined PDF with all days
    const pdfBuffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      dates.forEach((date, index) => {
        const dayData = userHistory[date];

        // Add page break between days (but not before the first day)
        if (index > 0) {
          doc.addPage();
        }

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
                const base64Data = e.image.split(',')[1] || e.image;
                const imageBuffer = Buffer.from(base64Data, 'base64');

                if (doc.y > doc.page.height - 250) {
                  doc.addPage();
                }

                doc.moveDown(0.5);
                doc.image(imageBuffer, 50, doc.y, { width: 400, fit: [400, 300] });
                doc.moveDown(10);
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
      });

      doc.end();
    });

    const filename = dates.length === 1
      ? `${startDate}.pdf`
      : `${startDate}_to_${endDate}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
  }
});

// Tracker endpoints
app.post('/api/trackers/time-since', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { name, date } = req.body;

  const state = getUserState(userId);

  const newTracker = {
    id: nextId++,
    name: name,
    date: date
  };

  state.timeSinceTrackers.push(newTracker);

  // Save to persistent storage
  saveTrackersToPersistent(userId);

  res.json(state);
});

app.delete('/api/trackers/time-since/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);

  const state = getUserState(userId);
  state.timeSinceTrackers = state.timeSinceTrackers.filter(t => t.id !== id);

  // Save to persistent storage
  saveTrackersToPersistent(userId);

  res.json(state);
});

app.post('/api/trackers/duration', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { name } = req.body;

  const state = getUserState(userId);

  const newTracker = {
    id: nextId++,
    name: name,
    type: 'timer', // Always create as timer
    value: 0,
    isRunning: false,
    startTime: null,
    elapsedMs: 0  // Initialize elapsed milliseconds for timer
  };

  state.durationTrackers.push(newTracker);

  // Save to persistent storage
  saveTrackersToPersistent(userId);

  res.json(state);
});

app.delete('/api/trackers/duration/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);

  const state = getUserState(userId);
  state.durationTrackers = state.durationTrackers.filter(t => t.id !== id);

  // Save to persistent storage
  saveTrackersToPersistent(userId);

  res.json(state);
});

// Set manual time for timer
app.post('/api/trackers/manual-time', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { trackerId, startTime, elapsedMs } = req.body;

  const state = getUserState(userId);

  // Find tracker
  const tracker = state.durationTrackers.find(t => t.id === parseInt(trackerId));
  if (!tracker) {
    return res.status(404).json({ error: 'Tracker not found' });
  }

  if (tracker.type !== 'timer') {
    return res.status(400).json({ error: 'Manual time only works with timer trackers' });
  }

  // Update tracker with manual time
  tracker.startTime = startTime;
  tracker.elapsedMs = elapsedMs;
  tracker.isRunning = false;

  // Save to persistent storage
  saveTrackersToPersistent(userId);

  console.log(`Set manual time for tracker ${trackerId}: ${elapsedMs}ms`);
  res.json(state);
});

app.post('/api/trackers/timer/start/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);

  const state = getUserState(userId);
  const tracker = state.durationTrackers.find(t => t.id === id);

  if (tracker && tracker.type === 'timer') {
    tracker.isRunning = true;
    tracker.startTime = Date.now();
  }

  // Save to persistent storage
  saveTrackersToPersistent(userId);

  res.json(state);
});

app.post('/api/trackers/timer/stop/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);

  const state = getUserState(userId);
  const tracker = state.durationTrackers.find(t => t.id === id);

  if (tracker && tracker.type === 'timer' && tracker.isRunning) {
    const elapsed = Date.now() - tracker.startTime;
    tracker.elapsedMs += elapsed; // Add to elapsedMs for consistent display
    tracker.value = Math.floor(tracker.elapsedMs / 1000); // Update value in seconds
    tracker.isRunning = false;
    tracker.startTime = null;
  }

  // Save to persistent storage
  saveTrackersToPersistent(userId);

  res.json(state);
});

app.post('/api/trackers/timer/reset/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);

  const state = getUserState(userId);
  const tracker = state.durationTrackers.find(t => t.id === id);

  if (tracker && tracker.type === 'timer') {
    tracker.value = 0;
    tracker.isRunning = false;
    tracker.startTime = null;
    tracker.elapsedMs = 0;
  }

  // Save to persistent storage
  saveTrackersToPersistent(userId);

  res.json(state);
});

// Custom Counters (water, coffee, calories, etc.)
app.post('/api/custom-counters/create', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Counter name is required' });
  }

  const state = getUserState(userId);

  const newCounter = {
    id: nextId++,
    name,
    value: 0
  };

  state.customCounters.push(newCounter);

  // Save to persistent storage
  saveTrackersToPersistent(userId);

  res.json(state);
});

app.post('/api/custom-counters/:id/increment', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);

  const state = getUserState(userId);
  const counter = state.customCounters.find(c => c.id === id);

  if (counter) {
    counter.value += 1;
  }

  // Save to persistent storage
  saveTrackersToPersistent(userId);

  res.json(state);
});

app.post('/api/custom-counters/:id/decrement', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);

  const state = getUserState(userId);
  const counter = state.customCounters.find(c => c.id === id);

  if (counter && counter.value > 0) {
    counter.value -= 1;
  }

  // Save to persistent storage
  saveTrackersToPersistent(userId);

  res.json(state);
});

app.put('/api/custom-counters/:id/set', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);
  const { value } = req.body;

  const state = getUserState(userId);
  const counter = state.customCounters.find(c => c.id === id);

  if (counter && typeof value === 'number' && value >= 0) {
    counter.value = value;
  }

  // Save to persistent storage
  saveTrackersToPersistent(userId);

  res.json(state);
});

app.delete('/api/custom-counters/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);

  const state = getUserState(userId);
  state.customCounters = state.customCounters.filter(c => c.id !== id);

  // Save to persistent storage
  saveTrackersToPersistent(userId);

  res.json(state);
});

// Daily Custom Fields (non-persistent, don't carry over to new dates)
app.post('/api/daily-custom-fields', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { key, value } = req.body;

  if (!key) {
    return res.status(400).json({ error: 'Field key is required' });
  }

  const state = getUserState(userId);

  // Check if field already exists
  const existingField = state.dailyCustomFields.find(f => f.key === key);

  if (existingField) {
    existingField.value = value;
  } else {
    state.dailyCustomFields.push({
      id: nextId++,
      key,
      value: value || ''
    });
  }

  res.json(state);
});

app.delete('/api/daily-custom-fields/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);

  const state = getUserState(userId);
  state.dailyCustomFields = state.dailyCustomFields.filter(f => f.id !== id);
  res.json(state);
});

// Daily Tasks
app.post('/api/daily-tasks', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Task text is required' });
  }

  const state = getUserState(userId);

  state.dailyTasks.push({
    id: nextId++,
    text,
    completed: false
  });

  res.json(state);
});

app.put('/api/daily-tasks/:id/toggle', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);

  const state = getUserState(userId);
  const task = state.dailyTasks.find(t => t.id === id);

  if (task) {
    task.completed = !task.completed;
  }

  res.json(state);
});

app.delete('/api/daily-tasks/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);

  const state = getUserState(userId);
  state.dailyTasks = state.dailyTasks.filter(t => t.id !== id);
  res.json(state);
});

// Template Custom Fields (persist name, reset value daily)
app.post('/api/custom-field-templates/create', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { key } = req.body;

  if (!key) {
    return res.status(400).json({ error: 'Field key is required' });
  }

  // Initialize user's templates if not exists
  if (!customFieldTemplates[userId]) {
    customFieldTemplates[userId] = [];
  }

  // Check if template already exists for this user
  if (customFieldTemplates[userId].find(t => t.key === key)) {
    return res.status(400).json({ error: 'Template already exists' });
  }

  customFieldTemplates[userId].push({
    id: nextId++,
    key
  });

  const state = getUserState(userId);

  // Add to current day's custom fields with empty value
  state.customFields.push({
    id: nextId++,
    key,
    value: ''
  });

  res.json({ templates: customFieldTemplates[userId], state });
});

app.get('/api/custom-field-templates', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const userTemplates = customFieldTemplates[userId] || [];
  res.json({ templates: userTemplates });
});

app.delete('/api/custom-field-templates/:id', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const id = parseInt(req.params.id);

  if (!customFieldTemplates[userId]) {
    customFieldTemplates[userId] = [];
  }

  const template = customFieldTemplates[userId].find(t => t.id === id);

  if (template) {
    // Remove template
    const index = customFieldTemplates[userId].findIndex(t => t.id === id);
    customFieldTemplates[userId].splice(index, 1);

    const state = getUserState(userId);

    // Remove from current day's custom fields
    state.customFields = state.customFields.filter(f => f.key !== template.key);
  }

  res.json({ templates: customFieldTemplates[userId], state: getUserState(userId) });
});

// Update template-based custom field value (updates current day only)
app.put('/api/custom-fields/:key', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const { key } = req.params;
  const { value } = req.body;

  const state = getUserState(userId);
  const field = state.customFields.find(f => f.key === key);

  if (field) {
    field.value = value;
  }

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
  console.log(`✅ Admin login: admin / admin123`);
  console.log(`✅ Admin user ID: 1`);
  console.log(`✅ All admin features enabled`);
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