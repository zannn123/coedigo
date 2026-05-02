# 📚 COEDIGO Documentation Map

Quick visual reference for navigating the documentation.

---

## 🗺️ Documentation Structure

```
docs/
│
├── 📖 README.md ⭐ START HERE
│   └── Complete documentation index
│
├── 🚀 setup/
│   ├── QUICK_START.md          → 5-minute setup
│   ├── INSTALLATION.md         → Complete installation
│   └── XAMPP_WINDOWS.md        → Windows XAMPP setup and recovery
│
├── ✨ features/
│   ├── ATTENDANCE_WEIGHT.md    → Customizable attendance (0-100%)
│   ├── SUBJECT_APPROVAL.md     → Subject approval workflow
│   └── GRADEBOOK_CHANGELOG.md  → Complete gradebook history
│
├── 🏗️ architecture/
│   └── SYSTEM_OVERVIEW.md      → High-level architecture
│
├── 🔌 api/
│   └── (Coming soon)
│
├── 🐛 troubleshooting/
│   ├── DATABASE_ERRORS.md      → "Cannot find driver" fixes
│   └── SAVE_FAILURES.md        → Score saving problems
│
├── 🔄 MIGRATION_GUIDE.md       → Old → New file mapping
└── 🧭 NAVIGATION_GUIDE.md      → How to navigate docs
```

---

## 🎯 Quick Access by Role

### 👨‍💻 New Developer
```
1. docs/setup/QUICK_START.md
2. docs/architecture/SYSTEM_OVERVIEW.md
3. docs/features/
```

### 👨‍🏫 Faculty User
```
1. docs/features/ATTENDANCE_WEIGHT.md
2. docs/features/GRADEBOOK_CHANGELOG.md
3. docs/troubleshooting/SAVE_FAILURES.md
```

### 🔧 System Admin
```
1. docs/setup/INSTALLATION.md
2. docs/troubleshooting/DATABASE_ERRORS.md
3. docs/architecture/SYSTEM_OVERVIEW.md
```

### 🆘 Troubleshooting
```
1. docs/troubleshooting/DATABASE_ERRORS.md
2. docs/troubleshooting/SAVE_FAILURES.md
3. backend/test-db.php (run this first!)
```

---

## 📋 Common Tasks

### Setting Up Project
```
1. Read: docs/setup/QUICK_START.md
2. Windows + XAMPP: read docs/setup/XAMPP_WINDOWS.md
3. Run: mysql -u root -p < database/coedigo.sql
4. Run: mysql -u root -p coedigo_db < database/migration_attendance_weight.sql
5. Test: php backend/test-db.php
```

### Fixing Database Errors
```
1. Read: docs/troubleshooting/DATABASE_ERRORS.md
2. Check: php.ini for pdo_mysql extension
3. Test: php backend/test-db.php
```

### Understanding Attendance Feature
```
1. Read: docs/features/ATTENDANCE_WEIGHT.md
2. Check: database/migration_attendance_weight.sql
3. Test: Open gradebook → Click "Customize" on attendance banner
```

### Troubleshooting Save Errors
```
1. Read: docs/troubleshooting/SAVE_FAILURES.md
2. Check: Browser console (F12)
3. Check: backend/logs/app-*.log
```

---

## 🔗 Important Links

### Main Entry Points
- **Project Overview**: [README.md](../README.md)
- **Documentation Hub**: [docs/README.md](README.md)
- **Cleanup Guide**: [CLEANUP_GUIDE.md](../CLEANUP_GUIDE.md)

### Setup & Installation
- **Quick Start**: [docs/setup/QUICK_START.md](setup/QUICK_START.md)
- **Full Installation**: [docs/setup/INSTALLATION.md](setup/INSTALLATION.md)

### Features
- **Attendance Weight**: [docs/features/ATTENDANCE_WEIGHT.md](features/ATTENDANCE_WEIGHT.md)
- **Subject Approval**: [docs/features/SUBJECT_APPROVAL.md](features/SUBJECT_APPROVAL.md)
- **GradeBook History**: [docs/features/GRADEBOOK_CHANGELOG.md](features/GRADEBOOK_CHANGELOG.md)

### Troubleshooting
- **Database Errors**: [docs/troubleshooting/DATABASE_ERRORS.md](troubleshooting/DATABASE_ERRORS.md)
- **Save Failures**: [docs/troubleshooting/SAVE_FAILURES.md](troubleshooting/SAVE_FAILURES.md)

