# Documentation Index

Complete documentation for the COEDIGO system.

**Quick Visual Guide:** [DOCUMENTATION_MAP.md](DOCUMENTATION_MAP.md) 🗺️

---

## 📖 Table of Contents

### 🚀 Getting Started
1. **[Quick Start](setup/QUICK_START.md)** - Get running in 5 minutes
2. **[Installation Guide](setup/INSTALLATION.md)** - Complete setup instructions
3. **[XAMPP Windows Setup](setup/XAMPP_WINDOWS.md)** - Local XAMPP ports, phpMyAdmin, and recovery steps
4. **[Configuration](setup/CONFIGURATION.md)** - Environment and settings

### ✨ Features
1. **[Attendance Weight](features/ATTENDANCE_WEIGHT.md)** - Customizable attendance grading
2. **[Subject Approval](features/SUBJECT_APPROVAL.md)** - Subject approval workflow
3. **[GradeBook Changelog](features/GRADEBOOK_CHANGELOG.md)** - Complete history of gradebook improvements
4. **[Email Templates](features/EMAIL_TEMPLATES.md)** - Professional email designs with orange/black theme
5. **[Grade Computation](features/GRADE_COMPUTATION.md)** - How grades are calculated (coming soon)
6. **[User Roles & Permissions](features/USER_ROLES.md)** - Access control (coming soon)

### 🏗️ Architecture
1. **[System Overview](architecture/SYSTEM_OVERVIEW.md)** - High-level architecture
2. **[Database Schema](architecture/DATABASE_SCHEMA.md)** - Tables and relationships
3. **[API Design](architecture/API_DESIGN.md)** - RESTful API structure
4. **[Security](architecture/SECURITY.md)** - Authentication and authorization
5. **[Data Flow](architecture/DATA_FLOW.md)** - Request/response cycles

### 🔌 API Reference
1. **[Authentication API](api/AUTHENTICATION.md)** - Login, logout, sessions
2. **[Users API](api/USERS.md)** - User management
3. **[Classes API](api/CLASSES.md)** - Class operations
4. **[Grades API](api/GRADES.md)** - Score encoding and retrieval
5. **[Subjects API](api/SUBJECTS.md)** - Subject catalog
6. **[Reports API](api/REPORTS.md)** - Excel exports

### 🐛 Troubleshooting
1. **[Database Errors](troubleshooting/DATABASE_ERRORS.md)** - Connection and driver issues
2. **[Save Failures](troubleshooting/SAVE_FAILURES.md)** - Score saving problems
3. **[Common Issues](troubleshooting/COMMON_ISSUES.md)** - FAQ and solutions (coming soon)
4. **[Frontend Errors](troubleshooting/FRONTEND_ERRORS.md)** - React and build issues (coming soon)
5. **[Backend Errors](troubleshooting/BACKEND_ERRORS.md)** - PHP and API issues (coming soon)

---

## 📂 Documentation Structure

```
docs/
├── setup/                    # Installation and configuration
│   ├── QUICK_START.md       # 5-minute setup
│   ├── INSTALLATION.md      # Complete installation
│   ├── XAMPP_WINDOWS.md     # Local Windows XAMPP setup
│   └── CONFIGURATION.md     # Settings and environment
│
├── features/                 # Feature documentation
│   ├── ATTENDANCE_WEIGHT.md # Attendance customization
│   ├── SUBJECT_APPROVAL.md  # Subject approval workflow
│   ├── GRADEBOOK_CHANGELOG.md # Gradebook improvements history
│   ├── EMAIL_TEMPLATES.md   # Professional email designs
│   ├── GRADE_COMPUTATION.md # Grading algorithm (coming soon)
│   └── USER_ROLES.md        # Roles and permissions (coming soon)
│
├── architecture/             # System design
│   ├── SYSTEM_OVERVIEW.md   # Architecture overview
│   ├── DATABASE_SCHEMA.md   # Database design
│   ├── API_DESIGN.md        # API structure
│   ├── SECURITY.md          # Security measures
│   └── DATA_FLOW.md         # Data flow diagrams
│
├── api/                      # API reference
│   ├── AUTHENTICATION.md    # Auth endpoints
│   ├── USERS.md             # User endpoints
│   ├── CLASSES.md           # Class endpoints
│   ├── GRADES.md            # Grade endpoints
│   ├── SUBJECTS.md          # Subject endpoints
│   └── REPORTS.md           # Report endpoints
│
└── troubleshooting/          # Debug guides
    ├── DATABASE_ERRORS.md   # DB issues
    ├── SAVE_FAILURES.md     # Save problems
    ├── COMMON_ISSUES.md     # FAQ (coming soon)
    ├── FRONTEND_ERRORS.md   # React issues (coming soon)
    └── BACKEND_ERRORS.md    # PHP issues (coming soon)
```

