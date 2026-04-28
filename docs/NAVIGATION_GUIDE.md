# 🗺️ COEDIGO Documentation Map

Visual guide to navigate the documentation.

```
                    ┌─────────────────────────────────┐
                    │       README.md (START)         │
                    │   Main Project Overview         │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
         ┌──────────▼──────────┐    ┌────────────▼────────────┐
         │   docs/README.md    │    │   backend/test-db.php   │
         │  Documentation Hub  │    │   Connection Test       │
         └──────────┬──────────┘    └─────────────────────────┘
                    │
        ┌───────────┼───────────┬───────────┬──────────────┐
        │           │           │           │              │
   ┌────▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼────┐  ┌──────▼──────┐
   │ setup/  │ │features│ │ arch/  │ │  api/  │  │troubleshoot/│
   └────┬────┘ └───┬────┘ └───┬────┘ └───┬────┘  └──────┬──────┘
        │          │          │          │              │
        │          │          │          │              │
   ┌────▼────────────────────────────────────────────────▼────┐
   │                                                            │
   │  QUICK_START.md ◄─── Start here for new users            │
   │  INSTALLATION.md ◄─── Complete setup guide               │
   │  ATTENDANCE_WEIGHT.md ◄─── Feature documentation         │
   │  SYSTEM_OVERVIEW.md ◄─── Architecture details            │
   │  DATABASE_ERRORS.md ◄─── Troubleshooting                 │
   │                                                            │
   └────────────────────────────────────────────────────────────┘
```

---

## 🎯 Navigation by Role

### 👨‍💼 System Administrator

```
START → docs/setup/INSTALLATION.md
     ↓
     docs/setup/CONFIGURATION.md
     ↓
     docs/troubleshooting/DATABASE_ERRORS.md
     ↓
     backend/test-db.php (verify)
```

### 👨‍💻 Developer

```
START → docs/architecture/SYSTEM_OVERVIEW.md
     ↓
     docs/api/ (API reference)
     ↓
     docs/features/ (feature specs)
     ↓
     docs/troubleshooting/ (debug)
```

### 👨‍🏫 Faculty User

```
START → docs/setup/QUICK_START.md
     ↓
     docs/features/ATTENDANCE_WEIGHT.md
     ↓
     docs/features/GRADEBOOK.md
     ↓
     docs/troubleshooting/SAVE_FAILURES.md
```

### 🆕 New Team Member

```
START → README.md (overview)
     ↓
     docs/README.md (index)
     ↓
     docs/setup/QUICK_START.md (setup)
     ↓
     docs/architecture/SYSTEM_OVERVIEW.md (understand)
     ↓
     Start coding!
```

---

## 📂 Directory Tree

```
COEDIGO/
│
├── 📄 README.md ⭐ START HERE
├── 📄 DOCUMENTATION_SUMMARY.md
│
├── 📁 docs/ ─────────────────────────── Documentation Hub
│   │
│   ├── 📄 README.md ─────────────────── Documentation Index
│   ├── 📄 MIGRATION_GUIDE.md ────────── Old → New Mapping
│   │
│   ├── 📁 setup/ ────────────────────── Installation
│   │   ├── 📄 QUICK_START.md ────────── 5-min setup ⚡
│   │   ├── 📄 INSTALLATION.md ────────── Complete guide
│   │   └── 📄 CONFIGURATION.md ───────── Settings
│   │
│   ├── 📁 features/ ─────────────────── Features
│   │   ├── 📄 ATTENDANCE_WEIGHT.md ───── Attendance
│   │   ├── 📄 GRADE_COMPUTATION.md ───── Grading
│   │   ├── 📄 USER_ROLES.md ──────────── Permissions
│   │   └── 📄 GRADEBOOK.md ───────────── Grade book
│   │
│   ├── 📁 architecture/ ─────────────── System Design
│   │   ├── 📄 SYSTEM_OVERVIEW.md ─────── Architecture 🏗️
│   │   ├── 📄 DATABASE_SCHEMA.md ─────── Database
│   │   ├── 📄 API_DESIGN.md ──────────── API structure
│   │   └── 📄 SECURITY.md ────────────── Security
│   │
│   ├── 📁 api/ ──────────────────────── API Reference
│   │   ├── 📄 AUTHENTICATION.md ──────── Auth
│   │   ├── 📄 GRADES.md ──────────────── Grades
│   │   ├── 📄 CLASSES.md ─────────────── Classes
│   │   └── 📄 USERS.md ───────────────── Users
│   │
│   └── 📁 troubleshooting/ ──────────── Debug Guides
│       ├── 📄 COMMON_ISSUES.md ───────── FAQ 🐛
│       ├── 📄 DATABASE_ERRORS.md ─────── DB issues
│       ├── 📄 SAVE_FAILURES.md ───────── Save problems
│       ├── 📄 FRONTEND_ERRORS.md ─────── React issues
│       └── 📄 BACKEND_ERRORS.md ──────── PHP issues
│
├── 📁 backend/
│   └── 📄 test-db.php ───────────────── Connection Test 🧪
│
├── 📁 frontend/
├── 📁 database/
└── 📁 scripts/
```

