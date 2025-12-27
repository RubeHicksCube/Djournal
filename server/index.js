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

// Mock state storage (in-memory)
const dailyState = {
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

// Custom field templates (persist across dates, but values reset)
const customFieldTemplates = [];

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

  const userTrackers = persistentTrackers[userId];

  // Load time since trackers (persist as-is)
  dailyState.timeSinceTrackers = [...userTrackers.timeSinceTrackers];

  // Load duration trackers (persist as-is)
  dailyState.durationTrackers = [...userTrackers.durationTrackers];

  // Load custom counters (persist structure, but reset values to 0 on new day)
  dailyState.customCounters = userTrackers.customCounters.map(counter => ({
    ...counter,
    value: 0 // Reset value to 0 for new day
  }));
}

// Helper function to save trackers from daily state to persistent storage
function saveTrackersToPersistent(userId) {
  initializePersistentTrackers(userId);

  // Save current state to persistent storage
  persistentTrackers[userId] = {
    timeSinceTrackers: [...dailyState.timeSinceTrackers],
    durationTrackers: [...dailyState.durationTrackers],
    customCounters: dailyState.customCounters.map(counter => ({
      ...counter
      // Note: We keep the current value in persistent storage
    }))
  };
}

// Helper function to check for date transition and handle accordingly
function checkDateTransition(userId) {
  const currentDate = new Date().toISOString().slice(0, 10);

  if (dailyState.date !== currentDate) {
    console.log(`Date transition detected: ${dailyState.date} -> ${currentDate}`);

    // Save old state to history
    saveDailySnapshot(userId);

    // Update to new date
    dailyState.date = currentDate;

    // Reset daily fields
    dailyState.previousBedtime = '';
    dailyState.wakeTime = '';
    dailyState.customFields = customFieldTemplates.map(t => ({ ...t, value: '' }));
    dailyState.dailyCustomFields = [];
    dailyState.dailyTasks = [];
    dailyState.entries = [];

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
  const date = dailyState.date;

  if (!historicalData[userId]) {
    historicalData[userId] = {};
  }

  // Deep clone the current state
  historicalData[userId][date] = JSON.parse(JSON.stringify(dailyState));

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
        const hours = Math.floor(t.value / 3600);
        const minutes = Math.floor((t.value % 3600) / 60);
        const seconds = t.value % 60;
        yaml += `    formatted: "${hours}h ${minutes}m ${seconds}s"\n`;
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

// Helper function to format duration for PDF
function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
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
        doc.fontSize(12).fillColor('#000000').text(`• ${t.name}: ${formatDate(t.date)}`);
      });
      doc.moveDown();
    }

    // Duration Trackers
    if (dayData.durationTrackers && dayData.durationTrackers.length > 0) {
      doc.fontSize(16).fillColor('#6B46C1').text('DURATION TRACKERS', { underline: true });
      dayData.durationTrackers.forEach(t => {
        const formatted = t.type === 'timer' ? formatDuration(t.value) : `${t.value} minutes`;
        doc.fontSize(12).fillColor('#000000').text(`• ${t.name} (${t.type}): ${formatted}`);
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
  // Check for date transition and handle tracker persistence
  checkDateTransition(req.user.id);

  res.json(dailyState);
});

// Update daily data
app.post('/api/daily', authMiddleware, (req, res) => {
  const data = req.body;
  console.log('Updating daily data:', data);

  // Update state with provided data
  if (data.previousBedtime !== undefined) dailyState.previousBedtime = data.previousBedtime;
  if (data.wakeTime !== undefined) dailyState.wakeTime = data.wakeTime;

  res.json(dailyState);
});

// Add entry
app.post('/api/entry', authMiddleware, (req, res) => {
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

  const newEntry = {
    id: nextId++,
    timestamp: new Date().toLocaleTimeString('en-US', { hour12: false }),
    text: text,
    image: image || null // base64 encoded image data
  };

  dailyState.entries.push(newEntry);
  res.json(dailyState);
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

  // Get user info and profile fields
  const user = users.find(u => u.id === decoded.id);
  const username = user ? user.username : null;
  const userProfileFields = profileFields[decoded.id] || {};

  const markdown = generateMarkdownWithYAML(dailyState, username, userProfileFields);

  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${dailyState.date}.md"`);
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

  try {
    checkDateTransition(decoded.id);

    const user = users.find(u => u.id === decoded.id);
    const username = user ? user.username : null;
    const userProfileFields = profileFields[decoded.id] || {};

    const pdfBuffer = await generatePDFReport(dailyState, username, userProfileFields);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${dailyState.date}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: 'Failed to generate PDF', details: error.message });
  }
});

