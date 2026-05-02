# Faculty Graph Features - Complete Guide

## Overview

Faculty can now create comprehensive graphs for:
1. **Individual student performance** - Track specific students
2. **Class performance by subject** - See which subjects need attention
3. **Class attendance analysis** - Identify attendance problems
4. **Risk distribution** - Visualize high-risk students

## 1. Individual Student Graphs

### Supported Requests

```
"Create a graph of John Reyes"
"Graph John Reyes' performance"
"Show me a chart for Maria Santos"
"Generate performance graph for John Reyes"
"Visualize John Reyes' grades"
"Make a chart of John Reyes"
```

### What It Shows

- Bar chart of student's grades across all subjects you handle
- Color-coded: Green (≥75%), Orange (60-74%), Red (<60%)
- Includes only subjects where you are the faculty

### Example Response

```json
{
  "reply": "Here is the performance graph for John Reyes. His grades range from 72.0% to 88.5%. He's performing well in most subjects but needs attention in MATH 101.",
  "intent": "student_grade_graph",
  "graph_url": "/static/generated_charts/student_grades_20240101_120000_abc123.png",
  "confidence": 0.94
}
```

### Permission Check

✅ Faculty can graph students enrolled in their classes
❌ Faculty cannot graph students from other faculty's classes

## 2. Class Performance Graph

### Supported Requests

```
"Graph my class performance"
"Show class performance chart"
"Create a graph of class averages"
"Which subjects have low grades?"
"What subject has low grades?"
"Subjects with poor performance"
"Graph class grades by subject"
```

### What It Shows

- Bar chart of average grades per subject
- Shows all subjects you handle
- Identifies subjects needing attention
- Color-coded by performance level

### Example Response

```json
{
  "reply": "Class averages range from 68.5% to 85.2%. MATH 101 and PHYS 201 have averages below 75%.",
  "intent": "class_performance_graph",
  "graph_url": "/static/generated_charts/class_performance_20240101_120000_abc123.png"
}
```

### Use Cases

- Identify struggling subjects
- Compare performance across sections
- Track improvement over time
- Prepare for faculty meetings

## 3. Class Attendance Graph

### Supported Requests

```
"Graph class attendance"
"Show attendance by subject"
"Which subject has many absences?"
"What subject has poor attendance?"
"Create attendance chart"
"Subjects with low attendance"
"Class attendance graph"
"Show me attendance problems"
```

### What It Shows

- Bar chart of average attendance % per subject
- Sorted from lowest to highest
- Highlights subjects below 75% attendance
- Shows attendance trends

### Example Response

```json
{
  "reply": "Average attendance ranges from 62.3% to 91.5%. 2 subject(s) have attendance below 75%: MATH 101 (62.3%) and CHEM 101 (71.2%).",
  "intent": "class_attendance_graph",
  "graph_url": "/static/generated_charts/class_attendance_20240101_120000_abc123.png"
}
```

### Use Cases

- Identify attendance problems early
- Target interventions for specific subjects
- Monitor attendance improvement
- Report to administration

## 4. Class Risk Distribution Graph

### Supported Requests

```
"Graph high-risk students"
"Show risk distribution"
"Chart of high-risk students"
"Visualize student risk levels"
"Risk distribution graph"
"Show me risk breakdown"
"Graph students at risk"
```

### What It Shows

- Pie chart of risk level distribution
- High Risk (red), Medium Risk (orange), Low Risk (green)
- Total count per risk level
- Percentage breakdown

### Example Response

```json
{
  "reply": "Out of 45 students: 8 high-risk, 12 medium-risk, 25 low-risk. Focus on the 8 high-risk students for immediate intervention.",
  "intent": "class_risk_graph",
  "graph_url": "/static/generated_charts/risk_distribution_20240101_120000_abc123.png"
}
```

### Use Cases

- Quick overview of class health
- Prioritize intervention efforts
- Track risk reduction over time
- Report to department heads

## Natural Language Examples

### Scenario 1: Faculty wants to check a specific student

**Faculty:** "Create a graph of John Reyes"

**Chatbot:** 
- Detects intent: `student_grade_graph`
- Extracts entity: `student_name = "John Reyes"`
- Checks permission: ✅ John is enrolled in faculty's class
- Generates PNG chart
- Returns: "Here is the performance graph for John Reyes. His grades range from 72% to 88%."

### Scenario 2: Faculty wants to see which subjects struggle

**Faculty:** "Which subjects have low grades?"

**Chatbot:**
- Detects intent: `class_performance_graph`
- Generates bar chart of class averages
- Returns: "Class averages range from 68% to 85%. MATH 101 and PHYS 201 need attention."

### Scenario 3: Faculty wants attendance analysis

**Faculty:** "Show me which subject has many absences"

**Chatbot:**
- Detects intent: `class_attendance_graph`
- Generates attendance bar chart
- Returns: "Average attendance ranges from 62% to 91%. 2 subjects have attendance below 75%."

### Scenario 4: Faculty wants risk overview

**Faculty:** "Graph high-risk students"

