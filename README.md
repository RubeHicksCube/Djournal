# Djournal - Daily Journal v1.0.0

A simple, self-hosted daily journal application for logging activities minute-by-minute and exporting to your favorite second-brain apps.

## ✨ Features

- **Health Metrics Tracking**: Sleep, heart rate, alcohol consumption, exercise, mood, energy, and stress levels
- **Daily Journaling**: Markdown-based journal entries with automatic date organization
- **User Management**: Built-in authentication with admin controls for multi-user support
- **Data Export**: Export your data as Markdown or PDF files for backup and analysis
- **Responsive Design**: Works seamlessly on desktop and mobile devices
- **Docker Ready**: Easy deployment with Docker Compose

## 🚀 Quick Start (Docker Compose)

The easiest way to get Djournal running is with Docker Compose:

```bash
# Clone the repository
git clone https://github.com/RubeHicksCube/Djournal.git
cd Djournal

# Start the application
docker-compose up -d

# Access the application
# Open http://localhost:8001 in your browser
```

**Default Login Credentials:**
- Username: `admin`
- Password: `admin123`

> ⚠️ **Important**: Change the default password and JWT secret after first login for security.

## 📋 Requirements

- Docker and Docker Compose (recommended)
- OR Node.js 18+ and npm

## 🔧 Manual Installation

### Without Docker

```bash
# Clone the repository
git clone https://github.com/RubeHicksCube/Djournal.git
cd Djournal

# Install dependencies
npm install

# Build React client
npm run build

# Start the application
npm start
```

The application will be available at `http://localhost:8000` (production) or `http://localhost:8001` (development).

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory:

```env
# Application
NODE_ENV=production
PORT=8000

# Security
ADMIN_PASSWORD=your-secure-password
JWT_SECRET=your-jwt-secret-key-at-least-32-characters-long

# Optional: Custom admin username
ADMIN_USERNAME=admin
```

### Docker Compose Configuration

Copy `docker-compose.yml` and customize the environment variables:

```yaml
environment:
  - ADMIN_PASSWORD=your-secure-password
  - JWT_SECRET=your-jwt-secret-key-at-least-32-characters-long
```

## 🗂️ Data Storage

Djournal uses in-memory state management with optional persistent storage:

- **User Accounts**: SQLite database (`data/djournal.db`) for authentication
- **Daily State**: In-memory per-user state for entries, trackers, and custom fields
- **Snapshots**: Saved to `journal/` directory as Markdown files with YAML frontmatter
- **Exports**: Available in both Markdown and PDF formats

### Docker Volumes

When using Docker Compose, data is stored in named volumes:
- `djournal-data`: SQLite database and structured data
- `djournal-journal`: Markdown journal entries

## 📱 Usage Guide

### First Steps

1. **Login**: Use the default admin credentials (`admin` / `admin123`)
2. **Profile**: Navigate to Profile → Update your password and preferences
3. **Start Tracking**: Use the Home page to track daily activities, moods, tasks, etc.
4. **Journal**: Add journal entries for reflection and documentation

### Tracking Features

**Time Since Trackers**: Track elapsed time since specific events
**Activity Duration Timers**: Start/stop timers for activities with manual time entry
**Custom Counters**: Track daily counts (water, coffee, etc.) with auto-reset
**Profile Fields**: Persistent custom fields that appear in all exports
**Activity Entries**: Log activities with timestamps throughout the day

### Journaling

- Create daily entries using Markdown
- Automatic file organization by date
- Support for YAML frontmatter
- Export functionality for backup

### User Management (Admin)

As an administrator, you can:
- Create and manage user accounts
- Assign admin roles to users
- **Privacy**: Each user's data is completely isolated and private
- Admins can manage accounts but cannot see other users' journal data

## 🔒 Security & Privacy

- **Authentication**: JWT-based authentication with secure tokens
- **Password Security**: Bcrypt password hashing with salt
- **Per-User Data Isolation**: Each user's data is completely separate and private
- **Admin Boundaries**: Admins can manage users but cannot access their journal data
- **Environment Variables**: Sensitive data stored in environment variables
- **No External Dependencies**: Completely self-contained, no external service calls

## 🛠️ Development

### Local Development Setup

```bash
# Install dependencies
npm install
cd client && npm install && cd ..

# Start development servers
npm run dev
```

This starts:
- Backend server on `http://localhost:8001`
- Frontend development server on `http://localhost:3001` (with proxy to backend)

### Project Structure

```
Djournal/
├── server/                 # Node.js backend
│   ├── index.js           # Main server file
│   └── routes/            # API route handlers
├── client/                # React frontend
│   ├── src/               # React source code
│   └── dist/              # Built frontend
├── data/                  # SQLite database directory
├── journal/               # Markdown journal entries
├── docker-compose.yml     # Docker Compose configuration
├── Dockerfile            # Docker build configuration
└── package.json          # Node.js dependencies
```

## 📦 Backup and Restore

### Backup

```bash
# Docker volumes backup
docker run --rm -v djournal-data:/data -v djournal-journal:/journal -v $(pwd):/backup alpine tar czf /backup/djournal-backup.tar.gz /data /journal

# Manual backup (non-Docker)
cp -r data/ journal/ backup/
```

### Restore

```bash
# Docker volumes restore
docker run --rm -v djournal-data:/data -v djournal-journal:/journal -v $(pwd):/backup alpine tar xzf /backup/djournal-backup.tar.gz -C /
```

## 🔄 Updates

### Docker Compose Updates

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Manual Updates

```bash
# Pull latest changes
git pull

# Install dependencies and rebuild
npm install
npm run build
npm restart
```

## 🐛 Troubleshooting

### Common Issues

**Application won't start:**
- Check if port 8000 is available
- Verify environment variables are set correctly
- Check Docker logs: `docker-compose logs app`

**Can't login:**
- Verify admin user exists in database
- Check JWT_SECRET is set
- Clear browser cache and cookies

**Data not persisting:**
- Ensure Docker volumes are properly mounted
- Check file permissions on data directories
- Verify database is not corrupted

### Health Check

The application includes a built-in health check:
```bash
curl http://localhost:8000/api
```

Should return a 200 status with application data.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support

If you encounter issues or have questions:

1. Check the troubleshooting section above
2. Search existing [GitHub Issues](https://github.com/RubeHicksCube/Djournal/issues)
3. Create a new issue with detailed information

## 🎯 Features & Updates (v1.0.0)

✅ **Completed**:
- Dark/Light theme toggle with persistence
- PDF export with professional formatting
- Markdown export with YAML frontmatter
- Per-user data isolation for privacy
- Timer pause/resume with elapsed time preservation
- Manual time entry for activity duration trackers
- Editable custom counter values
- Auto-save snapshots before exports

🔮 **Future Enhancements**:
- [ ] Data visualization and analytics
- [ ] Mobile app (React Native)
- [ ] Integration with health devices
- [ ] Multi-language support

---

**Djournal v1.0.0** - Built with ❤️ for daily journaling and personal productivity.
