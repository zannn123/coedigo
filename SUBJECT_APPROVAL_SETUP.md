# Subject Approval Setup Guide

Complete setup instructions for the Subject Approval feature.

---

## 📋 Prerequisites

Before setting up the Subject Approval feature, ensure you have:

- ✅ COEDIGO system installed
- ✅ MySQL/MariaDB running
- ✅ Database access credentials
- ✅ Backend and frontend servers running

---

## 🗄️ Database Migration

### For Existing Installations

If you already have COEDIGO installed, run this migration:

```bash
# Navigate to project root
cd COEDIGO

# Run the migration
mysql -u root -p coedigo_db < database/migration_subject_approval.sql
```

**What this does:**
- Adds `approval_status` column (pending/approved/rejected)
- Adds `approved_by` column (foreign key to users)
- Adds `approved_at` column (timestamp)
- Adds `rejection_reason` column (text)
- Updates existing subjects to 'approved' status
- Creates necessary indexes

### For New Installations

The main schema (`database/coedigo.sql`) already includes these fields. Just run:

```bash
mysql -u root -p < database/coedigo.sql
```

---

## ✅ Verify Migration

Check if the migration was successful:

```sql
-- Connect to database
mysql -u root -p coedigo_db

-- Check subjects table structure
DESCRIBE subjects;

-- Should show these columns:
-- approval_status ENUM('pending', 'approved', 'rejected')
-- approved_by INT
-- approved_at DATETIME
-- rejection_reason TEXT

-- Check existing subjects
SELECT id, code, name, approval_status, approved_by, approved_at 
FROM subjects 
LIMIT 5;

-- All existing subjects should be 'approved'
```

---

## 👥 Create Program Chair User

Program Chairs need to be created with the correct role:

### Via Admin Panel

1. Login as admin
2. Go to **User Management**
3. Click **Add User**
4. Fill in details:
   - **Role:** Program Chair
   - **Program:** BSCE, BSEE, BSCpE, etc.
   - **Email:** chair@jrmsu.edu.ph
   - **Password:** (temporary password)
5. Click **Create User**

### Via SQL

```sql
-- Create Program Chair user
INSERT INTO users (
    employee_id, 
    first_name, 
    last_name, 
    email, 
    password_hash, 
    role, 
    program, 
    department,
    is_active
) VALUES (
    'PC-001',
    'John',
    'Doe',
    'chair.bsce@jrmsu.edu.ph',
    '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- password: admin123
    'program_chair',
    'BSCE',
    'College of Engineering',
    1
);
```

---

## 🧪 Test the Feature

### 1. Test as Faculty

**Create a pending subject:**

```bash
# Login as faculty
# Go to Subjects page
# Click "Add Subject"
```

Fill in:
- **Code:** TEST101
- **Name:** Test Subject
- **Units:** 3
- **Program:** BSCE
- **Description:** Test subject for approval

**Expected Result:**
- ✅ Subject created
- ✅ Status: "Pending"
- ✅ Message: "Subject created. Awaiting approval from Program Chair."
- ✅ Program Chair receives notification

### 2. Test as Program Chair

**Login as Program Chair:**

```bash
# Login with program chair credentials
# Check notification badge (should show "1")
# Click bell icon
# See: "New Subject Awaiting Approval"
```

**Go to Subject Approval:**
- Click **Subject Approval** in navbar
- See orange alert: "1 subject awaiting approval"
- See TEST101 in Pending tab

**Approve the subject:**
- Click **✓ Approve** button
- Toast: "Subject approved successfully"
- Subject moves to Approved tab
- Faculty receives notification

**Test rejection:**
- Create another test subject as faculty
- As Program Chair, click **✗ Reject**
- Enter reason: "Test rejection"
- Click **Confirm Rejection**
- Faculty receives notification with reason

### 3. Test Notifications

**Program Chair notifications:**
```sql
-- Check notifications for program chair
SELECT * FROM notifications 
WHERE user_id = [program_chair_id] 
ORDER BY created_at DESC 
LIMIT 5;
```

**Faculty notifications:**
```sql
-- Check notifications for faculty
SELECT * FROM notifications 
WHERE user_id = [faculty_id] 
ORDER BY created_at DESC 
LIMIT 5;
```

---

## 🔧 Configuration

### Backend Routes

Ensure these routes are accessible in `backend/index.php`:

```php
// Subject approval routes
$router->get('/subjects', [SubjectController::class, 'index']);
$router->post('/subjects', [SubjectController::class, 'create']);
$router->put('/subjects/{id}', [SubjectController::class, 'update']);
$router->put('/subjects/{id}/approve', [SubjectController::class, 'approve']);
$router->put('/subjects/{id}/reject', [SubjectController::class, 'reject']);
$router->delete('/subjects/{id}', [SubjectController::class, 'delete']);
```

### Frontend Routes

Check `frontend/src/App.jsx`:

```javascript
// Program Chair routes
<Route path="/program-chair" element={...}>
  <Route index element={<DeanDashboard />} />
  <Route path="subject-approval" element={<SubjectApproval />} />
  <Route path="account" element={<AccountSettings />} />
</Route>
```