// Save daily snapshot
app.post('/api/exports/save-snapshot', authMiddleware, (req, res) => {
  saveDailySnapshot(req.user.id);
  res.json({ success: true, date: dailyState.date });
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
            doc.fontSize(12).fillColor('#000000').text(`• ${t.name}: ${formatDate(t.date)}`);
          });
          doc.moveDown();
        }

        // Duration Trackers
        if (dayData.durationTrackers && dayData.durationTrackers.length > 0) {
          doc.fontSize(16).fillColor('#6B46C1').text('DURATION TRACKERS', { underline: true });
          dayData.durationTrackers.forEach(t => {
            const formatted = t.type === 'timer' ? formatDuration(t.value) : `${t.value} minutes`;
            doc.fontSize(12).fillColor('#000000').text(`• ${t.name} (${t.type}): ${formatted}`);
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
  const { name, date } = req.body;

  const newTracker = {
    id: nextId++,
    name: name,
    date: date
  };

  dailyState.timeSinceTrackers.push(newTracker);

  // Save to persistent storage
  saveTrackersToPersistent(req.user.id);

  res.json(dailyState);
});

app.delete('/api/trackers/time-since/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  dailyState.timeSinceTrackers = dailyState.timeSinceTrackers.filter(t => t.id !== id);

  // Save to persistent storage
  saveTrackersToPersistent(req.user.id);

  res.json(dailyState);
});

app.post('/api/trackers/duration', authMiddleware, (req, res) => {
  const { name } = req.body;

  const newTracker = {
    id: nextId++,
    name: name,
    type: 'timer', // Always create as timer
    value: 0,
    isRunning: false,
    startTime: null,
    elapsedMs: 0  // Initialize elapsed milliseconds for timer
  };

  dailyState.durationTrackers.push(newTracker);

  // Save to persistent storage
  saveTrackersToPersistent(req.user.id);

  res.json(dailyState);
});

app.delete('/api/trackers/duration/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  dailyState.durationTrackers = dailyState.durationTrackers.filter(t => t.id !== id);

  // Save to persistent storage
  saveTrackersToPersistent(req.user.id);

  res.json(dailyState);
});

// Set manual time for timer
app.post('/api/trackers/manual-time', authMiddleware, (req, res) => {
  const { trackerId, startTime, elapsedMs } = req.body;

  // Find tracker
  const tracker = dailyState.durationTrackers.find(t => t.id === parseInt(trackerId));
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
  saveTrackersToPersistent(req.user.id);

  console.log(`Set manual time for tracker ${trackerId}: ${elapsedMs}ms`);
  res.json(dailyState);
});

app.post('/api/trackers/timer/start/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const tracker = dailyState.durationTrackers.find(t => t.id === id);

  if (tracker && tracker.type === 'timer') {
    tracker.isRunning = true;
    tracker.startTime = Date.now();
  }

  // Save to persistent storage
  saveTrackersToPersistent(req.user.id);

  res.json(dailyState);
});

app.post('/api/trackers/timer/stop/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const tracker = dailyState.durationTrackers.find(t => t.id === id);

  if (tracker && tracker.type === 'timer' && tracker.isRunning) {
    const elapsed = Date.now() - tracker.startTime;
    tracker.value += Math.floor(elapsed / 1000); // Add seconds
    tracker.isRunning = false;
    tracker.startTime = null;
  }

  // Save to persistent storage
  saveTrackersToPersistent(req.user.id);

  res.json(dailyState);
});

app.post('/api/trackers/timer/reset/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const tracker = dailyState.durationTrackers.find(t => t.id === id);

  if (tracker && tracker.type === 'timer') {
    tracker.value = 0;
    tracker.isRunning = false;
    tracker.startTime = null;
    tracker.elapsedMs = 0;
  }

  // Save to persistent storage
  saveTrackersToPersistent(req.user.id);

  res.json(dailyState);
});

