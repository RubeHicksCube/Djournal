const API_BASE = '/api';

// Helper to add auth headers
function getAuthHeaders() {
  const token = localStorage.getItem('authToken');
  return token ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

// Check if user is logged in
function isLoggedIn() {
  return localStorage.getItem('authToken') !== null;
}

// Redirect to login if not authenticated
function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = '/login';
    return false;
  }
  return true;
}

export const api = {
  // Check authentication
  isLoggedIn,
  requireAuth,
  
  // Get current state
  getState: async () => {
    const response = await fetch(`${API_BASE}/state`, {
      headers: getAuthHeaders()
    });
    if (response.status === 401) {
      window.location.href = '/login';
      return null;
    }
    return response.json();
  },

  // Update daily data
  updateDaily: async (data) => {
    const response = await fetch(`${API_BASE}/daily`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return response.json();
  },

  // Add activity entry
  addEntry: async (text, image = null) => {
    const response = await fetch(`${API_BASE}/entry`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ text, image })
    });
    return response.json();
  },

  // Add time-since tracker
  addTimeSinceTracker: async (name, date) => {
    const response = await fetch(`${API_BASE}/trackers/time-since`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, date })
    });
    return response.json();
  },

  // Delete time-since tracker
  deleteTimeSinceTracker: async (id) => {
    const response = await fetch(`${API_BASE}/trackers/time-since/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return response.json();
  },

  // Add/update duration tracker
  updateDurationTracker: async (name, type) => {
    const response = await fetch(`${API_BASE}/trackers/duration`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, type })
    });
    return response.json();
  },

  // Delete duration tracker
  deleteDurationTracker: async (id) => {
    const response = await fetch(`${API_BASE}/trackers/duration/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return response.json();
  },

  // Timer controls
  startTimer: async (id) => {
    const response = await fetch(`${API_BASE}/trackers/timer/start/${id}`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    return response.json();
  },

  stopTimer: async (id) => {
    const response = await fetch(`${API_BASE}/trackers/timer/stop/${id}`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    return response.json();
  },

  resetTimer: async (id) => {
    const response = await fetch(`${API_BASE}/trackers/timer/reset/${id}`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    return response.json();
  },

  // Counter increment
  incrementCounter: async (id) => {
    const response = await fetch(`${API_BASE}/trackers/counter/increment/${id}`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    return response.json();
  },

  // Custom Counters (water, coffee, etc.)
  createCustomCounter: async (name) => {
    const response = await fetch(`${API_BASE}/custom-counters/create`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name })
    });
    return response.json();
  },

  incrementCounter: async (id) => {
    const response = await fetch(`${API_BASE}/custom-counters/${id}/increment`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    return response.json();
  },

  decrementCounter: async (id) => {
    const response = await fetch(`${API_BASE}/custom-counters/${id}/decrement`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    return response.json();
  },

  setCounter: async (id, value) => {
    const response = await fetch(`${API_BASE}/custom-counters/${id}/set`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ value })
    });
    return response.json();
  },

  deleteCustomCounter: async (id) => {
    const response = await fetch(`${API_BASE}/custom-counters/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return response.json();
  },

  // Daily Custom Fields (non-persistent)
  addDailyCustomField: async (key, value) => {
    const response = await fetch(`${API_BASE}/daily-custom-fields`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ key, value })
    });
    return response.json();
  },

  deleteDailyCustomField: async (id) => {
    const response = await fetch(`${API_BASE}/daily-custom-fields/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return response.json();
  },

  // Daily Tasks
  addDailyTask: async (text) => {
    const response = await fetch(`${API_BASE}/daily-tasks`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ text })
    });
    return response.json();
  },

  toggleDailyTask: async (id) => {
    const response = await fetch(`${API_BASE}/daily-tasks/${id}/toggle`, {
      method: 'PUT',
      headers: getAuthHeaders()
    });
    return response.json();
  },

  deleteDailyTask: async (id) => {
    const response = await fetch(`${API_BASE}/daily-tasks/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return response.json();
  },

  // Template Custom Fields (persist name, reset value daily)
  createCustomFieldTemplate: async (key) => {
    const response = await fetch(`${API_BASE}/custom-field-templates/create`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ key })
    });
    return response.json();
  },

  getCustomFieldTemplates: async () => {
    const response = await fetch(`${API_BASE}/custom-field-templates`, {
      headers: getAuthHeaders()
    });
    return response.json();
  },

  deleteCustomFieldTemplate: async (id) => {
    const response = await fetch(`${API_BASE}/custom-field-templates/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return response.json();
  },

  updateCustomFieldValue: async (key, value) => {
    const response = await fetch(`${API_BASE}/custom-fields/${key}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ value })
    });
    return response.json();
  },

  // Download markdown
  downloadMarkdown: () => {
    const token = localStorage.getItem('authToken');
    window.location.href = `${API_BASE}/download${token ? '?token=' + token : ''}`;
  },

  // Export management
  saveSnapshot: async () => {
    const response = await fetch(`${API_BASE}/exports/save-snapshot`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    return response.json();
  },

  getAvailableExportDates: async () => {
    const response = await fetch(`${API_BASE}/exports/available-dates`, {
      headers: getAuthHeaders()
    });
    return response.json();
  },

  deleteSnapshot: async (date) => {
    const response = await fetch(`${API_BASE}/exports/snapshot/${date}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return response.json();
  },

  getRetentionSettings: async () => {
    const response = await fetch(`${API_BASE}/exports/retention-settings`, {
      headers: getAuthHeaders()
    });
    return response.json();
  },

  updateRetentionSettings: async (maxDays, maxCount) => {
    const response = await fetch(`${API_BASE}/exports/retention-settings`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ maxDays, maxCount })
    });
    return response.json();
  },

  downloadDateRange: (startDate, endDate) => {
    const token = localStorage.getItem('authToken');
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `${API_BASE}/exports/download-range`;
    form.target = '_blank';

    const tokenInput = document.createElement('input');
    tokenInput.type = 'hidden';
    tokenInput.name = 'token';
    tokenInput.value = token;
    form.appendChild(tokenInput);

    const startInput = document.createElement('input');
    startInput.type = 'hidden';
    startInput.name = 'startDate';
    startInput.value = startDate;
    form.appendChild(startInput);

    const endInput = document.createElement('input');
    endInput.type = 'hidden';
    endInput.name = 'endDate';
    endInput.value = endDate;
    form.appendChild(endInput);

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  },

  // Profile fields management
  updateProfileField: async (key, value) => {
    const response = await fetch(`${API_BASE}/users/profile-field`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ key, value })
    });
    return response.json();
  },

  deleteProfileField: async (key) => {
    const response = await fetch(`${API_BASE}/users/profile-field/${key}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return response.json();
  },

  // User management
  getCurrentUser: async () => {
    const response = await fetch(`${API_BASE}/users/me`, {
      headers: getAuthHeaders()
    });
    if (response.status === 401) {
      window.location.href = '/login';
      return null;
    }
    return response.json();
  },

  getAllUsers: async () => {
    const response = await fetch(`${API_BASE}/users/list`, {
      headers: getAuthHeaders()
    });
    return response.json();
  },

  updateProfile: async (data) => {
    const response = await fetch(`${API_BASE}/users/me`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(data)
    });
    return response.json();
  },

  createUser: async (userData) => {
    const response = await fetch(`${API_BASE}/users/create`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(userData)
    });
    return response.json();
  },

  updateUser: async (userId, userData) => {
    const response = await fetch(`${API_BASE}/users/${userId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(userData)
    });
    return response.json();
  },

  deleteUser: async (userId) => {
    const response = await fetch(`${API_BASE}/users/${userId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    return response.json();
  },

  resetUserPassword: async (userId, newPassword) => {
    const response = await fetch(`${API_BASE}/users/${userId}/reset-password`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ newPassword })
    });
    return response.json();
  },

  // Logout
  logout: () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
    window.location.href = '/login';
  },
};
