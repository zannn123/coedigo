# Documentation Reorganization - Migration Guide

This document explains the new documentation structure.

---

## 📁 Old vs New Structure

### Before (Unorganized)
```
COEDIGO/
├── README_TEAM.md
├── SETUP_GUIDE.md
├── ATTENDANCE_WEIGHT_FEATURE.md
├── TROUBLESHOOTING_SAVE_SCORES.md
├── COEDIGO_Documentation.html
├── COEDIGO_Documentation.pdf
└── improvements.txt
```

### After (Organized)
```
COEDIGO/
├── README.md                          # Main project README
├── docs/                              # All documentation
│   ├── README.md                      # Documentation index
│   ├── setup/                         # Installation guides
│   │   ├── QUICK_START.md            # 5-minute setup
│   │   ├── INSTALLATION.md           # Complete guide
│   │   └── CONFIGURATION.md          # Settings
│   ├── features/                      # Feature docs
│   │   ├── ATTENDANCE_WEIGHT.md      # Attendance feature
│   │   ├── GRADE_COMPUTATION.md      # Grading logic
│   │   └── USER_ROLES.md             # Permissions
│   ├── architecture/                  # System design
│   │   ├── SYSTEM_OVERVIEW.md        # Architecture
│   │   ├── DATABASE_SCHEMA.md        # Database
│   │   └── API_DESIGN.md             # API structure
│   ├── api/                           # API reference
│   │   ├── AUTHENTICATION.md         # Auth endpoints
│   │   ├── GRADES.md                 # Grade endpoints
│   │   └── CLASSES.md                # Class endpoints
│   └── troubleshooting/               # Debug guides
│       ├── COMMON_ISSUES.md          # FAQ
│       ├── DATABASE_ERRORS.md        # DB issues
│       └── SAVE_FAILURES.md          # Save problems
└── backend/
    └── test-db.php                    # Connection test
```

---

## 🔄 File Mapping

### Moved Files

| Old Location | New Location | Status |
|-------------|--------------|--------|
| `README_TEAM.md` | `docs/setup/QUICK_START.md` | ✅ Reorganized |
| `SETUP_GUIDE.md` | `docs/setup/INSTALLATION.md` | ✅ Reorganized |
| `ATTENDANCE_WEIGHT_FEATURE.md` | `docs/features/ATTENDANCE_WEIGHT.md` | ✅ Enhanced |
| `TROUBLESHOOTING_SAVE_SCORES.md` | `docs/troubleshooting/SAVE_FAILURES.md` | ✅ Moved |
| N/A | `docs/troubleshooting/DATABASE_ERRORS.md` | ✅ New |
| N/A | `docs/architecture/SYSTEM_OVERVIEW.md` | ✅ New |

### Deprecated Files

| File | Reason | Action |
|------|--------|--------|
| `README_TEAM.md` | Replaced by `docs/setup/QUICK_START.md` | Can delete |
| `SETUP_GUIDE.md` | Replaced by `docs/setup/INSTALLATION.md` | Can delete |
| `ATTENDANCE_WEIGHT_FEATURE.md` | Moved to `docs/features/` | Can delete |
| `TROUBLESHOOTING_SAVE_SCORES.md` | Moved to `docs/troubleshooting/` | Can delete |
| `improvements.txt` | Informal notes | Keep or archive |

### Preserved Files

| File | Location | Purpose |
|------|----------|---------|
| `COEDIGO_Documentation.html` | Root | Legacy documentation |
| `COEDIGO_Documentation.pdf` | Root | Legacy documentation |
| `seeded_demo_logins.csv` | Root | Demo credentials |

---

## 📚 New Documentation Features

### 1. Centralized Index
- **Location:** `docs/README.md`
- **Purpose:** Single entry point for all documentation
- **Features:** 
  - Table of contents
  - Quick links by role
  - Documentation coverage tracker