---

## 🐛 Troubleshooting

### Migration Fails

**Error:** "Column 'approval_status' already exists"

**Solution:** Column already exists, skip migration or drop and recreate:

```sql
-- Check if columns exist
SHOW COLUMNS FROM subjects LIKE 'approval_status';

-- If exists, migration already ran
-- If not, run migration again
```

### Program Chair Can't See Subjects

**Check:**
1. User role is 'program_chair'
2. User has a program assigned
3. Subjects have matching program

```sql
-- Check program chair
SELECT id, email, role, program FROM users WHERE role = 'program_chair';

-- Check subjects
SELECT id, code, name, program, approval_status FROM subjects;
```

### Notifications Not Working

**Check notifications table:**

```sql
-- Check if notifications are being created
SELECT * FROM notifications 
WHERE reference_type = 'subject_approval' 
ORDER BY created_at DESC 
LIMIT 10;

-- Check unread count
SELECT user_id, COUNT(*) as unread 
FROM notifications 
WHERE is_read = 0 
GROUP BY user_id;
```

### Frontend Not Loading

**Check console for errors:**
```bash
# Browser console (F12)
# Look for:
# - 404 errors (missing routes)
# - Import errors (missing files)
# - API errors (backend issues)
```

**Restart frontend:**
```bash
cd frontend
npm run dev
```

---

## 📊 Database Schema Reference

### subjects Table

```sql
CREATE TABLE subjects (
    id INT PRIMARY KEY AUTO_INCREMENT,
    code VARCHAR(20) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    units DECIMAL(3,1) NOT NULL DEFAULT 3.0,
    department VARCHAR(100),
    program VARCHAR(150),
    
    -- Approval fields
    approval_status ENUM('pending', 'approved', 'rejected') DEFAULT 'approved',
    approved_by INT,
    approved_at DATETIME,
    rejection_reason TEXT,
    
    is_active TINYINT(1) DEFAULT 1,
    created_by INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (created_by) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id),
    INDEX idx_approval_status (approval_status)
);
```

### notifications Table

```sql
CREATE TABLE notifications (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('grade_released', 'grade_updated', 'system', 'announcement') DEFAULT 'system',
    is_read TINYINT(1) DEFAULT 0,
    reference_type VARCHAR(50),  -- 'subject_approval'
    reference_id INT,             -- subject_id
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## 🔐 Permissions Matrix

| Action | Admin | Program Chair | Faculty | Student |
|--------|-------|---------------|---------|---------|
| Create subject | ✅ Auto-approved | ✅ Auto-approved | ✅ Pending | ❌ |
| View pending subjects | ✅ All | ✅ Own program | ❌ | ❌ |
| Approve subject | ✅ All | ✅ Own program | ❌ | ❌ |
| Reject subject | ✅ All | ✅ Own program | ❌ | ❌ |
| View approved subjects | ✅ | ✅ | ✅ | ✅ |
| Edit subject | ✅ | ✅ | ✅ Own | ❌ |
| Delete subject | ✅ | ❌ | ❌ | ❌ |

---

## 📝 Rollback Instructions

If you need to rollback the migration:

```sql
-- Remove approval columns
ALTER TABLE subjects
DROP COLUMN approval_status,
DROP COLUMN approved_by,
DROP COLUMN approved_at,
DROP COLUMN rejection_reason;

-- Remove subject approval notifications
DELETE FROM notifications WHERE reference_type = 'subject_approval';
```

**Warning:** This will delete all approval history!

---

## ✅ Post-Setup Checklist

- [ ] Migration ran successfully
- [ ] Existing subjects marked as 'approved'
- [ ] Program Chair user created
- [ ] Program Chair can access Subject Approval page
- [ ] Faculty can create subjects (pending status)
- [ ] Program Chair receives notifications
- [ ] Program Chair can approve subjects
- [ ] Program Chair can reject subjects with reason
- [ ] Faculty receives approval/rejection notifications
- [ ] Approved subjects available for class records
- [ ] Pending subjects not visible to students

---

## 🆘 Support

If you encounter issues:

1. **Check logs:**
   ```bash
   # Backend logs
   tail -f backend/logs/app-*.log
   
   # Browser console
   # Press F12 → Console tab
   ```

2. **Verify database:**
   ```sql
   -- Check migration status
   SHOW COLUMNS FROM subjects;
   
   -- Check data
   SELECT * FROM subjects ORDER BY created_at DESC LIMIT 5;
   SELECT * FROM notifications ORDER BY created_at DESC LIMIT 5;
   ```

3. **Test API endpoints:**
   ```bash
   # Get subjects
   curl http://localhost:8000/api/subjects?status=pending
   
   # Approve subject (requires auth token)
   curl -X PUT http://localhost:8000/api/subjects/1/approve \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

---

**Setup Guide Version:** 1.0  
**Last Updated:** 2024  
**Status:** ✅ Complete