### Architecture
- **System Overview**: [docs/architecture/SYSTEM_OVERVIEW.md](architecture/SYSTEM_OVERVIEW.md)

---

## 🔍 Finding Information

### By Topic
| Topic | Location |
|-------|----------|
| Installation | `docs/setup/INSTALLATION.md` |
| Quick Setup | `docs/setup/QUICK_START.md` |
| Attendance | `docs/features/ATTENDANCE_WEIGHT.md` |
| GradeBook | `docs/features/GRADEBOOK_CHANGELOG.md` |
| Database Issues | `docs/troubleshooting/DATABASE_ERRORS.md` |
| Save Errors | `docs/troubleshooting/SAVE_FAILURES.md` |
| Architecture | `docs/architecture/SYSTEM_OVERVIEW.md` |

### By File Type
| Type | Location |
|------|----------|
| Setup Guides | `docs/setup/` |
| Feature Docs | `docs/features/` |
| Architecture | `docs/architecture/` |
| API Reference | `docs/api/` (coming soon) |
| Troubleshooting | `docs/troubleshooting/` |

---

## 📱 Quick Commands

### Test Database Connection
```bash
php backend/test-db.php
```

### Start Development Servers
```bash
# Terminal 1
cd backend && php -S localhost:8000

# Terminal 2
cd frontend && npm run dev
```

### Run Database Migrations
```bash
mysql -u root -p coedigo_db < database/migration_attendance_weight.sql
```

### Check PHP Extensions
```bash
php -m | grep -i pdo
php -m | grep -i mysql
```

---

## 🎓 Learning Path

### Day 1: Setup
1. ✅ Read [QUICK_START.md](setup/QUICK_START.md)
2. ✅ Setup database
3. ✅ Run test script
4. ✅ Access login page

### Day 2: Features
1. ✅ Read [ATTENDANCE_WEIGHT.md](features/ATTENDANCE_WEIGHT.md)
2. ✅ Read [GRADEBOOK_CHANGELOG.md](features/GRADEBOOK_CHANGELOG.md)
3. ✅ Test gradebook features

### Day 3: Architecture
1. ✅ Read [SYSTEM_OVERVIEW.md](architecture/SYSTEM_OVERVIEW.md)
2. ✅ Explore backend code
3. ✅ Explore frontend code

### Day 4: Troubleshooting
1. ✅ Read [DATABASE_ERRORS.md](troubleshooting/DATABASE_ERRORS.md)
2. ✅ Read [SAVE_FAILURES.md](troubleshooting/SAVE_FAILURES.md)
3. ✅ Practice debugging

---

## 🗂️ File Organization

### Root Directory (Clean)
```
COEDIGO/
├── backend/
├── frontend/
├── database/
├── docs/              ← All documentation
├── scripts/
├── README.md          ← Main overview
└── CLEANUP_GUIDE.md   ← Cleanup instructions
```

### Documentation Directory (Organized)
```
docs/
├── setup/             ← Installation & config
├── features/          ← Feature documentation
├── architecture/      ← System design
├── api/               ← API reference
├── troubleshooting/   ← Debug guides
└── README.md          ← Documentation index
```

---

## ✅ Checklist for New Team Members

### First Day
- [ ] Read [README.md](../README.md)
- [ ] Read [docs/setup/QUICK_START.md](setup/QUICK_START.md)
- [ ] Setup development environment
- [ ] Run `php backend/test-db.php`
- [ ] Access login page

### First Week
- [ ] Read [docs/README.md](README.md)
- [ ] Explore [docs/features/](features/)
- [ ] Read [docs/architecture/SYSTEM_OVERVIEW.md](architecture/SYSTEM_OVERVIEW.md)
- [ ] Bookmark [docs/troubleshooting/](troubleshooting/)

### Ongoing
- [ ] Refer to docs when stuck
- [ ] Update docs when you learn something new
- [ ] Follow documentation standards
- [ ] Help improve documentation

---

## 🎯 Documentation Goals

✅ **Easy to Find** - Clear structure and navigation  
✅ **Easy to Read** - Consistent formatting  
✅ **Easy to Update** - Modular organization  
✅ **Easy to Maintain** - No duplication  
✅ **Professional** - Industry standards  

---

**Quick Start:** [docs/setup/QUICK_START.md](setup/QUICK_START.md)  
**Full Index:** [docs/README.md](README.md)  
**Main README:** [README.md](../README.md)

---

**Last Updated:** 2024  
**Maintained by:** COEDIGO Development Team