### 2. Categorized Structure
- **setup/** - Installation and configuration
- **features/** - Feature documentation
- **architecture/** - System design
- **api/** - API reference
- **troubleshooting/** - Debug guides

### 3. Improved Navigation
- Cross-references between documents
- Consistent formatting
- Clear file naming
- Emoji visual hierarchy

### 4. Enhanced Content
- Code examples
- Diagrams (ASCII art)
- Step-by-step guides
- Troubleshooting checklists

---

## 🎯 Quick Access Guide

### For New Team Members
**Start here:** `docs/setup/QUICK_START.md`

### For Installation
**Read:** `docs/setup/INSTALLATION.md`

### For Database Issues
**Check:** `docs/troubleshooting/DATABASE_ERRORS.md`

### For Architecture Understanding
**Review:** `docs/architecture/SYSTEM_OVERVIEW.md`

### For API Development
**Reference:** `docs/api/` (coming soon)

---

## 📝 Documentation Standards

### File Naming Convention
```
UPPERCASE_WITH_UNDERSCORES.md
```

Examples:
- ✅ `QUICK_START.md`
- ✅ `DATABASE_ERRORS.md`
- ✅ `ATTENDANCE_WEIGHT.md`
- ❌ `quick-start.md`
- ❌ `database_errors.MD`

### Document Structure
```markdown
# Title

Brief description.

---

## Section 1

Content...

---

## Section 2

Content...

---

## Related Documentation

- [Link 1](path/to/doc.md)
- [Link 2](path/to/doc.md)

---

**Last Updated:** YYYY
```

### Code Blocks
````markdown
```language
code here
```
````

### Links
```markdown
[Link Text](relative/path/FILE.md)
```

---

## 🔧 Maintenance Tasks

### Regular Updates
- [ ] Update version numbers
- [ ] Add new features to docs
- [ ] Update screenshots
- [ ] Review and fix broken links
- [ ] Update troubleshooting guides

### When Adding New Features
1. Create feature doc in `docs/features/`
2. Update `docs/README.md` index
3. Add to main `README.md` if major
4. Cross-reference in related docs
5. Update API docs if applicable

### When Fixing Bugs
1. Document the issue in troubleshooting
2. Add solution steps
3. Update related docs
4. Add to FAQ if common

---

## 🗑️ Cleanup Checklist

### Safe to Delete (After Verification)
- [ ] `README_TEAM.md` → Replaced by `docs/setup/QUICK_START.md`
- [ ] `SETUP_GUIDE.md` → Replaced by `docs/setup/INSTALLATION.md`
- [ ] `ATTENDANCE_WEIGHT_FEATURE.md` → Moved to `docs/features/`
- [ ] `TROUBLESHOOTING_SAVE_SCORES.md` → Moved to `docs/troubleshooting/`

### Keep
- [x] `README.md` - Main project README
- [x] `COEDIGO_Documentation.html` - Legacy docs
- [x] `COEDIGO_Documentation.pdf` - Legacy docs
- [x] `seeded_demo_logins.csv` - Demo data
- [x] `improvements.txt` - Development notes

### Archive (Optional)
Create `archive/` folder for old documentation:
```
archive/
├── old-README_TEAM.md
├── old-SETUP_GUIDE.md
└── old-ATTENDANCE_WEIGHT_FEATURE.md
```

---

## 📊 Documentation Coverage

### Completed ✅
- [x] Main README
- [x] Documentation index
- [x] Quick start guide
- [x] Installation guide
- [x] System architecture
- [x] Attendance weight feature
- [x] Database troubleshooting
- [x] Test script

### In Progress ⏳
- [ ] Configuration guide
- [ ] Grade computation details
- [ ] User roles documentation
- [ ] API reference
- [ ] Frontend errors guide
- [ ] Backend errors guide

### Planned 📋
- [ ] Deployment guide
- [ ] Security documentation
- [ ] Performance optimization
- [ ] Backup and recovery
- [ ] Migration guides
- [ ] Video tutorials

---

## 🎓 Best Practices

### Writing Documentation

**DO:**
- ✅ Use clear, concise language
- ✅ Include code examples
- ✅ Add troubleshooting sections
- ✅ Cross-reference related docs
- ✅ Use consistent formatting
- ✅ Test all commands/code
- ✅ Update regularly

**DON'T:**
- ❌ Use jargon without explanation
- ❌ Assume prior knowledge
- ❌ Leave broken links
- ❌ Forget to update version info
- ❌ Mix different naming conventions
- ❌ Include outdated information

### Reviewing Documentation

Before committing:
1. Check all links work
2. Test all code examples
3. Verify commands are correct
4. Ensure consistent formatting
5. Update table of contents
6. Add to documentation index

---

## 🔄 Version History

**v2.0** - 2024
- Complete documentation reorganization
- New structure with categories
- Enhanced content
- Better navigation

**v1.0** - Previous
- Scattered documentation files
- No clear structure
- Limited cross-referencing

---

## 🆘 Questions?

### Where do I find...?

**Installation instructions?**
→ `docs/setup/INSTALLATION.md`

**API documentation?**
→ `docs/api/` (coming soon)

**Troubleshooting?**
→ `docs/troubleshooting/`

**Architecture info?**
→ `docs/architecture/SYSTEM_OVERVIEW.md`

**Feature details?**
→ `docs/features/`

### How do I contribute?

1. Follow naming conventions
2. Use the standard structure
3. Update the index (`docs/README.md`)
4. Cross-reference related docs
5. Test all examples
6. Submit pull request

---

**Documentation maintained by:** COEDIGO Development Team  
**Reorganization date:** 2024  
**Structure version:** 2.0