---

## 🚀 Quick Access Paths

### Installation Path
```
README.md
  └─→ docs/setup/QUICK_START.md (5 min)
       └─→ docs/setup/INSTALLATION.md (complete)
            └─→ backend/test-db.php (verify)
```

### Troubleshooting Path
```
Problem occurs
  └─→ docs/troubleshooting/COMMON_ISSUES.md (check FAQ)
       └─→ docs/troubleshooting/DATABASE_ERRORS.md (DB issues)
            └─→ docs/troubleshooting/SAVE_FAILURES.md (save issues)
                 └─→ backend/test-db.php (diagnose)
```

### Learning Path
```
docs/README.md (index)
  └─→ docs/setup/QUICK_START.md (setup)
       └─→ docs/architecture/SYSTEM_OVERVIEW.md (understand)
            └─→ docs/features/ (learn features)
                 └─→ docs/api/ (API reference)
```

### Development Path
```
docs/architecture/SYSTEM_OVERVIEW.md (architecture)
  └─→ docs/architecture/DATABASE_SCHEMA.md (database)
       └─→ docs/api/ (endpoints)
            └─→ docs/features/ (requirements)
```

---

## 🔍 Search Guide

### Looking for...

**"How do I install?"**
→ `docs/setup/INSTALLATION.md`

**"Quick setup?"**
→ `docs/setup/QUICK_START.md`

**"Cannot find driver error?"**
→ `docs/troubleshooting/DATABASE_ERRORS.md`

**"How does grading work?"**
→ `docs/features/GRADE_COMPUTATION.md`

**"System architecture?"**
→ `docs/architecture/SYSTEM_OVERVIEW.md`

**"API endpoints?"**
→ `docs/api/`

**"Attendance feature?"**
→ `docs/features/ATTENDANCE_WEIGHT.md`

**"Save scores failing?"**
→ `docs/troubleshooting/SAVE_FAILURES.md`

---

## 📊 Documentation Layers

```
Layer 1: Overview
├── README.md (project overview)
└── docs/README.md (documentation index)

Layer 2: Getting Started
├── docs/setup/QUICK_START.md
└── docs/setup/INSTALLATION.md

Layer 3: Understanding
├── docs/architecture/SYSTEM_OVERVIEW.md
└── docs/features/

Layer 4: Reference
├── docs/api/
└── docs/architecture/DATABASE_SCHEMA.md

Layer 5: Support
└── docs/troubleshooting/
```

---

## 🎯 Common Workflows

### New Developer Onboarding
1. Read `README.md`
2. Follow `docs/setup/QUICK_START.md`
3. Study `docs/architecture/SYSTEM_OVERVIEW.md`
4. Review `docs/features/`
5. Reference `docs/api/`

### Fixing a Bug
1. Reproduce issue
2. Check `docs/troubleshooting/COMMON_ISSUES.md`
3. Run `backend/test-db.php`
4. Check specific troubleshooting guide
5. Review architecture docs if needed

### Adding a Feature
1. Review `docs/architecture/SYSTEM_OVERVIEW.md`
2. Check `docs/features/` for similar features
3. Design and implement
4. Document in `docs/features/`
5. Update `docs/api/` if needed
6. Update `docs/README.md` index

### Deploying
1. Follow `docs/setup/INSTALLATION.md`
2. Configure per `docs/setup/CONFIGURATION.md`
3. Run `backend/test-db.php`
4. Verify all tests pass
5. Deploy

---

## 🔗 Cross-Reference Map

```
QUICK_START.md
  ├─→ INSTALLATION.md (detailed setup)
  ├─→ DATABASE_ERRORS.md (if issues)
  └─→ COMMON_ISSUES.md (FAQ)

INSTALLATION.md
  ├─→ CONFIGURATION.md (next step)
  ├─→ DATABASE_ERRORS.md (troubleshoot)
  └─→ SYSTEM_OVERVIEW.md (understand)

ATTENDANCE_WEIGHT.md
  ├─→ GRADE_COMPUTATION.md (how it affects grades)
  ├─→ GRADEBOOK.md (where to use it)
  └─→ CLASS_MANAGEMENT.md (class settings)

SYSTEM_OVERVIEW.md
  ├─→ DATABASE_SCHEMA.md (data layer)
  ├─→ API_DESIGN.md (API layer)
  └─→ SECURITY.md (security layer)

DATABASE_ERRORS.md
  ├─→ INSTALLATION.md (setup)
  ├─→ CONFIGURATION.md (config)
  └─→ COMMON_ISSUES.md (general)
```

---

## 💡 Pro Tips

### For Quick Answers
1. Check `docs/README.md` index first
2. Use Ctrl+F to search within docs
3. Follow "Related Documentation" links
4. Run test scripts when troubleshooting

### For Deep Understanding
1. Start with architecture docs
2. Read feature docs thoroughly
3. Review API reference
4. Study code examples

### For Troubleshooting
1. Check troubleshooting guides first
2. Run diagnostic scripts
3. Check logs
4. Review related architecture docs

---

**Navigation Version:** 2.0  
**Last Updated:** 2024

🗺️ **Happy navigating!**
