import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { format } from 'date-fns';

const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return format(date, 'yyyyMMMdd');
};

export default function Home() {
  const [state, setState] = useState(null);
  const [entryText, setEntryText] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Template custom field form (persist name, reset value daily)
  const [templateFieldKey, setTemplateFieldKey] = useState('');

  // Daily custom field form (non-persistent)
  const [dailyFieldKey, setDailyFieldKey] = useState('');
  const [dailyFieldValue, setDailyFieldValue] = useState('');

  // Daily task form
  const [dailyTaskText, setDailyTaskText] = useState('');

  // Image attachment
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  useEffect(() => {
    loadState();
    
    // Update time every second
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => clearInterval(timeInterval);
  }, []);

  const loadState = async () => {
    try {
      const data = await api.getState();
      setState(data);
      setLoading(false);
    } catch (error) {
      console.error('Error loading state:', error);
      setLoading(false);
    }
  };

  const updateDaily = async (field, value) => {
    // Prevent unnecessary updates if value hasn't actually changed
    if (state[field] === value) return;
    
    // Handle time input digit conversion for time fields
    if (value && (field === 'previousBedtime' || field === 'wakeTime')) {
      // Convert digit input like "554" to proper HH:MM format
      if (/^\d+$/.test(value)) {
        const numStr = value.toString().padStart(4, '0');
        if (numStr.length <= 4) {
          // "54" -> "00:54", "554" -> "05:54"
          const hours = numStr.slice(0, 2);
          const minutes = numStr.slice(2, 4);
          value = `${hours}:${minutes}`;
        } else if (numStr.length === 3) {
          // "554" -> "05:54" 
          value = `0${numStr.slice(0, 1)}:${numStr.slice(1)}`;
        } else if (numStr.length >= 4) {
          // "1234" -> "12:34"
          value = `${numStr.slice(0, 2)}:${numStr.slice(2, 4)}`;
        }
      }
    }
    
    try {
      const data = await api.updateDaily({ [field]: value });
      setState(data);
    } catch (error) {
      console.error('Error updating daily data:', error);
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check file size (20MB limit)
    if (file.size > 20 * 1024 * 1024) {
      alert('Image size must be under 20MB');
      return;
    }

    // Check file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result;
      setSelectedImage(base64String);
      setImagePreview(base64String);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
  };

  const handleSubmitEntry = async (e) => {
    e.preventDefault();
    if (!entryText.trim()) return;

    try {
      const data = await api.addEntry(entryText, selectedImage);
      setState(data);
      setEntryText('');
      setSelectedImage(null);
      setImagePreview(null);
      // Reset file input
      const fileInput = document.getElementById('entry-image-input');
      if (fileInput) fileInput.value = '';
    } catch (error) {
      console.error('Error adding entry:', error);
      alert(error.message || 'Error adding entry');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitEntry(e);
    }
  };

  const handleCreateTemplateField = async (e) => {
    e.preventDefault();
    if (!templateFieldKey.trim()) return;

    try {
      const response = await api.createCustomFieldTemplate(templateFieldKey);
      setState(response.state);
      setTemplateFieldKey('');
    } catch (error) {
      console.error('Error creating template field:', error);
    }
  };

  const handleUpdateTemplateFieldValue = async (key, value) => {
    try {
      const data = await api.updateCustomFieldValue(key, value);
      setState(data);
    } catch (error) {
      console.error('Error updating field value:', error);
    }
  };

  const handleDeleteTemplateField = async (id) => {
    try {
      const response = await api.deleteCustomFieldTemplate(id);
      setState(response.state);
    } catch (error) {
      console.error('Error deleting template field:', error);
    }
  };

  const handleAddDailyCustomField = async (e) => {
    e.preventDefault();
    if (!dailyFieldKey.trim() || !dailyFieldValue.trim()) return;

    try {
      const data = await api.addDailyCustomField(dailyFieldKey, dailyFieldValue);
      setState(data);
      setDailyFieldKey('');
      setDailyFieldValue('');
    } catch (error) {
      console.error('Error adding daily custom field:', error);
    }
  };

  const handleDeleteDailyCustomField = async (id) => {
    try {
      const data = await api.deleteDailyCustomField(id);
      setState(data);
    } catch (error) {
      console.error('Error deleting daily custom field:', error);
    }
  };

  const handleAddDailyTask = async (e) => {
    e.preventDefault();
    if (!dailyTaskText.trim()) return;

    try {
      const data = await api.addDailyTask(dailyTaskText);
      setState(data);
      setDailyTaskText('');
    } catch (error) {
      console.error('Error adding daily task:', error);
    }
  };

  const handleToggleDailyTask = async (id) => {
    try {
      const data = await api.toggleDailyTask(id);
      setState(data);
    } catch (error) {
      console.error('Error toggling daily task:', error);
    }
  };

  const handleDeleteDailyTask = async (id) => {
    try {
      const data = await api.deleteDailyTask(id);
      setState(data);
    } catch (error) {
      console.error('Error deleting daily task:', error);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="container">
      <header>
        <div className="date-header">
          <h1 className="date-large">{formatDate(state.date)}</h1>
          <p className="time-large">{currentTime.toLocaleTimeString('en-US', { hour12: false })}</p>
        </div>
      </header>

      <div className="grid-layout">
        <div className="card card-primary">
          <h2>⏰ Daily Data</h2>
          <p className="card-description">Sleep schedule tracking</p>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Previous Day Bedtime</label>
              <input
                type="time"
                  className="form-input"
                  value={state.previousBedtime || ''}
                  onChange={(e) => updateDaily('previousBedtime', e.target.value)}
                />
            </div>

            <div className="form-group">
              <label className="form-label">Today's Wake Time</label>
              <input
                type="time"
                  className="form-input"
                  value={state.wakeTime || ''}
                  onChange={(e) => updateDaily('wakeTime', e.target.value)}
                />
            </div>
          </div>
        </div>

        <div className="card card-primary">
          <h2>📋 Template Custom Fields</h2>
          <p className="card-description">Create fields that persist daily - values reset each day</p>

          <form onSubmit={handleCreateTemplateField} className="custom-field-form">
            <input
              type="text"
              className="form-input"
              placeholder="Field name (e.g., Mood, Energy Level)"
              value={templateFieldKey}
              onChange={(e) => setTemplateFieldKey(e.target.value)}
            />
            <button type="submit" className="btn btn-sm btn-primary">Create Template</button>
          </form>

          {state.customFields && state.customFields.length > 0 && (
            <div className="custom-fields-list">
              {state.customFields.map((field) => (
                <div key={field.id} className="custom-field-item template-field">
                  <div className="field-content">
                    <span className="field-key">{field.key}:</span>
                    <input
                      type="text"
                      className="field-value-input"
                      value={field.value}
                      onChange={(e) => handleUpdateTemplateFieldValue(field.key, e.target.value)}
                      placeholder="Enter value"
                    />
                  </div>
                  <button
                    onClick={() => handleDeleteTemplateField(field.id)}
                    className="btn-icon btn-icon-sm btn-danger"
                    title="Delete template"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card card-warning">
          <h2>📝 Daily Custom Fields & Tasks</h2>
          <p className="card-description">One-time fields and to-do tasks for today</p>

          {/* Daily Tasks Section */}
          <div className="tasks-section">
            <h3>✓ Tasks</h3>
            <form onSubmit={handleAddDailyTask} className="task-form">
              <input
                type="text"
                placeholder="Add a task..."
                value={dailyTaskText}
                onChange={(e) => setDailyTaskText(e.target.value)}
                className="form-input"
              />
              <button type="submit" className="btn btn-sm btn-warning">+ Add</button>
            </form>

            {state.dailyTasks && state.dailyTasks.length > 0 && (
              <div className="tasks-list">
                {state.dailyTasks.map((task) => (
                  <div key={task.id} className="task-item">
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => handleToggleDailyTask(task.id)}
                      className="task-checkbox"
                    />
                    <span className={`task-text ${task.completed ? 'completed' : ''}`}>
                      {task.text}
                    </span>
                    <button
                      onClick={() => handleDeleteDailyTask(task.id)}
                      className="btn-icon btn-icon-sm btn-danger"
                      title="Delete task"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Daily Fields Section */}
          <div className="fields-section">
            <h3>Custom Fields</h3>
            <form onSubmit={handleAddDailyCustomField} className="custom-field-form">
              <input
                type="text"
                className="form-input"
                placeholder="Field name"
                value={dailyFieldKey}
                onChange={(e) => setDailyFieldKey(e.target.value)}
              />
              <input
                type="text"
                className="form-input"
                placeholder="Value"
                value={dailyFieldValue}
                onChange={(e) => setDailyFieldValue(e.target.value)}
              />
              <button type="submit" className="btn btn-sm btn-warning">Add Field</button>
            </form>

            {state.dailyCustomFields && state.dailyCustomFields.length > 0 && (
              <div className="custom-fields-list">
                {state.dailyCustomFields.map((field) => (
                  <div key={field.id} className="custom-field-item">
                    <div className="field-content">
                      <span className="field-key">{field.key}:</span>
                      <span className="field-value">{field.value}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteDailyCustomField(field.id)}
                      className="btn-icon btn-icon-sm btn-danger"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card card-primary">
        <h2>Activity Entry</h2>
        <p className="card-description">Enter to submit, Shift+Enter for new line</p>
        <form onSubmit={handleSubmitEntry}>
          <textarea
            value={entryText}
            onChange={(e) => setEntryText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What are you doing right now?"
            rows="3"
            className="form-textarea"
          />

          {/* Image attachment */}
          <div className="image-attachment-section">
            <label htmlFor="entry-image-input" className="btn btn-sm btn-secondary">
              📷 Attach Image
            </label>
            <input
              id="entry-image-input"
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              style={{ display: 'none' }}
            />
            {imagePreview && (
              <div className="image-preview">
                <img src={imagePreview} alt="Preview" />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="btn-icon btn-icon-sm btn-danger"
                  title="Remove image"
                >
                  ×
                </button>
              </div>
            )}
          </div>

          <button type="submit" className="btn btn-primary">
            Submit Entry
          </button>
        </form>
      </div>

      {state.entries.length > 0 && (
        <div className="card">
          <h2>Today's Entries ({state.entries.length})</h2>
          <div className="entries-list">
            {state.entries.slice().reverse().map((entry) => (
              <div key={entry.id} className="entry-item">
                <div className="entry-content">
                  <span className="entry-time">{entry.timestamp}</span>
                  <span className="entry-text">{entry.text}</span>
                  {entry.image && (
                    <div className="entry-image">
                      <img src={entry.image} alt="Entry attachment" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
