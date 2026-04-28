# Subject Approval Workflow

## Overview
Faculty-created subjects now require approval from Program Chairs before they can be used in class creation. This ensures curriculum quality and prevents miscategorization.

---

## How It Works

### For Faculty
1. **Create Subject** → Status: `Pending`
2. **Wait for Approval** → Program Chair reviews
3. **Approved** → Subject becomes available for class creation
4. **Rejected** → Faculty can see rejection reason and create a corrected version

### For Program Chairs
1. **View Pending Subjects** → Filter by "Pending" tab
2. **Review Details** → Check code, name, program, units
3. **Approve or Reject**:
   - **Approve** → Subject becomes available immediately
   - **Reject** → Provide reason (e.g., "Wrong program - should be General, not BSCE")

### For Admin
- Can approve/reject ANY subject
- Can edit ANY subject (even pending ones)
- Auto-approved when Admin creates subjects

---

## UI Features

### Filter Tabs
- **All Subjects** - Show everything
- **Pending** - Subjects awaiting approval (Program Chair/Admin only)
- **Approved** - Active subjects
- **Rejected** - Subjects that were rejected

### Status Badges
- 🟡 **Pending** - Yellow badge with clock icon
- 🟢 **Approved** - Green badge with checkmark
- 🔴 **Rejected** - Red badge with X icon

### Actions
- **Approve Button** - Green button with checkmark (Program Chair/Admin only)
- **Reject Button** - Red button with X icon (Program Chair/Admin only)
- **Reason Button** - View rejection reason (for rejected subjects)
- **Edit Button** - Edit subject details

---

## Database Changes

### Migration File
`database/migration_subject_approval.sql`

### New Fields in `subjects` Table
```sql
approval_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending'
approved_by INT DEFAULT NULL
approved_at DATETIME DEFAULT NULL
rejection_reason TEXT DEFAULT NULL
```

---

## API Endpoints

### Approve Subject
```
POST /api/subjects/{id}/approve
Authorization: Admin or Program Chair
```

### Reject Subject
```
POST /api/subjects/{id}/reject
Body: { "reason": "Explanation here" }
Authorization: Admin or Program Chair
```

### List Subjects with Filter
```
GET /api/subjects?status=pending
GET /api/subjects?status=approved
GET /api/subjects?status=rejected
```

---

## Permissions

| Role | Create | Approve | Reject | Edit Any | View Pending |
|------|--------|---------|--------|----------|--------------|
| **Faculty** | ✅ (Pending) | ❌ | ❌ | ❌ | ❌ |
| **Program Chair** | ✅ (Auto-approved) | ✅ (Own program) | ✅ (Own program) | ❌ | ✅ |
| **Admin** | ✅ (Auto-approved) | ✅ (All) | ✅ (All) | ✅ | ✅ |

---

## Installation

### 1. Run Migration
```bash
mysql -u root -p coedigo_db < database/migration_subject_approval.sql
```

### 2. Restart Backend
```bash
cd backend
php -S localhost:8000
```

### 3. Restart Frontend
```bash
cd frontend
npm run dev
```

---

## Usage Examples

### Example 1: Faculty Creates Subject
```
Faculty: Creates "CE 401 - Structural Design"
System: Status = Pending
Faculty: Sees message "Subject created. Awaiting approval from Program Chair."
```

### Example 2: Program Chair Approves
```
Program Chair: Filters by "Pending"
Program Chair: Reviews "CE 401 - Structural Design"
Program Chair: Clicks "Approve"
System: Status = Approved
Faculty: Can now use subject in class creation
```

### Example 3: Program Chair Rejects
```
Program Chair: Reviews "CE 301 - Math"
Program Chair: Clicks "Reject"
Program Chair: Enters reason: "Math subjects should be under General, not BSCE program"
System: Status = Rejected
Faculty: Sees rejection reason and can create corrected version
```

---

## Benefits

✅ **Quality Control** - Prevents miscategorized subjects  
✅ **Academic Oversight** - Program Chairs maintain curriculum integrity  
✅ **Clear Workflow** - Faculty knows status of their submissions  
✅ **Audit Trail** - Track who approved/rejected and when  
✅ **Flexible** - Admin can override when needed  

---

## Troubleshooting

### Issue: Faculty can't see their pending subjects
**Solution**: Pending subjects are hidden from class creation until approved. Faculty can still see them in Subject Management with "Pending" badge.

### Issue: Program Chair can't approve subject from another program
**Solution**: This is by design. Program Chairs can only approve subjects for their own program. Admin can approve any subject.

### Issue: Existing subjects not showing
**Solution**: Run the migration - it auto-approves all existing subjects for backward compatibility.

---

## Future Enhancements

- Email notifications when subject is approved/rejected
- Bulk approval for multiple subjects
- Subject revision history
- Program Chair dashboard with pending count

---

**Version:** 2.1.0  
**Last Updated:** 2024  
**Feature:** Subject Approval Workflow
