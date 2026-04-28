# Attendance Weight Customization

Faculty can customize how much attendance contributes to Performance Tasks (0-100%).

---

## 📋 Overview

The attendance weight feature allows faculty to control the impact of attendance on student grades. Instead of a fixed contribution, faculty can now set attendance weight from 0% (disabled) to 100% (full credit).

---

## ✨ Key Features

- 🎚️ **Adjustable Weight**: 0-100% slider control
- 💾 **Per-Class Setting**: Each class can have different weight
- 🔄 **Real-time Computation**: Grades update automatically
- 📱 **Mobile-Friendly**: Responsive slider interface
- 🎯 **Precise Control**: Number input for exact values

---

## 🎯 How It Works

### Weight Levels

**100% (Full Credit) - Default**
- Attendance fully counted in Performance Tasks
- Present = 1 point, transmuted to 50-100 scale
- Current system behavior

**50% (Half Credit)**
- Attendance counts half as much
- Example: 10/10 attendance → 5/5 points counted
- Reduces attendance impact

**0% (Disabled)**
- Attendance tracked but doesn't affect grades
- Records saved for reference only
- Useful for online/hybrid classes

### Calculation Formula

```
Adjusted Score = Total Points × (Weight / 100)
Adjusted Max = Possible Points × (Weight / 100)
```

### Example Calculation

**Scenario:**
- Student attendance: 8/10 (80%)
- Attendance weight: 50%
- Other projects: 90/100

**Calculation:**
```
Attendance contribution:
- Raw: 8/10 points
- Adjusted: 8 × 0.5 = 4 points
- Max adjusted: 10 × 0.5 = 5 points
- Transmuted: (4/5 × 50) + 50 = 90%

Performance Tasks average:
- Projects: 90%
- Attendance: 90%
- Average: 90%

Final grade contribution:
- Performance Tasks (40%): 90 × 0.40 = 36%
```

---

## 🎨 User Interface

### Settings Modal

**Components:**
1. **Slider Control**
   - Range: 0-100
   - Step: 5
   - Visual gradient indicator

2. **Number Input**
   - Precise value entry
   - Validation (0-100)
   - Real-time sync with slider

3. **Percentage Display**
   - Large, prominent number
   - Color-coded (accent color)
   - Updates in real-time

4. **Quick Reference**
   - 0% = Disabled
   - 50% = Half credit
   - 100% = Full credit

5. **Explanation Panel**
   - How it works
   - Impact on grades
   - Calculation details

### Access Points

**Gradebook Banner:**
- Shows current weight: "Attendance contributes X% to Performance Tasks"
- "Customize" button opens settings modal
- Always visible for quick access

---

## 🔧 Technical Implementation

### Database Changes

**Table:** `class_records`

**New Column:**
```sql
attendance_weight DECIMAL(5,2) DEFAULT 100.00
COMMENT 'Percentage of attendance contribution to performance tasks (0-100)'
```

**Migration:**
```bash
mysql -u root -p coedigo_db < database/migration_attendance_weight.sql
```

### Backend Changes

**GradeController.php**

1. **computeGradeInternal()**
   ```php
   // Fetch attendance weight for class
   $attendanceWeight = $classData['attendance_weight'] ?? 100.0;
   $attendanceWeight = max(0, min(100, $attendanceWeight)) / 100;
   ```

2. **calculateTermStats()**
   ```php
   // Apply weight to attendance value
   if ($attendanceValue !== null && $attendanceWeight > 0) {
       $projectValues[] = $attendanceValue * $attendanceWeight;
   }
   ```

3. **syncAttendanceComponent()**
   ```php
   // Adjust scores based on weight
   $adjustedScore = $summary['total_points'] * $attendanceWeight;
   $adjustedMax = $summary['possible_points'] * $attendanceWeight;
   ```

**ClassController.php**

```php
// Allow updating attendance_weight
if ($f === 'attendance_weight') {
    $value = max(0, min(100, (float)$data[$f]));
    $fields[] = "$f = ?";
    $params[] = $value;
}
```

### Frontend Changes

**GradeBook.jsx**

