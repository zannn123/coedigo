# COEDIGO Gradebook Fixes

## Issues Fixed

### 1. Assessment Persistence Problem
**Problem**: Assessments would disappear after page refresh because they used temporary keys.

**Solution**:
- Changed draft assessment key generation to use consistent `assessmentKey()` function
- Added `isDraft` flag to track unsaved assessments
- Improved component ID mapping to persist assessments after save
- Added `force_create` flag to ensure draft assessments are created in database

### 2. Grade Input Saving Issues
**Problem**: Grades couldn't be saved due to overly strict validation.

**Solution**:
- Relaxed validation to only check assessments that have scores entered
- Improved backend validation to handle draft assessments without scores
- Added better error handling and user feedback
- Fixed component ID mapping after successful saves

### 3. Autosave Logic Improvements
**Problem**: Autosave would fail or not trigger properly for new assessments.

**Solution**:
- Enhanced autosave logic to handle draft assessments
- Only trigger autosave when there are actual changes to save
- Better detection of assessments that need to be created
- Improved error states and user feedback

## Key Changes Made

### Frontend (GradeBook.jsx)

1. **Assessment Creation**:
   ```javascript
   function createDraftAssessment(category = 'quiz', period = 'midterm') {
     // Now uses consistent key generation
     return {
       key: assessmentKey(category, formatComponentName(period, assessmentName)),
       isDraft: true, // Track draft status
       // ...
     };
   }
   ```

2. **Validation Logic**:
   ```javascript
   // Only validate columns that have scores entered
   const columnsWithScores = normalizedColumns.filter(column => {
     return grades.some(student => {
       const value = scoreMatrix[student.enrollment_id]?.[column.key];
       return value !== '' && value !== null && value !== undefined;
     });
   });
   ```

3. **Save Process**:
   ```javascript
   // Added force_create flag for new assessments
   force_create: column.isDraft && !componentId,
   ```

### Backend (GradeController.php)

1. **Improved Validation**:
   ```php
   // Only validate max score if there's actually a score being saved
   if ($score !== null && $maxScore <= 0) {
       throw new InvalidArgumentException("Assessment must have max score > 0 when saving scores.");
   }
   
   // Set default max score for new assessments
   if ($maxScore <= 0) {
       $maxScore = $category === 'quiz' ? 50.0 : 100.0;
   }
   ```

2. **Conditional Creation**:
   ```php
   // Only create new component if it has a score or is being explicitly created
   if ($score !== null || !empty($comp['force_create'])) {
       // Create assessment
   }
   ```

### UI Improvements

1. **Visual Indicators**:
   - Draft assessments show "(Draft)" label
   - Highlighted background in setup modal for drafts
   - Better save status indicators

2. **Better Feedback**:
   - Improved success/error messages
   - Clear distinction between assessment creation and score updates
   - Visual feedback for autosave status

## How It Works Now

### Assessment Creation Flow:
1. Faculty clicks "Add Quiz/Exam/Project"
2. Assessment is created with `isDraft: true` flag
3. Assessment appears in UI with "(Draft)" indicator
4. When faculty enters scores or clicks save, assessment is created in database
5. Draft flag is removed and assessment persists after refresh

### Grade Input Flow:
1. Faculty enters scores in input fields
2. Autosave triggers after 1.2 seconds of inactivity
3. Only assessments with scores or draft assessments are processed
4. Backend validates and saves changes
5. UI updates with success feedback and removes draft indicators

### Validation Rules:
- Empty assessments (no name/scores) are ignored
- Max score validation only applies when scores are being saved
- Duplicate name checking only for assessments with data
- Invalid scores prevent saving with clear error messages

## Testing Recommendations

1. **Assessment Persistence**:
   - Add assessments, refresh page → should persist
   - Add assessments with scores → should save and persist
   - Remove assessments → should be deleted properly

2. **Grade Input**:
   - Enter valid scores → should autosave
   - Enter invalid scores → should show error, prevent save
   - Mix of valid/invalid → should save valid ones

3. **Edge Cases**:
   - Create assessment without scores → should persist as draft
   - Create duplicate assessment names → should show error
   - Network errors during save → should show error, allow retry

## Benefits

- ✅ Assessments no longer disappear after refresh
- ✅ Grades can be input and saved successfully
- ✅ Better user feedback and error handling
- ✅ Improved autosave reliability
- ✅ Visual indicators for draft status
- ✅ More flexible validation rules
- ✅ Better error recovery