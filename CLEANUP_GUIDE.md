# Documentation Cleanup Guide

This guide helps you clean up the scattered .md files in the project root.

---

## ✅ Files Already Organized

The following files have been properly organized into `docs/`:

### Features Documentation
- ✅ `ATTENDANCE_WEIGHT_FEATURE.md` → `docs/features/ATTENDANCE_WEIGHT.md` (already exists)
- ✅ New: `docs/features/GRADEBOOK_CHANGELOG.md` (consolidates all gradebook fixes)
- ✅ New: `docs/features/SUBJECT_APPROVAL.md` (already exists)

### Troubleshooting Guides
- ✅ `TROUBLESHOOTING_SAVE_SCORES.md` → `docs/troubleshooting/SAVE_FAILURES.md` (created)
- ✅ `docs/troubleshooting/DATABASE_ERRORS.md` (already exists)

### Setup Guides
- ✅ `SETUP_GUIDE.md` → `docs/setup/INSTALLATION.md` (already exists)
- ✅ `README_TEAM.md` → `docs/setup/QUICK_START.md` (already exists)

---

## 🗑️ Files Safe to Delete

These root-level files are now redundant and can be safely deleted:

```
COEDIGO/
├── ASSESSMENT_PERSISTENCE_FIX.md      → Consolidated into GRADEBOOK_CHANGELOG.md
├── ASSESSMENT_SAVE_FIX.md             → Consolidated into GRADEBOOK_CHANGELOG.md
├── ATTENDANCE_WEIGHT_FEATURE.md       → Already in docs/features/
├── DOCUMENTATION_SUMMARY.md           → Outdated (docs already reorganized)
├── GRADEBOOK_FINAL_FIXES.md           → Consolidated into GRADEBOOK_CHANGELOG.md
├── GRADEBOOK_FIXES.md                 → Consolidated into GRADEBOOK_CHANGELOG.md
├── GRADEBOOK_UX_FIXES.md              → Consolidated into GRADEBOOK_CHANGELOG.md
├── README_TEAM.md                     → Already in docs/setup/QUICK_START.md
├── SETUP_GUIDE.md                     → Already in docs/setup/INSTALLATION.md
└── TROUBLESHOOTING_SAVE_SCORES.md     → Already in docs/troubleshooting/SAVE_FAILURES.md
```

---

## 🔧 Cleanup Commands

### Option 1: Archive First (Recommended)

Create an archive folder to keep old files as backup:

```bash
# Create archive folder
mkdir archive

# Move old files to archive
move ASSESSMENT_PERSISTENCE_FIX.md archive\
move ASSESSMENT_SAVE_FIX.md archive\
move ATTENDANCE_WEIGHT_FEATURE.md archive\
move DOCUMENTATION_SUMMARY.md archive\
move GRADEBOOK_FINAL_FIXES.md archive\
move GRADEBOOK_FIXES.md archive\
move GRADEBOOK_UX_FIXES.md archive\
move README_TEAM.md archive\
move SETUP_GUIDE.md archive\
move TROUBLESHOOTING_SAVE_SCORES.md archive\
```

### Option 2: Delete Directly

If you're confident you don't need the old files:

```bash
del ASSESSMENT_PERSISTENCE_FIX.md
del ASSESSMENT_SAVE_FIX.md
del ATTENDANCE_WEIGHT_FEATURE.md
del DOCUMENTATION_SUMMARY.md
del GRADEBOOK_FINAL_FIXES.md
del GRADEBOOK_FIXES.md
del GRADEBOOK_UX_FIXES.md
del README_TEAM.md
del SETUP_GUIDE.md
del TROUBLESHOOTING_SAVE_SCORES.md
```

---

## 📁 Final Clean Structure

After cleanup, your root should look like this:

```
COEDIGO/
├── backend/
├── frontend/
├── database/
├── docs/                              ← All documentation here
│   ├── setup/
│   ├── features/
│   ├── architecture/
│   ├── api/
│   └── troubleshooting/
├── scripts/
├── .gitignore
├── README.md                          ← Main project README
├── COEDIGO_Documentation.html         ← Keep (generated docs)
├── COEDIGO_Documentation.pdf          ← Keep (generated docs)
├── improvements.txt                   ← Keep (project notes)
└── seeded_demo_logins.csv            ← Keep (demo data)
```

---

## 📋 Files to Keep in Root

These files should stay in the root directory:

- ✅ `README.md` - Main project overview
- ✅ `.gitignore` - Git configuration
- ✅ `COEDIGO_Documentation.html` - Generated documentation
- ✅ `COEDIGO_Documentation.pdf` - Generated documentation
- ✅ `improvements.txt` - Project notes
- ✅ `seeded_demo_logins.csv` - Demo credentials

---

## 🔄 Git Commands

After cleanup, commit the changes:

```bash
# Stage new organized docs
git add docs/

# Stage deletions (if you deleted files)
git add -u

# Commit
git commit -m "docs: Reorganize documentation into professional structure

- Consolidated gradebook fixes into GRADEBOOK_CHANGELOG.md
- Moved troubleshooting guides to docs/troubleshooting/
- Removed duplicate/outdated root-level .md files
- Updated docs/README.md index
- Clean root directory structure"

# Push
git push origin main
```

---

## 📊 What Changed

### Before
```
COEDIGO/
├── 10+ scattered .md files in root
├── Duplicate documentation
├── Unclear organization
└── Hard to find information
```

### After
```
COEDIGO/
├── Clean root directory
├── All docs in docs/ folder
├── Clear categorization
├── Easy navigation
└── Professional structure
```

---

## 🎯 Benefits

1. **Clean Root Directory**
   - Only essential files in root
   - Easy to navigate project
   - Professional appearance

2. **Organized Documentation**
   - All docs in one place
   - Clear categorization
   - Easy to find information

3. **No Duplication**
   - Single source of truth
   - Consolidated related docs
   - Easier to maintain

4. **Better Navigation**
   - Central index in docs/README.md
   - Cross-references between docs
   - Clear hierarchy

---

## ✅ Verification Checklist

After cleanup, verify:

- [ ] All .md files moved/deleted from root
- [ ] docs/ folder has complete documentation
- [ ] docs/README.md index is updated
- [ ] Main README.md links to docs/
- [ ] No broken links in documentation
- [ ] Git commit includes all changes
- [ ] Team notified of new structure

---

## 🆘 If Something Goes Wrong

### Restore from Archive
```bash
# If you archived files
copy archive\FILENAME.md .
```

### Restore from Git
```bash
# If you committed changes
git revert HEAD

# Or restore specific file
git checkout HEAD~1 -- FILENAME.md
```

---

## 📚 Related Documentation

- [Documentation Index](docs/README.md)
- [Migration Guide](docs/MIGRATION_GUIDE.md)
- [Navigation Guide](docs/NAVIGATION_GUIDE.md)

---

**Created:** 2024  
**Purpose:** Clean up scattered documentation files  
**Status:** Ready to execute
