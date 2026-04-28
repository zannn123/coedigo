# C.O.E.D.I.G.O.

**College of Engineering Digital Interface for Grading and Operations**

A comprehensive web-based grading and class management system for JRMSU College of Engineering.

---

## 🚀 Quick Start

### Prerequisites
- PHP 8.0+
- MySQL 8.0+ / MariaDB 10.5+
- Node.js 16+
- Composer (optional)

### Installation

```bash
# 1. Clone repository
git clone <repository-url>
cd COEDIGO

# 2. Setup database
mysql -u root -p < database/coedigo.sql
mysql -u root -p coedigo_db < database/migration_attendance_weight.sql

# 3. Configure backend
# Edit backend/config/database.php with your credentials

# 4. Setup frontend
cd frontend
npm install
cp .env.example .env
# Edit .env with your API URL

# 5. Start servers
# Terminal 1: Backend
cd backend && php -S localhost:8000

# Terminal 2: Frontend
cd frontend && npm run dev
```

**Default Login:** `admin@jrmsu.edu.ph` / `admin123`

---

## 📚 Documentation

### Getting Started
- **[Installation Guide](docs/setup/INSTALLATION.md)** - Complete setup instructions
- **[Quick Start](docs/setup/QUICK_START.md)** - Get running in 5 minutes
- **[Configuration](docs/setup/CONFIGURATION.md)** - Environment and settings

### Features
- **[Attendance Management](docs/features/ATTENDANCE_WEIGHT.md)** - Customizable attendance grading
- **[Grade Computation](docs/features/GRADE_COMPUTATION.md)** - How grades are calculated
- **[User Roles](docs/features/USER_ROLES.md)** - Admin, Faculty, Student, Dean

### Architecture
- **[System Overview](docs/architecture/SYSTEM_OVERVIEW.md)** - High-level architecture
- **[Database Schema](docs/architecture/DATABASE_SCHEMA.md)** - Tables and relationships
- **[API Design](docs/architecture/API_DESIGN.md)** - RESTful API structure

### API Reference
- **[Authentication](docs/api/AUTHENTICATION.md)** - Login, logout, sessions
- **[Grades API](docs/api/GRADES.md)** - Score encoding and retrieval
- **[Classes API](docs/api/CLASSES.md)** - Class management endpoints

### Troubleshooting
- **[Common Issues](docs/troubleshooting/COMMON_ISSUES.md)** - FAQ and solutions
- **[Database Errors](docs/troubleshooting/DATABASE_ERRORS.md)** - Connection and driver issues
- **[Save Failures](docs/troubleshooting/SAVE_FAILURES.md)** - Score saving problems

---

## 🏗️ Project Structure

```
COEDIGO/
├── backend/                 # PHP REST API
│   ├── config/             # Database configuration
│   ├── controllers/        # API endpoints
│   ├── middleware/         # Auth & validation
│   ├── utils/              # Helper functions
│   └── test-db.php         # Connection test
├── frontend/               # React SPA
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── contexts/      # React contexts
│   │   ├── pages/         # Page components
│   │   └── services/      # API client
│   └── public/            # Static assets
├── database/              # SQL schemas & migrations
│   ├── coedigo.sql       # Main schema
│   └── migration_*.sql   # Schema updates
├── docs/                  # Documentation
│   ├── setup/            # Installation guides
│   ├── features/         # Feature documentation
│   ├── architecture/     # System design
│   ├── api/              # API reference
│   └── troubleshooting/  # Debug guides
└── scripts/              # Utility scripts
```

---

## 🎯 Key Features

### For Faculty
- ✅ Grade book with autosave
- ✅ Customizable attendance weight (0-100%)
- ✅ Midterm & Final term separation
- ✅ Excel export
- ✅ Real-time grade computation

### For Students
- ✅ View live scores
- ✅ Track attendance
- ✅ See grade breakdown
- ✅ Notifications for updates

### For Admin
- ✅ User management
- ✅ System settings
- ✅ Audit logs
- ✅ Report generation

---

## 🛠️ Tech Stack

**Backend**
- PHP 8.0+ (REST API)
- MySQL 8.0+ (Database)
- PDO (Database abstraction)

**Frontend**
- React 18 (UI framework)
- Vite (Build tool)
- React Router (Navigation)
- Lucide React (Icons)

**Development**
- Git (Version control)
- npm (Package manager)
- PHP Built-in Server / Apache

---

## 🔐 Security

- Password hashing (bcrypt)
- JWT-like session tokens
- Role-based access control (RBAC)
- SQL injection prevention (PDO prepared statements)
- XSS protection
- CORS configuration

---

## 📊 Database

**Main Tables:**
- `users` - All system users
- `class_records` - Class instances
- `enrollments` - Student-class assignments
- `grade_components` - Individual scores
- `grades` - Computed final grades
- `attendance_records` - Dated attendance

**See:** [Database Schema](docs/architecture/DATABASE_SCHEMA.md)

---

## 🧪 Testing

```bash
# Test database connection
php backend/test-db.php

# Test frontend build
cd frontend && npm run build

# Run development servers
npm run dev
```

---

## 📝 Contributing

1. Create feature branch: `git checkout -b feature/your-feature`
2. Make changes and test
3. Commit: `git commit -m "Add your feature"`
4. Push: `git push origin feature/your-feature`
5. Create Pull Request

---

## 📄 License

This project is developed for JRMSU College of Engineering.

---

## 👥 Team

**Developed by:** COEDIGO Development Team  
**Institution:** Jose Rizal Memorial State University  
**College:** College of Engineering

---

## 🆘 Support

- **Documentation:** [docs/](docs/)
- **Issues:** Check [troubleshooting guides](docs/troubleshooting/)
- **Test Script:** `php backend/test-db.php`

---

## 📌 Version

**Current Version:** 2.0.0  
**Last Updated:** 2024

### Recent Updates
- ✨ Customizable attendance weight
- 🐛 Improved error handling for score saving
- 📱 Mobile-responsive settings UI
- 🔧 Better validation messages

---

## 🗺️ Roadmap

- [ ] Email notifications
- [ ] PDF report generation
- [ ] Mobile app
- [ ] Analytics dashboard
- [ ] Bulk import/export

---

**Made with ❤️ for JRMSU College of Engineering**
