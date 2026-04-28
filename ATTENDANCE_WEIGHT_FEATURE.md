# Attendance Weight Customization Feature

## Overview
Faculty can now customize how much attendance contributes to Performance Tasks (0-100%).

## What Changed

### Database
- Added `attendance_weight` column to `class_records` table
- Default value: 100% (maintains current behavior)
- Migration file: `database/migration_attendance_weight.sql`

### Backend (PHP)
**GradeController.php**
- `computeGradeInternal()` - Fetches attendance weight from class_records
- `calculateTermStats()` - Applies attendance weight multiplier
- `syncAttendanceComponent()` - Adjusts attendance scores based on weight

**ClassController.php**
- `update()` - Added `attendance_weight` to updateable fields (0-100 validation)

### Frontend (React)
**GradeBook.jsx**
- New state: `attendanceWeight`, `showAttendanceSettings`, `savingAttendanceWeight`
- Loads attendance weight from class data
- Updated info banner to show current weight percentage
- New "Customize" button opens settings modal

**Attendance Settings Modal**
- Clean, intuitive slider interface (0-100%)
- Real-time percentage display
- Visual gradient slider
- Quick presets: 0% (Disabled), 50%, 100% (Full)
- Explanation of how it works
- Number input for precise control

## How It Works

### Calculation
1. **100%** - Attendance fully counted (default behavior)
   - Present = 1 point, transmuted to 50-100 scale
   
2. **50%** - Attendance counts half
   - If student has 10/10 attendance = 5 points counted
   
3. **0%** - Attendance disabled
   - Attendance records saved but don't affect grades

### Formula
```
Adjusted Score = Total Points × (Weight / 100)
Adjusted Max = Possible Points × (Weight / 100)
```

### Example
- Student: 8/10 attendance (80%)
- Weight: 50%
- Result: 4/5 points counted in Performance Tasks

## UI/UX Features
✅ Mobile-responsive slider
✅ Real-time visual feedback
✅ Clear percentage display
✅ Helpful explanations
✅ Validation (0-100 range)
✅ Disabled state during save
✅ Toast notifications

## Migration Instructions

1. **Run Database Migration**
   ```sql
   mysql -u root -p coedigo_db < database/migration_attendance_weight.sql
   ```

2. **Restart Backend** (if needed)
   ```bash
   # Backend should auto-detect new column
   ```

3. **Clear Browser Cache** (optional)
   - Frontend will automatically fetch new field

## Faculty Usage

1. Open any class gradebook
2. Look for attendance info banner
3. Click "Customize" button
4. Adjust slider (0-100%)
5. Click "Save Weight"
6. Grades automatically recompute

## Default Behavior
- All existing classes: 100% (no change)
- New classes: 100% (full attendance credit)
- Faculty can change anytime without data loss
