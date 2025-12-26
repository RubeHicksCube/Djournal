# AGENTS.md

This file provides guidance for agentic coding agents working with the AI Life codebase.

## Development Commands

### Initial Setup
```bash
npm install                # Install server dependencies
cd client && npm install   # Install client dependencies
npm run init-db           # Initialize database with user profile
npm run seed-topics        # Seed therapeutic topics
npm run seed-life          # Seed life coaching topics
```

### Development
```bash
npm run dev               # Run both server (port 3001) and client (port 3000)
npm run server:dev        # Run server only with nodemon
npm run client:dev        # Run client only with Vite
```

### Production
```bash
npm run build            # Build React frontend
npm start                # Start production server
```

### Docker
```bash
npm run docker:build      # Build Docker image
npm run docker:run        # Run Docker container (port 8000)
npm run docker:stop       # Stop and remove container
```

### Testing
**No test framework currently configured**. When adding tests:
- Use Jest for backend unit tests (`npm install --save-dev jest`)
- Use Vitest for frontend tests (already available with Vite)
- Place tests in `server/tests/` and `client/tests/` directories
- Create test configuration files as needed

#### Running Single Tests (when implemented)
```bash
# Backend (Jest)
npm test -- path/to/test.test.js
npm test -- --testNamePattern="specific test"

# Frontend (Vitest)
cd client && npm test path/to/test.test.js
cd client && npm test -- -t "specific test"
```

### Linting/Type Checking
**No linting tools currently configured**. Consider adding:
- ESLint for code quality (`npm install --save-dev eslint`)
- Prettier for formatting (`npm install --save-dev prettier`)

## Code Style Guidelines

### Import Organization
**Backend (CommonJS):**
```javascript
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
```

**Frontend (ES Modules):**
```javascript
import React, { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../services/api';
```

### Naming Conventions
- **Variables**: camelCase (`todayState`, `customFields`)
- **Functions**: camelCase (`checkAndResetDay`, `generateMarkdown`)
- **Constants**: UPPER_SNAKE_CASE (`PORT`, `NODE_ENV`)
- **Files**: PascalCase for components (`Home.jsx`), camelCase for utilities (`api.js`)
- **Routes**: kebab-case (`/api/state`, `/api/daily`)

### TypeScript
**This codebase uses plain JavaScript, not TypeScript**. All files are `.js` or `.jsx`.

### Error Handling
- Always use try/catch blocks for async operations
- Log errors with `console.error()` for debugging
- Return meaningful error responses from API endpoints
- Frontend should show user-friendly error messages

```javascript
// Backend pattern
try {
  const result = await someOperation();
  res.json(result);
} catch (error) {
  console.error('Operation failed:', error);
  res.status(500).json({ error: 'Operation failed' });
}

// Frontend pattern
try {
  const data = await api.someOperation();
  setState(data);
} catch (error) {
  console.error('Error loading data:', error);
  // Optionally show user feedback
}
```

### React Component Patterns
- Use functional components with hooks only (no class components)
- Keep state management simple with `useState`
- Use `useEffect` for side effects and data loading
- Follow the existing pattern of self-contained pages
- Always export as `export default function ComponentName()`

```javascript
export default function ComponentName() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const data = await api.getData();
      setState(data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;
  return <div>{/* JSX content */}</div>;
}
```

### API Design
- Use RESTful conventions
- Return JSON responses
- Include proper HTTP status codes
- All API routes prefixed with `/api`
- Use descriptive route names

```javascript
// GET /api/profile - Retrieve user profile
// GET /api/health - Retrieve health metrics
// POST /api/journal - Create journal entry
// GET /api/insights - Get therapeutic prompts
// DELETE /api/trackers/:id - Remove tracker
```

### Database/Storage Patterns
- SQLite database for structured data (health metrics, profile, goals, etc.)
- Markdown files for journal entries (stored in `journal/` directory as `YYYY-MM-DD.md`)
- Use `better-sqlite3` for database operations
- Human-readable journal format with optional YAML frontmatter

### File Structure
```
server/
├── index.js           # Main server entry
├── routes/            # API route handlers
├── models/            # Data models and utilities
└── scripts/           # Database initialization and seeding

client/
├── src/
│   ├── main.jsx       # React entry point
│   ├── App.jsx        # Main app component
│   ├── pages/         # Page components
│   ├── services/      # API client
│   └── components/    # Reusable components
└── dist/              # Build output

data/
└── ailife.db          # SQLite database

journal/
└── *.md               # Journal entries (YYYY-MM-DD.md)
```

### State Management
- Server: SQLite database with better-sqlite3
- Client: Local component state with `useState`
- No global state management (Redux, Context, etc.)
- Direct API calls for data synchronization

### Date/Time Handling
- Use `new Date().toISOString().split('T')[0]` for date strings
- Use `toLocaleTimeString()` for human-readable times
- Store dates in ISO format for consistency
- Calculate time differences using Date objects

### Code Organization Principles
- Keep functions small and focused
- Use descriptive variable and function names
- Group related functionality together
- Maintain separation of concerns (UI, API, data)
- Follow existing patterns rather than introducing new ones

### Security Considerations
- No authentication needed (single-user local system)
- Validate input data on server side
- Sanitize user-generated content before export
- Use environment variables for configuration

### Performance Guidelines
- Minimize re-renders by proper state management
- Use loading states for better UX
- Debounce user input where appropriate
- Keep API responses lightweight

### Date/Time Handling
- Use `new Date().toISOString().split('T')[0]` for date strings
- Use `toLocaleTimeString()` for human-readable times
- Store dates in ISO format for consistency
- Calculate time differences using Date objects

### Code Organization Principles
- Keep functions small and focused
- Use descriptive variable and function names
- Group related functionality together
- Maintain separation of concerns (UI, API, data)
- Follow existing patterns rather than introducing new ones

### Security Considerations
- No authentication needed (single-user local system)
- Validate input data on server side
- Sanitize user-generated content before export
- Use environment variables for configuration

### Performance Guidelines
- Minimize re-renders by proper state management
- Use loading states for better UX
- Debounce user input where appropriate
- Keep API responses lightweight

### Date/Time Handling
- Use `new Date().toISOString().split('T')[0]` for date strings
- Use `toLocaleTimeString()` for human-readable times
- Store dates in ISO format for consistency
- Calculate time differences using Date objects

### Code Organization Principles
- Keep functions small and focused
- Use descriptive variable and function names
- Group related functionality together
- Maintain separation of concerns (UI, API, data)
- Follow existing patterns rather than introducing new ones

### Security Considerations
- No authentication needed (single-user local system)
- Validate input data on server side
- Sanitize user-generated content before export
- Use environment variables for configuration

### Performance Guidelines
- Minimize re-renders by proper state management
- Use loading states for better UX
- Debounce user input where appropriate
- Keep API responses lightweight

## Important Context

This is a single-user personal life management system combining health tracking, therapeutic journaling, and life coaching. It's designed for a 31-year-old E6 Tech Sergeant in Space Force, married with infant son, to track health metrics and manage life goals.

**Key Features**:
- Health metrics tracking (sleep, heart rate, alcohol, exercise, mood, energy, stress)
- Journal entries stored as Markdown files
- Therapeutic prompts and life insights
- Goals and progress tracking
- Events and contacts management
- Custom field support

**Health Context**: User has history of perimyocarditis (2022), takes bupropion 300mg, has elevated cholesterol, Terry's nails, and variable alcohol consumption.

**Architecture**: Hybrid storage approach using SQLite for structured data and Markdown files for journal entries. No authentication needed (single-user local system).