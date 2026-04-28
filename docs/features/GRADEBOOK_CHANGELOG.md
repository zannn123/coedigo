# GradeBook Feature Changelog

Complete history of GradeBook improvements and fixes.

---

## Version 2.3.0 - Assessment Persistence Fix

**Date:** 2024

### Problem Solved
Assessments would disappear after page refresh because they weren't being saved to the database.

### Changes
- Backend now marks new assessments as "changed" with clear indicator
- Frontend shows "Assessments created successfully" message
- NULL scores allowed for new assessments
- Assessments persist across page refreshes

### Technical Details
- Modified `GradeController.php` to properly track new assessment creation
- Enhanced `GradeBook.jsx` success messages
- Database creates grade_components rows with NULL scores for all students

---

## Version 2.2.0 - Assessment Save Error Fix

**Date:** 2024

### Problem Solved
"Failed to save scores" error when adding new assessments.

### Changes
- Added detailed error messages with HTTP 422 for validation errors
- Added validation for empty category and max_score > 0
- Enhanced error logging in backend
- Improved frontend error tracking with full error objects

### Technical Details
- `GradeController.php`: Added InvalidArgumentException handling
- `GradeBook.jsx`: Enhanced per-student error tracking
- Better console logging for debugging

---

## Version 2.1.1 - Final UX Fixes

**Date:** 2024

### Problems Solved
1. Autosave not working when adding assessments
2. No visible button to add attendance
3. Midterm/Final assessments appearing in both tabs

### Changes
- Removed requirement for assessments to exist before autosave triggers
- Added calendar icon button next to each student name for attendance
- Period-specific empty states for Midterm/Final tabs
- Improved attendance modal with step-by-step instructions

### Technical Details
- `GradeBook.jsx`: Simplified autosave condition
- Added attendance button to student row
- Enhanced period filtering for assessments

---

## Version 2.1.0 - UX Improvements

**Date:** 2024

### Problems Solved
1. Default assessments shown in new classes
2. Confusing attendance UI
3. Attendance weight not persisting

### Changes
- Removed DEFAULT_ASSESSMENTS array
- Clean empty state with contextual help banners
- Improved attendance modal with instructions
- Fixed attendance weight persistence with grade recomputation

### Technical Details
- `GradeBook.jsx`: Removed default assessments
- Added contextual help banners
- Enhanced `saveAttendanceWeight()` to trigger recomputation

---

## Version 2.0.0 - Attendance Weight Feature

**Date:** 2024

### New Feature
Faculty can customize attendance contribution to Performance Tasks (0-100%).

### Changes
- Added attendance_weight column to class_records table
- Backend grade computation applies attendance weight
- Frontend slider UI with real-time feedback
- Quick presets: 0% (Disabled), 50%, 100% (Full)

### Technical Details
- Database migration: `migration_attendance_weight.sql`
- `GradeController.php`: Updated grade computation
- `ClassController.php`: Added attendance_weight field
- `GradeBook.jsx`: New attendance settings modal

---

## Version 1.5.0 - Assessment Persistence Improvements

**Date:** 2024

### Changes
- Changed draft assessment key generation
- Added isDraft flag to track unsaved assessments
- Improved component ID mapping
- Added force_create flag for draft assessments

### Technical Details
- `GradeBook.jsx`: Enhanced assessment creation
- Better validation for assessments with scores
- Improved autosave logic

---

## Related Documentation

- [Attendance Weight Feature](ATTENDANCE_WEIGHT.md)
- [Save Failures Troubleshooting](../troubleshooting/SAVE_FAILURES.md)
- [System Overview](../architecture/SYSTEM_OVERVIEW.md)

---

**Maintained by:** COEDIGO Development Team  
**Last Updated:** 2024
