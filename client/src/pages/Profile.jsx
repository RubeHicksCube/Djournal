import { useState, useEffect } from 'react';
import { api } from '../services/api';

export default function Profile() {
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState([]);
  const [profileFields, setProfileFields] = useState({});
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [resetPasswordUser, setResetPasswordUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [showUserManagement, setShowUserManagement] = useState(false);

  // Export states
  const [availableDates, setAvailableDates] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Retention settings
  const [retentionSettings, setRetentionSettings] = useState({ maxDays: 30, maxCount: 100 });

  // Form states
  const [editForm, setEditForm] = useState({
    username: '',
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  
  const [createForm, setCreateForm] = useState({
    username: '',
    password: '',
    email: '',
    is_admin: false
  });

  // Profile fields form
  const [fieldForm, setFieldForm] = useState({
    key: '',
    value: ''
  });

  useEffect(() => {
    loadData();
    loadAvailableDates();
    loadRetentionSettings();

    // Refresh available dates when page gains focus
    const handleFocus = () => {
      loadAvailableDates();
    };

    window.addEventListener('focus', handleFocus);

    // Also refresh every 5 seconds to catch saves from nav
    const interval = setInterval(() => {
      loadAvailableDates();
    }, 5000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    console.log('Profile component - currentUser:', currentUser);
    console.log('Profile component - isAdmin:', currentUser?.is_admin);
  }, [currentUser]);

  const loadData = async () => {
    console.log('Profile: loadData() called');
    try {
      const userResponse = await api.getCurrentUser();
      console.log('Profile: API response:', userResponse);
      
      setCurrentUser(userResponse.user);
      setProfileFields(userResponse.profileFields || {});
      setEditForm({
        username: userResponse.user.username,
        email: userResponse.user.email || '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });

      console.log('Profile: User set to:', userResponse.user);
      console.log('Profile: is_admin value:', userResponse.user?.is_admin);

      // Load all users if admin
      if (userResponse.user.is_admin) {
        const usersResponse = await api.getAllUsers();
        setUsers(usersResponse.users);
        console.log('Users loaded for admin:', usersResponse.users);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setMessage('');

    if (editForm.newPassword && editForm.newPassword !== editForm.confirmPassword) {
      setMessage('New passwords do not match');
      return;
    }

    if (editForm.newPassword && editForm.newPassword.length < 6) {
      setMessage('Password must be at least 6 characters');
      return;
    }

    try {
      const response = await api.updateProfile({
        username: editForm.username,
        email: editForm.email,
        currentPassword: editForm.currentPassword,
        newPassword: editForm.newPassword
      });

      if (response.success) {
        setCurrentUser(response.user);
        localStorage.setItem('user', JSON.stringify(response.user));
        setEditForm(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
        setMessage('Profile updated successfully!');
      } else {
        setMessage(response.error || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Profile update error:', error);
      setMessage('Error updating profile');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setMessage('');

    if (createForm.username.length < 3) {
      setMessage('Username must be at least 3 characters');
      return;
    }

    if (createForm.password.length < 6) {
      setMessage('Password must be at least 6 characters');
      return;
    }

    try {
      const response = await api.createUser(createForm);
      
      if (response.success) {
        setUsers(prev => [response.user, ...prev]);
        setCreateForm({ username: '', password: '', email: '', is_admin: false });
        setShowCreateUser(false);
        setMessage('User created successfully!');
      } else {
        setMessage(response.error || 'Failed to create user');
      }
    } catch (error) {
      console.error('User creation error:', error);
      setMessage('Error creating user');
    }
  };

  const handleAddProfileField = async (e) => {
    e.preventDefault();
    setMessage('');

    if (!fieldForm.key.trim() || !fieldForm.value.trim()) {
      setMessage('Key and value required');
      return;
    }

    try {
      const response = await api.updateProfileField(fieldForm.key, fieldForm.value);
      
      if (response.success) {
        setProfileFields(prev => ({ ...prev, [fieldForm.key]: fieldForm.value }));
        setFieldForm({ key: '', value: '' });
        setMessage('Profile field added successfully!');
      } else {
        setMessage(response.error || 'Failed to add profile field');
      }
    } catch (error) {
      console.error('Profile field error:', error);
      setMessage('Error adding profile field');
    }
  };

  const handleDeleteProfileField = async (key) => {
    if (!confirm(`Delete profile field "${key}"?`)) return;

    try {
      const response = await api.deleteProfileField(key);

      if (response.success) {
        setProfileFields(prev => {
          const newFields = { ...prev };
          delete newFields[key];
          return newFields;
        });
        setMessage('Profile field deleted successfully!');
      } else {
        setMessage(response.error || 'Failed to delete profile field');
      }
    } catch (error) {
      console.error('Profile field deletion error:', error);
      setMessage('Error deleting profile field');
    }
  };

  const handleDeleteUser = async (userId) => {
    const user = users.find(u => u.id === userId);
    if (!confirm(`Delete user "${user.username}"? This action cannot be undone.`)) return;

    try {
      const response = await api.deleteUser(userId);
      if (response.success) {
        setUsers(prev => prev.filter(u => u.id !== userId));
        setMessage('User deleted successfully!');
      } else {
        setMessage(response.error || 'Failed to delete user');
      }
    } catch (error) {
      console.error('Delete user error:', error);
      setMessage('Error deleting user');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();

    if (!newPassword || newPassword.length < 6) {
      setMessage('Password must be at least 6 characters');
      return;
    }

    try {
      const response = await api.resetUserPassword(resetPasswordUser.id, newPassword);
      if (response.success) {
        setMessage(`Password reset for ${resetPasswordUser.username}!`);
        setResetPasswordUser(null);
        setNewPassword('');
      } else {
        setMessage(response.error || 'Failed to reset password');
      }
    } catch (error) {
      console.error('Reset password error:', error);
      setMessage('Error resetting password');
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();

    try {
      const response = await api.updateUser(editingUser.id, {
        username: editingUser.username,
        email: editingUser.email,
        is_admin: editingUser.is_admin
      });

      if (response.success) {
        setUsers(prev => prev.map(u => u.id === editingUser.id ? response.user : u));
        setMessage(`User ${response.user.username} updated successfully!`);
        setEditingUser(null);
      } else {
        setMessage(response.error || 'Failed to update user');
      }
    } catch (error) {
      console.error('Update user error:', error);
      setMessage('Error updating user');
    }
  };

  const loadAvailableDates = async () => {
    try {
      const response = await api.getAvailableExportDates();
      setAvailableDates(response.dates || []);
    } catch (error) {
      console.error('Error loading available dates:', error);
    }
  };

  const loadRetentionSettings = async () => {
    try {
      const settings = await api.getRetentionSettings();
      setRetentionSettings(settings);
    } catch (error) {
      console.error('Error loading retention settings:', error);
    }
  };

  const handleDeleteSnapshot = async (date) => {
    if (!confirm(`Delete snapshot for ${date}? This cannot be undone.`)) return;

    try {
      const response = await api.deleteSnapshot(date);
      if (response.success) {
        setAvailableDates(response.dates);
        setMessage(`Deleted snapshot for ${date}`);
      } else {
        setMessage(response.error || 'Failed to delete snapshot');
      }
    } catch (error) {
      console.error('Error deleting snapshot:', error);
      setMessage('Error deleting snapshot');
    }
  };

  const handleUpdateRetentionSettings = async () => {
    try {
      const response = await api.updateRetentionSettings(
        retentionSettings.maxDays,
        retentionSettings.maxCount
      );
      if (response.success) {
        setAvailableDates(response.dates);
      }
    } catch (error) {
      console.error('Error updating retention settings:', error);
    }
  };

  const handleSaveSnapshot = async () => {
    try {
      const response = await api.saveSnapshot();
      if (response.success) {
        setMessage(`Snapshot saved for ${response.date}!`);
        loadAvailableDates(); // Refresh the list
      }
    } catch (error) {
      console.error('Error saving snapshot:', error);
      setMessage('Error saving snapshot');
    }
  };

  const handleDownloadRange = () => {
    if (!startDate || !endDate) {
      setMessage('Please select both start and end dates');
      return;
    }

    if (startDate > endDate) {
      setMessage('Start date must be before end date');
      return;
    }

    api.downloadDateRange(startDate, endDate);
    setMessage(`Downloading export from ${startDate} to ${endDate}...`);
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="container">
      <header>
        <div className="date-header">
          <h1 className="date-large">User Profile</h1>
        </div>
      </header>

      <div className="grid-layout">
        {/* Profile Edit */}
        <div className="card card-primary">
          <h2>👤 Edit Profile</h2>
          <p className="card-description">Update your account information</p>
          
          <form onSubmit={handleProfileUpdate} className="profile-form">
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                value={editForm.username}
                onChange={(e) => setEditForm(prev => ({ ...prev, username: e.target.value }))}
                placeholder="Username"
                minLength="3"
                required
              />
            </div>

            <div className="form-group">
              <label>Email</label>
              <input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="Email (optional)"
              />
            </div>

            <div className="form-group">
              <label>Current Password</label>
              <input
                type="password"
                value={editForm.currentPassword}
                onChange={(e) => setEditForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                placeholder="Current password (required for password change)"
              />
            </div>

            <div className="form-group">
              <label>New Password</label>
              <input
                type="password"
                value={editForm.newPassword}
                onChange={(e) => setEditForm(prev => ({ ...prev, newPassword: e.target.value }))}
                placeholder="New password (leave blank to keep current)"
                minLength="6"
              />
            </div>

            <div className="form-group">
              <label>Confirm New Password</label>
              <input
                type="password"
                value={editForm.confirmPassword}
                onChange={(e) => setEditForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                placeholder="Confirm new password"
                minLength="6"
              />
            </div>

            <button type="submit" className="btn btn-primary">
              Update Profile
            </button>
          </form>

          {message && (
            <div className="message">
              {message}
            </div>
          )}
        </div>

        {/* Profile Fields */}
        <div className="card card-primary">
          <h2>📝 Profile Fields</h2>
          <p className="card-description">Custom fields that get exported with your daily markdown files</p>
          
          {/* Add Field Form */}
          <form onSubmit={handleAddProfileField} className="profile-field-form">
            <h3>Add Field</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Field Name</label>
                <input
                  type="text"
                  value={fieldForm.key}
                  onChange={(e) => setFieldForm(prev => ({ ...prev, key: e.target.value }))}
                  placeholder="e.g., age, location, role"
                  required
                />
              </div>
              <div className="form-group">
                <label>Value</label>
                <input
                  type="text"
                  value={fieldForm.value}
                  onChange={(e) => setFieldForm(prev => ({ ...prev, value: e.target.value }))}
                  placeholder="e.g., 31, Denver, Developer"
                  required
                />
              </div>
              <button type="submit" className="btn btn-sm btn-primary">
                Add Field
              </button>
            </div>
          </form>

          {/* Existing Fields */}
          {Object.keys(profileFields).length > 0 && (
            <div className="profile-fields-list">
              <h3>Your Fields</h3>
              {Object.entries(profileFields).map(([key, value]) => (
                <div key={key} className="profile-field-item">
                  <div className="field-content">
                    <span className="field-key">{key}:</span>
                    <span className="field-value">{value}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteProfileField(key)}
                    className="btn-icon btn-icon-sm btn-danger"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {Object.keys(profileFields).length === 0 && (
            <div className="empty-state">No profile fields yet</div>
          )}
        </div>

        {/* Export History */}
        <div className="card card-success">
          <h2>📦 Export History</h2>
          <p className="card-description">Save daily snapshots and export data from past days</p>

          {/* Save Snapshot with Retention */}
          <div className="save-snapshot-section">
            <button onClick={handleSaveSnapshot} className="btn btn-success">
              💾 Save Today's Snapshot
            </button>
            <div className="retention-inline">
              <label>Keep last</label>
              <input
                type="number"
                min="0"
                value={retentionSettings.maxCount}
                onChange={(e) => setRetentionSettings(prev => ({
                  ...prev,
                  maxCount: parseInt(e.target.value) || 0
                }))}
                onBlur={handleUpdateRetentionSettings}
                className="retention-input"
                placeholder="100"
              />
              <label>snapshots</label>
              <small className="retention-hint">(set to 0 to keep all)</small>
            </div>
          </div>

          {/* Date Range Export */}
          <div className="export-section">
            <h3>Export Date Range</h3>
            <div className="date-range-form">
              <div className="form-group">
                <label>Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <button onClick={handleDownloadRange} className="btn btn-sm btn-success">
                📥 Download Range
              </button>
            </div>
          </div>

          {/* Available Dates */}
          {availableDates.length > 0 && (
            <div className="available-dates">
              <h3>Saved Snapshots ({availableDates.length})</h3>
              <div className="dates-list">
                {availableDates.map(date => (
                  <div key={date} className="date-item">
                    <span className="date-badge">📅 {date}</span>
                    <div className="date-actions">
                      <button
                        onClick={() => {
                          setStartDate(date);
                          setEndDate(date);
                        }}
                        className="btn btn-sm btn-success"
                        title="Select this date"
                      >
                        Select
                      </button>
                      <button
                        onClick={() => handleDeleteSnapshot(date)}
                        className="btn-icon btn-icon-sm btn-danger"
                        title="Delete snapshot"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {availableDates.length === 0 && (
            <div className="empty-state">
              No saved snapshots yet. Click "Save Today's Snapshot" to start building your export history.
            </div>
          )}
        </div>
      </div>

      {/* User Management (Admin Only) - Separate Section */}
      {currentUser && currentUser.is_admin && (
        <div className="card users-card admin-section">
          <div className="card-header-with-toggle">
            <div>
              <h2>👥 User Management</h2>
              <p className="description">Create and manage user accounts</p>
            </div>
            <button
              onClick={() => setShowUserManagement(!showUserManagement)}
              className="btn btn-sm btn-ghost"
              title={showUserManagement ? 'Hide user management' : 'Show user management'}
            >
              {showUserManagement ? '▼' : '▶'}
            </button>
          </div>

          {showUserManagement && (
            <>
              <button
                onClick={() => setShowCreateUser(!showCreateUser)}
                className="btn btn-sm btn-primary"
              >
                {showCreateUser ? 'Cancel' : 'Create New User'}
              </button>

          {showCreateUser && (
            <form onSubmit={handleCreateUser} className="create-user-form">
              <h3>Create New User</h3>

              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  value={createForm.username}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="Username"
                  minLength="3"
                  required
                />
              </div>

              <div className="form-group">
                <label>Password</label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Password"
                  minLength="6"
                  required
                />
              </div>

              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="Email (optional)"
                />
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={createForm.is_admin}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, is_admin: e.target.checked }))}
                  />
                  Admin User
                </label>
              </div>

              <button type="submit" className="btn btn-primary">
                Create User
              </button>
            </form>
          )}

          {/* Users List */}
          {users.length > 0 && (
            <div className="users-list">
              <h3>Existing Users</h3>
              {users.map((user) => (
                <div key={user.id} className="user-item">
                  <div className="user-info">
                    <strong>{user.username}</strong>
                    {user.email && <span className="user-email">{user.email}</span>}
                    <span className="user-date">
                      Created: {new Date(user.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="user-actions">
                    <span className={`user-role ${user.is_admin ? 'admin' : 'user'}`}>
                      {user.is_admin ? 'Admin' : 'User'}
                    </span>
                    <button
                      onClick={() => setEditingUser({...user})}
                      className="btn-icon btn-icon-sm btn-primary"
                      title="Edit user"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => {
                        setResetPasswordUser(user);
                        setNewPassword('');
                      }}
                      className="btn-icon btn-icon-sm btn-warning"
                      title="Reset password"
                    >
                      🔑
                    </button>
                    {user.id !== currentUser.id && (
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="btn-icon btn-icon-sm btn-danger"
                        title="Delete user"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Edit User Modal */}
          {editingUser && (
            <div className="modal-overlay" onClick={() => setEditingUser(null)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h3>Edit User: {editingUser.username}</h3>
                <form onSubmit={handleUpdateUser}>
                  <div className="form-group">
                    <label>Username</label>
                    <input
                      type="text"
                      value={editingUser.username}
                      onChange={(e) => setEditingUser(prev => ({ ...prev, username: e.target.value }))}
                      minLength="3"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Email</label>
                    <input
                      type="email"
                      value={editingUser.email || ''}
                      onChange={(e) => setEditingUser(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={editingUser.is_admin}
                        onChange={(e) => setEditingUser(prev => ({ ...prev, is_admin: e.target.checked }))}
                      />
                      Admin User
                    </label>
                  </div>
                  <div className="modal-buttons">
                    <button type="submit" className="btn btn-primary">Save Changes</button>
                    <button type="button" onClick={() => setEditingUser(null)} className="btn btn-secondary">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Reset Password Modal */}
          {resetPasswordUser && (
            <div className="modal-overlay" onClick={() => setResetPasswordUser(null)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h3>Reset Password: {resetPasswordUser.username}</h3>
                <form onSubmit={handleResetPassword}>
                  <div className="form-group">
                    <label>New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      minLength="6"
                      placeholder="Enter new password (min 6 characters)"
                      required
                    />
                  </div>
                  <div className="modal-buttons">
                    <button type="submit" className="btn btn-warning">Reset Password</button>
                    <button type="button" onClick={() => setResetPasswordUser(null)} className="btn btn-secondary">Cancel</button>
                  </div>
                </form>
              </div>
            </div>
          )}
            </>
          )}
        </div>
      )}
    </div>
  );
}