# Troubleshooting: Score Save Failures

## Common Issues & Solutions

### 1. Validation Errors (Most Common)

#### No Students Enrolled
- **Error**: "Enroll students before saving scores."
- **Solution**: Click "Enroll" button and add at least one student

#### Empty Assessment Names
- **Error**: "Every assessment needs a name."
- **Solution**: Open "Assessments" modal and fill in all assessment names

#### Invalid Max Scores
- **Error**: "Every assessment needs a max score greater than 0."
- **Solution**: Set max score > 0 for all assessments (e.g., 50, 100)

#### Duplicate Assessment Names
- **Error**: "Assessment names must be unique inside each category."
- **Solution**: Rename duplicate assessments (e.g., "Quiz 1", "Quiz 2")

#### Invalid Scores
- **Error**: "Fix scores that are invalid, negative, or above the max score."
- **Solution**: 
  - Check for red-highlighted score cells
  - Remove negative scores
  - Ensure scores don't exceed max score
  - Fix non-numeric values

---

### 2. Backend/Database Errors

#### Permission Issues
- **Symptom**: "Unauthorized" or 403 error
- **Solution**: 
  - Verify you're the faculty assigned to this class
  - Log out and log back in
  - Check with admin if you should have access

#### Database Connection
- **Symptom**: 500 error or timeout
- **Solution**:
  - Check if backend server is running
  - Verify database connection
  - Contact system administrator

#### Missing attendance_weight Column
- **Symptom**: SQL error about attendance_weight
- **Solution**: Run the migration:
  ```bash
  mysql -u root -p coedigo_db < database/migration_attendance_weight.sql
  ```

---

### 3. Network/Browser Issues

#### Slow Connection
- **Symptom**: Timeout errors
- **Solution**: 
  - Check internet connection
  - Try saving fewer students at once
  - Refresh page and try again

#### Browser Cache
- **Symptom**: Unexpected behavior
- **Solution**:
  - Clear browser cache (Ctrl+Shift+Delete)
  - Hard refresh (Ctrl+F5)
  - Try incognito/private mode

---

## Debugging Steps

### Step 1: Check Browser Console
1. Press F12 to open Developer Tools
2. Go to "Console" tab
3. Look for red error messages
4. Take screenshot and share with admin

### Step 2: Check Validation
1. Look for red-highlighted cells in gradebook
2. Check autosave status indicator
3. Verify all assessments have names and max scores

### Step 3: Test with Minimal Data
1. Try saving with just 1 student
2. Try saving with just 1 assessment
3. If works, gradually add more data

### Step 4: Check Backend Logs
Admin should check:
```bash
tail -f backend/logs/app-*.log
```

---

## Prevention Tips

1. **Save Regularly**: Don't wait until all scores are entered
2. **Use Autosave**: System auto-saves after 1.2 seconds of inactivity
3. **Check Status**: Watch the autosave indicator (top right)
4. **Validate First**: Fix red-highlighted cells immediately
5. **One Change at a Time**: For large classes, save after each section

---

## Still Having Issues?

If none of the above solutions work:

1. **Take Screenshots** of:
   - The error message
   - Browser console (F12)
   - The gradebook state

2. **Note Details**:
   - When did it start failing?
   - Does it fail for all classes or just one?
   - Does it fail for all students or specific ones?

3. **Contact Support** with:
   - Screenshots
   - Class ID
   - Your user ID
   - Steps to reproduce

---

## Related Documentation

- [Database Errors](DATABASE_ERRORS.md)
- [Attendance Weight Feature](../features/ATTENDANCE_WEIGHT.md)
- [Installation Guide](../setup/INSTALLATION.md)

---

**Last Updated:** 2024