**Chatbot:**
- Detects intent: `class_risk_graph`
- Generates pie chart
- Returns: "Out of 45 students: 8 high-risk, 12 medium-risk, 25 low-risk."

## Conversation Flow Examples

### Example 1: Drilling Down

```
Faculty: "Show class performance"
Bot: [Returns text summary]

Faculty: "Graph that"
Bot: [Generates class performance chart]

Faculty: "Which subject has the lowest?"
Bot: "MATH 101 has the lowest average at 68.5%"

Faculty: "Show me the students in MATH 101"
Bot: [Lists students needing attention in MATH 101]
```

### Example 2: Student Focus

```
Faculty: "Who needs attention?"
Bot: [Lists high-risk students]

Faculty: "Create a graph of John Reyes"
Bot: [Generates John's performance chart]

Faculty: "What about his attendance?"
Bot: "John Reyes has 65% attendance in MATH 101, 78% in PHYS 201..."

Faculty: "Graph class attendance"
Bot: [Generates class attendance chart]
```

### Example 3: Subject Analysis

```
Faculty: "Which subjects have low grades?"
Bot: [Generates class performance chart showing MATH 101 at 68%]

Faculty: "Show high-risk students in MATH 101"
Bot: [Lists high-risk students in MATH 101]

Faculty: "Graph the risk distribution"
Bot: [Generates pie chart showing 8 high-risk, 12 medium-risk]
```

## Technical Details

### Permission System

```python
# Faculty can only graph students in their handled classes
if role == "faculty":
    # Check if student is enrolled in faculty's class
    rows = get_authorized_student_grade_records(user_id, role, student_name)
    if not rows:
        return "No grade record found for that student in your classes"
```

### Graph Generation Flow

1. **Intent Detection** → Identifies graph type
2. **Entity Extraction** → Gets student name (if applicable)
3. **Permission Check** → Verifies faculty handles the data
4. **Data Fetching** → Gets data from database (role-scoped)
5. **Chart Generation** → Creates PNG using matplotlib
6. **File Saving** → Saves to `static/generated_charts/`
7. **Response** → Returns URL and natural language summary

### File Naming

Charts use safe UUID-based names:
```
student_grades_20240101_120000_abc12345.png
class_performance_20240101_120000_def67890.png
class_attendance_20240101_120000_ghi11111.png
risk_distribution_20240101_120000_jkl22222.png
```

## Troubleshooting

### Issue: "No grade record found"

**Cause:** Student not enrolled in your class

**Solution:** Check student name spelling or verify enrollment

### Issue: "No class summary data found"

**Cause:** No students enrolled or no grades computed

**Solution:** Ensure students are enrolled and grades are entered

### Issue: Permission denied

**Cause:** Trying to graph student from another faculty's class

**Solution:** You can only graph students enrolled in your classes

### Issue: Graph shows "No data available"

**Cause:** Students have no computed grades yet

**Solution:** Enter grades in the gradebook first

## Best Practices

### 1. Regular Monitoring

```
Weekly: "Graph class attendance"
Monthly: "Show class performance chart"
Before exams: "Graph high-risk students"
```

### 2. Targeted Interventions

```
1. "Which subjects have low grades?" → Identify problem areas
2. "Show high-risk students in MATH 101" → Get specific students
3. "Create a graph of John Reyes" → Individual analysis
```

### 3. Progress Tracking

```
Week 1: "Graph class performance" → Baseline
Week 4: "Graph class performance" → Compare improvement
Week 8: "Graph class performance" → Final check
```

### 4. Reporting

```
For meetings: "Graph class averages"
For admin: "Show risk distribution"
For parents: "Create a graph of [student name]"
```

## API Response Format

### Student Graph Response

```json
{
  "reply": "Here is the performance graph for John Reyes...",
  "intent": "student_grade_graph",
  "confidence": 0.94,
  "role": "faculty",
  "graph_url": "/static/generated_charts/student_grades_20240101_abc123.png",
  "graph_type": "image",
  "suggested_questions": [
    "Show John Reyes' attendance",
    "Is John Reyes at risk?",
    "Show students needing attention"
  ]
}
```

### Class Graph Response

```json
{
  "reply": "Class averages range from 68.5% to 85.2%...",
  "intent": "class_performance_graph",
  "confidence": 0.92,
  "role": "faculty",
  "graph_url": "/static/generated_charts/class_performance_20240101_def456.png",
  "graph_type": "image",
  "suggested_questions": [
    "Show high-risk students",
    "Which subject needs attention?",
    "Graph class attendance"
  ]
}
```

## Summary

Faculty now have powerful graph capabilities:

✅ **Individual student tracking** - Monitor specific students
✅ **Class performance analysis** - Identify struggling subjects
✅ **Attendance monitoring** - Spot attendance problems
✅ **Risk visualization** - See risk distribution at a glance

All graphs:
- Are permission-checked
- Use natural language
- Generate actual PNG images
- Include helpful summaries
- Suggest follow-up questions

**The chatbot now works like a true LLM assistant for faculty!**
