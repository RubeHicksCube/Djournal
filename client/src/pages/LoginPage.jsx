import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';

export default function LoginPage() {
  useEffect(() => {
    // Import login-specific styles
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/login.css';
    document.head.appendChild(link);
    
    // Cleanup on unmount
    return () => {
      document.head.removeChild(link);
    };
  }, []);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password })
      });
      
      const data = await response.json();
      
      if (data.success) {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        window.location.href = '/';
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (error) {
      setError('Network error. Please try again.');
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
            <h1 className="login-title">Log</h1>
            <p className="login-subtitle">Sign in to access your activity log</p>
            
            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-group">
                <label htmlFor="username">Username or Email</label>
                <input 
                  type="text" 
                  id="username" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required 
                  placeholder="Enter your username or email"
                />
              </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input 
              type="password" 
              id="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
              placeholder="Enter your password"
            />
          </div>
          
          <button type="submit" className="btn-login">
            Sign In
          </button>
        </form>
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}