---

## 🎯 Quick Links

### For New Users
- Start here: [Quick Start](setup/QUICK_START.md)
- Then read: [User Roles](features/USER_ROLES.md)

### For Developers
- Architecture: [System Overview](architecture/SYSTEM_OVERVIEW.md)
- API Docs: [API Reference](api/)
- Database: [Schema](architecture/DATABASE_SCHEMA.md)

### For Administrators
- Installation: [Installation Guide](setup/INSTALLATION.md)
- Configuration: [Configuration](setup/CONFIGURATION.md)
- Troubleshooting: [Common Issues](troubleshooting/COMMON_ISSUES.md)

### For Faculty
- Attendance: [Attendance Weight](features/ATTENDANCE_WEIGHT.md)
- GradeBook: [Changelog](features/GRADEBOOK_CHANGELOG.md)
- Troubleshooting: [Save Failures](troubleshooting/SAVE_FAILURES.md)

---

## 📝 Documentation Standards

### File Naming
- Use UPPERCASE for file names
- Use underscores for spaces: `USER_ROLES.md`
- Be descriptive: `ATTENDANCE_WEIGHT.md` not `ATTENDANCE.md`

### Structure
- Start with H1 title
- Include horizontal rules (`---`) between sections
- Use emoji for visual hierarchy
- Include code examples
- Link to related docs

### Code Blocks
```markdown
\`\`\`language
code here
\`\`\`
```

### Links
```markdown
[Link Text](relative/path/FILE.md)
```

---

## 🔄 Documentation Updates

### Version History
- **v2.0** - Reorganized documentation structure
- **v1.5** - Added attendance weight feature
- **v1.0** - Initial documentation

### Contributing
1. Follow naming conventions
2. Update this index when adding new docs
3. Cross-reference related documents
4. Include code examples
5. Test all commands/code

---

## 🆘 Need Help?

### Can't find what you're looking for?
1. Check the [Common Issues](troubleshooting/COMMON_ISSUES.md)
2. Search this index
3. Check the main [README](../README.md)

### Found an error?
1. Note the file and section
2. Describe the issue
3. Suggest a correction

### Want to contribute?
1. Follow the documentation standards
2. Update this index
3. Submit a pull request

---

## 📊 Documentation Coverage

### Setup & Installation
- ✅ Quick Start
- ✅ Full Installation
- ✅ Configuration
- ⏳ Deployment (coming soon)

### Features
- ✅ Attendance Weight
- ✅ Subject Approval
- ✅ GradeBook Changelog
- ✅ Email Templates
- ⏳ Grade Computation (coming soon)
- ⏳ User Roles (coming soon)

### Architecture
- ✅ System Overview
- ⏳ Database Schema (coming soon)
- ⏳ API Design (coming soon)
- ⏳ Security (coming soon)

### API Reference
- ⏳ All endpoints (coming soon)

### Troubleshooting
- ✅ Database Errors
- ✅ Save Failures
- ⏳ Common Issues (coming soon)
- ⏳ Frontend Errors (coming soon)
- ⏳ Backend Errors (coming soon)

---

**Documentation maintained by:** COEDIGO Development Team  
**Last updated:** 2024  
**Version:** 2.0
