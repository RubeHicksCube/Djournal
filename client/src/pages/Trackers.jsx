import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { format } from 'date-fns';

export default function Trackers() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);

  // Time Since form
  const [timeSinceName, setTimeSinceName] = useState('');
  const [timeSinceDate, setTimeSinceDate] = useState('');

  // Duration form
  const [durationName, setDurationName] = useState('');
  const [manualTimeInput, setManualTimeInput] = useState({}); // For manually setting elapsed time per tracker
  const [showManualInput, setShowManualInput] = useState({}); // Track which tracker's manual input is shown
  const [currentTime, setCurrentTime] = useState(new Date());

  // Custom Counter form
  const [counterName, setCounterName] = useState('');

  useEffect(() => {
    loadState();
    // Set default date for time since picker
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
    setTimeSinceDate(dateStr);
    
    // Update time every second
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    // Refresh state every second to update timer displays
    const stateInterval = setInterval(() => {
      loadState();
    }, 1000);
    
    return () => {
      clearInterval(timeInterval);
      clearInterval(stateInterval);
    };
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

  const handleAddTimeSince = async (e) => {
    e.preventDefault();
    if (!timeSinceName.trim() || !timeSinceDate) return;

    try {
      const data = await api.addTimeSinceTracker(timeSinceName, timeSinceDate);
      setState(data);
      setTimeSinceName('');
      setTimeSinceDate('');
    } catch (error) {
      console.error('Error adding time-since tracker:', error);
    }
  };

  const handleDeleteTimeSince = async (id) => {
    try {
      const data = await api.deleteTimeSinceTracker(id);
      setState(data);
    } catch (error) {
      console.error('Error deleting time-since tracker:', error);
    }
  };

  const handleAddDuration = async (e) => {
    e.preventDefault();
    if (!durationName.trim()) return;

    try {
      const data = await api.updateDurationTracker(durationName);
      setState(data);
      setDurationName('');
    } catch (error) {
      console.error('Error adding duration tracker:', error);
    }
  };

  const handleSetManualTime = async (trackerId, timeInput) => {
    if (!timeInput || !timeInput.trim()) return;

    try {
      let totalSeconds = 0;

      // Parse HH:MM format (e.g., "4:30" or "04:30" or "1:15")
      if (timeInput.includes(':')) {
        const parts = timeInput.split(':');
        const hours = parseInt(parts[0]) || 0;
        const minutes = parseInt(parts[1]) || 0;
        totalSeconds = (hours * 3600) + (minutes * 60);
      } else {
        // If just a number, treat as hours
        const hours = parseFloat(timeInput) || 0;
        totalSeconds = hours * 3600;
      }

      if (totalSeconds <= 0) return;

      // Convert to milliseconds
      const elapsedMs = totalSeconds * 1000;
      // Create a fake start time that results in the desired elapsed time
      const startTime = new Date(Date.now() - elapsedMs);

      const response = await fetch('/api/trackers/manual-time', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({ trackerId, startTime, elapsedMs })
      });

      const data = await response.json();
      if (response.ok) {
        setState(data);
        setManualTimeInput(prev => ({ ...prev, [trackerId]: '' }));
        setShowManualInput(prev => ({ ...prev, [trackerId]: false }));
      }
    } catch (error) {
      console.error('Error setting manual time:', error);
    }
  };

  const handleDeleteDuration = async (id) => {
    try {
      const data = await api.deleteDurationTracker(id);
      setState(data);
    } catch (error) {
      console.error('Error deleting duration tracker:', error);
    }
  };

  const formatDate = (dateStr) => {
  const date = new Date(dateStr);
  return format(date, 'yyyy-MMM-dd');
};

const calculateDaysSince = (date) => {
    const then = new Date(date);
    const now = new Date();
    let diffMinutes = Math.floor((now - then) / (1000 * 60)); // total minutes

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

    // Build string with non-zero values (no seconds)
    const parts = [];
    if (years > 0) parts.push(`${years}y`);
    if (months > 0) parts.push(`${months}mo`);
    if (weeks > 0) parts.push(`${weeks}w`);
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

    return parts.join(' ') + ' ago';
  };

  const calculateElapsedTime = (tracker) => {
    if (tracker.type !== 'timer') return null;

    let elapsedMs = 0;

    // Add stored elapsed time
    if (tracker.elapsedMs) {
      elapsedMs = tracker.elapsedMs;
    }

    // Add current running time if timer is active
    if (tracker.isRunning && tracker.startTime) {
      const startTimeMs = new Date(tracker.startTime).getTime();
      if (!isNaN(startTimeMs)) {
        elapsedMs += Date.now() - startTimeMs;
      }
    }

    const totalSeconds = Math.floor(elapsedMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleStartTimer = async (id) => {
    try {
      const data = await api.startTimer(id);
      setState(data);
    } catch (error) {
      console.error('Error starting timer:', error);
    }
  };

  const handleStopTimer = async (id) => {
    try {
      const data = await api.stopTimer(id);
      setState(data);
    } catch (error) {
      console.error('Error stopping timer:', error);
    }
  };

  const handleResetTimer = async (id) => {
    try {
      const data = await api.resetTimer(id);
      setState(data);
    } catch (error) {
      console.error('Error resetting timer:', error);
    }
  };


  const handleCreateCustomCounter = async (e) => {
    e.preventDefault();
    if (!counterName.trim()) return;

    try {
      const data = await api.createCustomCounter(counterName);
      setState(data);
      setCounterName('');
    } catch (error) {
      console.error('Error creating custom counter:', error);
    }
  };

  const handleIncrementCustomCounter = async (id) => {
    try {
      const data = await api.incrementCounter(id);
      setState(data);
    } catch (error) {
      console.error('Error incrementing counter:', error);
    }
  };

  const handleDecrementCustomCounter = async (id) => {
    try {
      const data = await api.decrementCounter(id);
      setState(data);
    } catch (error) {
      console.error('Error decrementing counter:', error);
    }
  };

  const handleDeleteCustomCounter = async (id) => {
    try {
      const data = await api.deleteCustomCounter(id);
      setState(data);
    } catch (error) {
      console.error('Error deleting counter:', error);
    }
  };

  const handleSetCounterValue = async (id, value) => {
    const numValue = parseInt(value);
    if (isNaN(numValue) || numValue < 0) return;

    try {
      const data = await api.setCounter(id, numValue);
      setState(data);
    } catch (error) {
      console.error('Error setting counter value:', error);
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
        <div className="card card-warning">
          <h2>⏱️ Time Since</h2>
          <p className="card-description">Track how many days since an event occurred</p>

          <form onSubmit={handleAddTimeSince} className="tracker-form">
            <input
              type="text"
              className="form-input"
              placeholder="Event name (e.g., 'Last workout')"
              value={timeSinceName}
              onChange={(e) => setTimeSinceName(e.target.value)}
            />
            <input
              type="datetime-local"
              className="form-input"
              value={timeSinceDate}
              onChange={(e) => setTimeSinceDate(e.target.value)}
            />
            <button type="submit" className="btn btn-sm btn-warning">Add</button>
          </form>

          {state.timeSinceTrackers.length > 0 && (
            <div className="trackers-list">
              {state.timeSinceTrackers.map((tracker) => (
                <div key={tracker.id} className="tracker-item time-since-item">
                  <div className="tracker-info">
                    <strong>{tracker.name}</strong>
                    <span className="tracker-detail">
                      {tracker.date} • {calculateDaysSince(tracker.date)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteTimeSince(tracker.id)}
                    className="btn-icon btn-icon-sm btn-danger"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {state.timeSinceTrackers.length === 0 && (
            <div className="empty-state">No time trackers yet</div>
          )}
        </div>

        <div className="card card-success">
          <h2>⏳ Activity Duration</h2>
          <p className="card-description">Track activities with timers</p>

          <form onSubmit={handleAddDuration} className="tracker-form">
            <input
              type="text"
              className="form-input"
              placeholder="Activity name (e.g., 'Workout')"
              value={durationName}
              onChange={(e) => setDurationName(e.target.value)}
            />
            <button type="submit" className="btn btn-sm btn-success">Add Timer</button>
          </form>

          {state.durationTrackers.length > 0 && (
            <div className="trackers-list">
              {state.durationTrackers.map((tracker) => (
                <div key={tracker.id} className="tracker-item duration-item">
                  <div className="tracker-info">
                    <strong>{tracker.name}</strong>
                    <span className="tracker-detail">
                      <span className="timer-display">
                        ⏱️ {calculateElapsedTime(tracker)}
                      </span>
                    </span>
                  </div>
                  <div className="tracker-controls">
                    <div className="timer-controls">
                      <button
                        onClick={() => tracker.isRunning ? handleStopTimer(tracker.id) : handleStartTimer(tracker.id)}
                        className={`btn btn-sm ${tracker.isRunning ? 'btn-danger' : 'btn-success'}`}
                      >
                        {tracker.isRunning ? '⏸️' : '▶️'}
                      </button>
                      <button
                        onClick={() => handleResetTimer(tracker.id)}
                        className="btn btn-sm btn-secondary"
                      >
                        🔄
                      </button>
                      <button
                        onClick={() => setShowManualInput(prev => ({ ...prev, [tracker.id]: !prev[tracker.id] }))}
                        className="btn btn-sm btn-primary"
                        title="Set manual time"
                      >
                        ⏱️
                      </button>
                    </div>
                    {showManualInput[tracker.id] && (
                      <div className="manual-time-input">
                        <input
                          type="text"
                          placeholder="H:MM (e.g., 4:30 or 1:15)"
                          value={manualTimeInput[tracker.id] || ''}
                          onChange={(e) => setManualTimeInput(prev => ({ ...prev, [tracker.id]: e.target.value }))}
                          className="form-input form-input-sm"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleSetManualTime(tracker.id, manualTimeInput[tracker.id]);
                            }
                          }}
                        />
                        <button
                          onClick={() => handleSetManualTime(tracker.id, manualTimeInput[tracker.id])}
                          className="btn btn-sm btn-success"
                          title="Set time"
                        >
                          Set
                        </button>
                        <button
                          onClick={() => {
                            setShowManualInput(prev => ({ ...prev, [tracker.id]: false }));
                            setManualTimeInput(prev => ({ ...prev, [tracker.id]: '' }));
                          }}
                          className="btn btn-sm btn-secondary"
                          title="Cancel"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    <button
                      onClick={() => handleDeleteDuration(tracker.id)}
                      className="btn-icon btn-icon-sm btn-danger"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {state.durationTrackers.length === 0 && (
            <div className="empty-state">No duration trackers yet</div>
          )}
        </div>

        <div className="card card-primary">
          <h2>🔢 Custom Counters</h2>
          <p className="card-description">Track daily counts (water, coffee, calories, etc.)</p>

          <form onSubmit={handleCreateCustomCounter} className="tracker-form-vertical">
            <input
              type="text"
              className="form-input"
              placeholder="Counter name (e.g., 'Cups of Water', 'Coffees')"
              value={counterName}
              onChange={(e) => setCounterName(e.target.value)}
            />
            <button type="submit" className="btn btn-sm btn-success">Add Counter</button>
          </form>

          {state.customCounters && state.customCounters.length > 0 && (
            <div className="trackers-list">
              {state.customCounters.map((counter) => (
                <div key={counter.id} className="tracker-item counter-item">
                  <div className="tracker-info">
                    <strong>{counter.name}</strong>
                    <input
                      type="number"
                      className="counter-value-input"
                      value={counter.value}
                      onChange={(e) => handleSetCounterValue(counter.id, e.target.value)}
                      onBlur={(e) => handleSetCounterValue(counter.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSetCounterValue(counter.id, e.target.value);
                          e.target.blur();
                        }
                      }}
                      min="0"
                      style={{ width: '80px', textAlign: 'center', fontSize: '1.5rem', fontWeight: 'bold' }}
                    />
                  </div>
                  <div className="tracker-controls">
                    <div className="counter-controls-large">
                      <button
                        onClick={() => handleDecrementCustomCounter(counter.id)}
                        className="btn btn-sm btn-danger"
                      >
                        −
                      </button>
                      <button
                        onClick={() => handleIncrementCustomCounter(counter.id)}
                        className="btn btn-sm btn-success"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => handleDeleteCustomCounter(counter.id)}
                      className="btn-icon btn-icon-sm btn-danger"
                      title="Delete counter"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {(!state.customCounters || state.customCounters.length === 0) && (
            <div className="empty-state">No custom counters yet</div>
          )}
        </div>
      </div>
    </div>
  );
}