// Custom Counters (water, coffee, calories, etc.)
app.post('/api/custom-counters/create', authMiddleware, (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Counter name is required' });
  }

  const newCounter = {
    id: nextId++,
    name,
    value: 0
  };

  dailyState.customCounters.push(newCounter);

  // Save to persistent storage
  saveTrackersToPersistent(req.user.id);

  res.json(dailyState);
});

app.post('/api/custom-counters/:id/increment', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const counter = dailyState.customCounters.find(c => c.id === id);

  if (counter) {
    counter.value += 1;
  }

  // Save to persistent storage
  saveTrackersToPersistent(req.user.id);

  res.json(dailyState);
});

app.post('/api/custom-counters/:id/decrement', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const counter = dailyState.customCounters.find(c => c.id === id);

  if (counter && counter.value > 0) {
    counter.value -= 1;
  }

  // Save to persistent storage
  saveTrackersToPersistent(req.user.id);

  res.json(dailyState);
});

app.put('/api/custom-counters/:id/set', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const { value } = req.body;
  const counter = dailyState.customCounters.find(c => c.id === id);

  if (counter && typeof value === 'number' && value >= 0) {
    counter.value = value;
  }

  // Save to persistent storage
  saveTrackersToPersistent(req.user.id);

  res.json(dailyState);
});

app.delete('/api/custom-counters/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  dailyState.customCounters = dailyState.customCounters.filter(c => c.id !== id);

  // Save to persistent storage
  saveTrackersToPersistent(req.user.id);

  res.json(dailyState);
});

// Daily Custom Fields (non-persistent, don't carry over to new dates)
app.post('/api/daily-custom-fields', authMiddleware, (req, res) => {
  const { key, value } = req.body;

  if (!key) {
    return res.status(400).json({ error: 'Field key is required' });
  }

  // Check if field already exists
  const existingField = dailyState.dailyCustomFields.find(f => f.key === key);

  if (existingField) {
    existingField.value = value;
  } else {
    dailyState.dailyCustomFields.push({
      id: nextId++,
      key,
      value: value || ''
    });
  }

  res.json(dailyState);
});

app.delete('/api/daily-custom-fields/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  dailyState.dailyCustomFields = dailyState.dailyCustomFields.filter(f => f.id !== id);
  res.json(dailyState);
});

// Daily Tasks
app.post('/api/daily-tasks', authMiddleware, (req, res) => {
  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Task text is required' });
  }

  dailyState.dailyTasks.push({
    id: nextId++,
    text,
    completed: false
  });

  res.json(dailyState);
});

app.put('/api/daily-tasks/:id/toggle', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const task = dailyState.dailyTasks.find(t => t.id === id);

  if (task) {
    task.completed = !task.completed;
  }

  res.json(dailyState);
});

app.delete('/api/daily-tasks/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  dailyState.dailyTasks = dailyState.dailyTasks.filter(t => t.id !== id);
  res.json(dailyState);
});

// Template Custom Fields (persist name, reset value daily)
app.post('/api/custom-field-templates/create', authMiddleware, (req, res) => {
  const { key } = req.body;

  if (!key) {
    return res.status(400).json({ error: 'Field key is required' });
  }

  // Check if template already exists
  if (customFieldTemplates.find(t => t.key === key)) {
    return res.status(400).json({ error: 'Template already exists' });
  }

  customFieldTemplates.push({
    id: nextId++,
    key
  });

  // Add to current day's custom fields with empty value
  dailyState.customFields.push({
    id: nextId++,
    key,
    value: ''
  });

  res.json({ templates: customFieldTemplates, state: dailyState });
});

app.get('/api/custom-field-templates', authMiddleware, (req, res) => {
  res.json({ templates: customFieldTemplates });
});

app.delete('/api/custom-field-templates/:id', authMiddleware, (req, res) => {
  const id = parseInt(req.params.id);
  const template = customFieldTemplates.find(t => t.id === id);

  if (template) {
    // Remove template
    const index = customFieldTemplates.findIndex(t => t.id === id);
    customFieldTemplates.splice(index, 1);

    // Remove from current day's custom fields
    dailyState.customFields = dailyState.customFields.filter(f => f.key !== template.key);
  }

  res.json({ templates: customFieldTemplates, state: dailyState });
});

// Update template-based custom field value (updates current day only)
app.put('/api/custom-fields/:key', authMiddleware, (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  const field = dailyState.customFields.find(f => f.key === key);

  if (field) {
    field.value = value;
  }

  res.json(dailyState);
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