**State Management:**
```javascript
const [attendanceWeight, setAttendanceWeight] = useState(100);
const [showAttendanceSettings, setShowAttendanceSettings] = useState(false);
const [savingAttendanceWeight, setSavingAttendanceWeight] = useState(false);
```

**API Integration:**
```javascript
const saveAttendanceWeight = async () => {
  await api.put(`/classes/${classId}`, { 
    attendance_weight: attendanceWeight 
  });
  fetchData(); // Refresh grades
};
```

**UI Components:**
- Slider with gradient background
- Number input with validation
- Modal with explanations
- Toast notifications

---

## 📖 Faculty Guide

### Setting Attendance Weight

**Step 1: Open Gradebook**
- Navigate to Faculty → Classes
- Click on a class to open gradebook

**Step 2: Access Settings**
- Look for attendance info banner
- Click "Customize" button

**Step 3: Adjust Weight**
- Use slider for quick adjustment (5% increments)
- Or type exact value in number input
- See real-time percentage display

**Step 4: Save Changes**
- Click "Save Weight" button
- Wait for confirmation toast
- Grades automatically recompute

### Use Cases

**Scenario 1: Traditional Face-to-Face Class**
- Set weight: 100%
- Full attendance credit
- Encourages regular attendance

**Scenario 2: Hybrid Class**
- Set weight: 50%
- Reduced attendance impact
- Balances online/offline participation

**Scenario 3: Fully Online Class**
- Set weight: 0%
- Attendance disabled
- Focus on performance tasks only

**Scenario 4: Lab-Heavy Course**
- Set weight: 75%
- Moderate attendance importance
- Emphasizes hands-on work

---

## 🔄 Grade Recomputation

### Automatic Updates

When attendance weight changes:
1. ✅ All student grades recompute automatically
2. ✅ Attendance component scores adjust
3. ✅ Performance Tasks averages recalculate
4. ✅ Final grades update
5. ✅ Class status resets to "draft"

### Manual Recomputation

If needed, click "Compute" button in gradebook toolbar.

---

## 📊 Impact on Grades

### Before (100% Weight)

```
Student A:
- Attendance: 10/10 = 100% transmuted
- Projects: 85/100 = 85% transmuted
- Performance Tasks: (100 + 85) / 2 = 92.5%
```

### After (50% Weight)

```
Student A:
- Attendance: 5/5 (adjusted) = 100% transmuted
- Projects: 85/100 = 85% transmuted
- Performance Tasks: (100 + 85) / 2 = 92.5%
(Same result, but attendance has less weight in average)
```

### After (0% Weight)

```
Student A:
- Attendance: Not counted
- Projects: 85/100 = 85% transmuted
- Performance Tasks: 85%
(Only projects count)
```

---

## ⚠️ Important Notes

### Data Preservation
- ✅ Attendance records always saved
- ✅ Changing weight doesn't delete data
- ✅ Can revert to 100% anytime
- ✅ Historical data intact

### Grade Status
- ⚠️ Changing weight resets class to "draft"
- ⚠️ Must re-verify before releasing
- ⚠️ Students see updated grades after verification

### Default Behavior
- 📌 New classes: 100% (full credit)
- 📌 Existing classes: 100% (no change)
- 📌 Can be changed anytime

---

## 🐛 Troubleshooting

### Weight not saving
→ Check browser console for errors  
→ Verify you're the class faculty  
→ Ensure value is 0-100

### Grades not updating
→ Click "Compute" button manually  
→ Refresh page  
→ Check backend logs

### Modal not opening
→ Clear browser cache  
→ Hard refresh (Ctrl+F5)  
→ Check JavaScript console

---

## 📚 Related Documentation

- [Grade Computation](GRADE_COMPUTATION.md)
- [Gradebook Guide](GRADEBOOK.md)
- [Class Management](CLASS_MANAGEMENT.md)

---

## 🔄 Version History

**v2.0** - Initial release
- Customizable attendance weight
- Slider interface
- Per-class settings

---

**Feature Status:** ✅ Production Ready  
**Last Updated:** 2024
