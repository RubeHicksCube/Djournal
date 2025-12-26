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
  const [durationMinutes, setDurationMinutes] = useState('');
  const [durationType, setDurationType] = useState('counter'); // 'timer' or 'counter'
  const [manualTimeInput, setManualTimeInput] = useState(''); // For manually setting elapsed time
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
      const data = await api.updateDurationTracker(durationName, durationType);
      setState(data);
      setDurationName('');
      setDurationMinutes('');
      setManualTimeInput('');
    } catch (error) {
      console.error('Error adding duration tracker:', error);
    }
  };

  const handleSetManualTime = async (trackerId, minutes) => {
    if (!minutes || minutes <= 0) return;
    
    try {
      // Convert minutes to milliseconds and set as elapsed time
      const elapsedMs = minutes * 60 * 1000;
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
        setManualTimeInput('');
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
  return format(date, 'yyyyMMMdd');
};

const calculateDaysSince = (date) => {
    const then = new Date(date);
    const now = new Date();
    const diffTime = Math.abs(now - then);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffTime % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffDays > 0) {
      return `${diffDays}d ${diffHours}h ${diffMinutes}m ago`;
    } else if (diffHours > 0) {
      return `${diffHours}h ${diffMinutes}m ago`;
    } else {
      return `${diffMinutes}m ago`;
    }
  };

  const calculateElapsedTime = (tracker) => {
    if (tracker.type !== 'timer') return null;
    
    let elapsedMs = tracker.elapsedMs || 0;
    if (tracker.isRunning && tracker.startTime) {
      elapsedMs += Date.now() - new Date(tracker.startTime).getTime();
    }
    
    const minutes = Math.floor(elapsedMs / 60000);
    const seconds = Math.floor((elapsedMs % 60000) / 1000);
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

  const handleIncrementCounter = async (id) => {
    try {
      const data = await api.incrementCounter(id);
      setState(data);
    } catch (error) {
      console.error('Error incrementing counter:', error);
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
                      {tracker.date} • {calculateDaysSince(tracker.date)} days ago
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
          <p className="card-description">Track activities with timers or counters</p>

          <form onSubmit={handleAddDuration} className="tracker-form">
            <input
              type="text"
              className="form-input"
              placeholder="Activity name (e.g., 'Workout', 'Pushups')"
              value={durationName}
              onChange={(e) => setDurationName(e.target.value)}
            />
            <select
              value={durationType}
              onChange={(e) => setDurationType(e.target.value)}
              className="form-select"
            >
              <option value="counter">Counter (reps, sets)</option>
              <option value="timer">Timer (stopwatch)</option>
            </select>
            <button type="submit" className="btn btn-sm btn-success">Add</button>
          </form>

          {state.durationTrackers.length > 0 && (
            <div className="trackers-list">
              {state.durationTrackers.map((tracker) => (
                <div key={tracker.id} className="tracker-item duration-item">
                  <div className="tracker-info">
                    <strong>{tracker.name}</strong>
                    <span className="tracker-detail">
                      {tracker.type === 'timer' ? (
                        <span className="timer-display">
                          ⏱️ {calculateElapsedTime(tracker)}
                        </span>
                      ) : (
                        <span className="counter-display">
                          🔢 {tracker.count || 0}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="tracker-controls">
                    {tracker.type === 'timer' ? (
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
                        <div className="manual-time-input">
                          <input
                            type="number"
                            placeholder="Min"
                            min="1"
                            value={manualTimeInput}
                            onChange={(e) => setManualTimeInput(e.target.value)}
                            className="form-input form-input-sm"
                          />
                          <button
                            onClick={() => handleSetManualTime(tracker.id, parseInt(manualTimeInput))}
                            className="btn btn-sm btn-primary"
                            title="Set manual time spent"
                          >
                            ⏱️ Set
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="counter-controls">
                        <button
                          onClick={() => handleIncrementCounter(tracker.id)}
                          className="btn btn-sm btn-success"
                        >
                          +1
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

          <form onSubmit={handleCreateCustomCounter} className="tracker-form">
            <input
              type="text"
              className="form-input"
              placeholder="Counter name (e.g., 'Cups of Water', 'Coffees')"
              value={counterName}
              onChange={(e) => setCounterName(e.target.value)}
            />
            <button type="submit" className="btn btn-sm btn-primary">Create Counter</button>
          </form>

          {state.customCounters && state.customCounters.length > 0 && (
            <div className="trackers-list">
              {state.customCounters.map((counter) => (
                <div key={counter.id} className="tracker-item counter-item">
                  <div className="tracker-info">
                    <strong>{counter.name}</strong>
                    <span className="counter-display-large">
                      {counter.value}
                    </span>
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
