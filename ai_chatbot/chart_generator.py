import hashlib
import os
import uuid
from datetime import datetime
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from database_tools import (
    get_authorized_student_grade_records,
    get_class_performance_summary,
    get_student_grades,
    get_student_risk_status,
    normalize_role,
)


CHART_DIR = Path(__file__).parent / "static" / "generated_charts"
CHART_URL_PREFIX = "/static/generated_charts"


def generate_chart(user_id, role, entities, intent):
    role = normalize_role(role)
    if not role:
        return {"error": "Invalid role"}
    
    CHART_DIR.mkdir(parents=True, exist_ok=True)
    
    student_name = entities.get("student_name")
    graph_type = entities.get("graph_type", "general_performance")
    subject_hint = entities.get("subject_hint")
    
    if role == "student":
        return _generate_student_own_chart(user_id, graph_type, subject_hint)
    
    # Faculty can generate student graphs and class graphs
    if role in {"faculty", "dean", "program_chair", "admin"}:
        if student_name:
            return _generate_student_chart_for_faculty(user_id, role, student_name, graph_type, subject_hint)
        else:
            # Class-level graphs
            if intent in {"class_attendance_graph", "poor_attendance_students"} or graph_type == "attendance":
                return _generate_class_attendance_chart(user_id, role)
            elif intent in {"class_risk_graph", "high_risk_students", "high_risk_chart"} or graph_type == "risk":
                return _generate_class_risk_chart(user_id, role)
            else:
                return _generate_class_chart(user_id, role)
    
    return {"error": "Unsupported role or graph type"}


def _generate_student_own_chart(user_id, graph_type, subject_hint):
    if graph_type == "attendance":
        rows = get_student_risk_status(user_id)
        if not rows:
            return {"error": "No attendance data found"}
        
        data = []
        for row in rows[:10]:
            if row.get("attendance_percentage") is not None:
                data.append({
                    "subject": row.get("subject_code") or "Unknown",
                    "value": float(row["attendance_percentage"])
                })
        
        if not data:
            return {"error": "No attendance data available"}
        
        filename = _generate_bar_chart(
            data,
            "Attendance Percentage by Subject",
            "Subject",
            "Attendance %",
            "attendance"
        )
        
        return {
            "graph_url": f"{CHART_URL_PREFIX}/{filename}",
            "graph_path": str(CHART_DIR / filename),
            "summary": f"Your attendance ranges from {min(d['value'] for d in data):.1f}% to {max(d['value'] for d in data):.1f}%."
        }
    
    if graph_type in {"grades", "performance", "general_performance"}:
        rows = get_student_grades(user_id, subject_hint)
        if not rows:
            return {"error": "No grade data found"}
        
        data = []
        for row in rows[:10]:
            if row.get("weighted_score") is not None:
                data.append({
                    "subject": row.get("subject_code") or "Unknown",
                    "value": float(row["weighted_score"])
                })
        
        if not data:
            return {"error": "No computed grades available"}
        
        filename = _generate_bar_chart(
            data,
            "Grade Performance by Subject",
            "Subject",
            "Grade %",
            "grades"
        )
        
        return {
            "graph_url": f"{CHART_URL_PREFIX}/{filename}",
            "graph_path": str(CHART_DIR / filename),
            "summary": f"Your grades range from {min(d['value'] for d in data):.1f}% to {max(d['value'] for d in data):.1f}%."
        }
    
    if graph_type == "risk":
        rows = get_student_risk_status(user_id)
        if not rows:
            return {"error": "No risk data found"}
        
        risk_counts = {"High Risk": 0, "Medium Risk": 0, "Low Risk": 0}
        for row in rows:
            level = row.get("risk_level", "Low Risk")
            if level in risk_counts:
                risk_counts[level] += 1
        
        data = [{"label": k, "value": v} for k, v in risk_counts.items() if v > 0]
        if not data:
            return {"error": "No risk data available"}
        
        filename = _generate_pie_chart(data, "Risk Level Distribution")
        
        return {
            "graph_url": f"{CHART_URL_PREFIX}/{filename}",
            "graph_path": str(CHART_DIR / filename),
            "summary": f"You have {risk_counts['High Risk']} high-risk, {risk_counts['Medium Risk']} medium-risk subjects."
        }
    
    return {"error": "Unsupported graph type"}


def _generate_student_chart_for_faculty(user_id, role, student_name, graph_type, subject_hint):
    rows = get_authorized_student_grade_records(user_id, role, student_name, subject_hint)
    if not rows:
        return {"error": f"No grade record found for {student_name} in your handled classes."}
    
    # Group by student to handle multiple matches
    student_groups = {}
    for row in rows:
        sid = int(row.get("student_user_id") or 0)
        if sid not in student_groups:
            student_groups[sid] = []
        student_groups[sid].append(row)
    
    # Multiple students matched
    if len(student_groups) > 1:
        names = [rows[0].get("student_name") for rows in student_groups.values()]
        return {
            "error": f"Multiple students match '{student_name}': {', '.join(names[:3])}. Please be more specific.",
            "needs_clarification": True
        }
    
    student_rows = list(student_groups.values())[0]
    actual_name = student_rows[0].get("student_name", student_name)
    
    # Group by subject to check if we need clarification
    subject_groups = {}
    for row in student_rows:
        subject_key = (row.get("subject_code"), row.get("section"))
        if subject_key not in subject_groups:
            subject_groups[subject_key] = []
        subject_groups[subject_key].append(row)
    
    # Multiple subjects and no hint - ask for clarification
    if len(subject_groups) > 1 and not subject_hint:
        subject_list = []
        for (code, section), _ in list(subject_groups.items())[:5]:
            if section:
                subject_list.append(f"{code} (Section {section})")
            else:
                subject_list.append(code)
        
        return {
            "error": f"{actual_name} is enrolled in {len(subject_groups)} subjects. Which subject? Options: {', '.join(subject_list)}",
            "needs_clarification": True,
            "clarification_options": subject_list
        }
    
    # Single subject or subject specified - generate detailed component graph
    if subject_hint or len(subject_groups) == 1:
        # Get the specific subject data
        if subject_hint:
            target_rows = student_rows
        else:
            target_rows = list(subject_groups.values())[0]
        
        # Generate component breakdown graph (quiz, exam, project)
        return _generate_student_component_graph(target_rows, actual_name, graph_type)
    
    # Fallback: show all subjects
    return _generate_student_all_subjects_graph(student_rows, actual_name, graph_type)


def _generate_student_component_graph(rows, student_name, graph_type):
    """Generate detailed component breakdown for a specific subject"""
    if not rows:
        return {"error": "No data available"}
    
    row = rows[0]
    subject = row.get("subject_code") or "Unknown"
    section = row.get("section")
    subject_label = f"{subject} (Section {section})" if section else subject
    
    # Get component scores
    data = []
    
    # Quiz average
    quiz_avg = row.get("quiz_avg")
    if quiz_avg is not None:
        data.append({"component": "Quiz Average", "score": float(quiz_avg)})
    
    # Major exam average
    exam_avg = row.get("major_exam_avg")
    if exam_avg is not None:
        data.append({"component": "Exam Average", "score": float(exam_avg)})
    
    # Project average
    project_avg = row.get("project_avg")
    if project_avg is not None:
        data.append({"component": "Project Average", "score": float(project_avg)})
    
    # Weighted score
    weighted = row.get("weighted_score")
    if weighted is not None:
        data.append({"component": "Overall Grade", "score": float(weighted)})
    
    if not data:
        return {"error": f"No computed scores available for {student_name} in {subject_label}"}
    
    # Generate bar chart
    fig, ax = plt.subplots(figsize=(10, 6))
    
    components = [d["component"] for d in data]
    scores = [d["score"] for d in data]
    
    colors = ['#3498db' if s >= 75 else '#e74c3c' if s < 60 else '#f39c12' for s in scores]
    
    bars = ax.bar(components, scores, color=colors, alpha=0.8)
    ax.set_xlabel('Assessment Component', fontsize=12, fontweight='bold')
    ax.set_ylabel('Score (%)', fontsize=12, fontweight='bold')
    ax.set_title(f'{student_name} - {subject_label}\nPerformance Breakdown', fontsize=14, fontweight='bold')
    ax.axhline(y=75, color='gray', linestyle='--', linewidth=1, alpha=0.5, label='Passing (75%)')
    ax.set_ylim(0, 100)
    ax.legend()
    ax.grid(axis='y', alpha=0.3)
    
    # Add value labels on bars
    for bar, score in zip(bars, scores):
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2., height,
                f'{score:.1f}%',
                ha='center', va='bottom', fontweight='bold')
    
    plt.xticks(rotation=15, ha='right')
    plt.tight_layout()
    
    filename = _safe_filename(f"student_components_{subject}")
    filepath = CHART_DIR / filename
    plt.savefig(filepath, dpi=100, bbox_inches='tight')
    plt.close(fig)
    
    # Generate summary
    lowest = min(data, key=lambda x: x["score"])
    highest = max(data, key=lambda x: x["score"])
    
    summary = f"Here is the performance breakdown for {student_name} in {subject_label}. "
    summary += f"Highest: {highest['component']} ({highest['score']:.1f}%), "
    summary += f"Lowest: {lowest['component']} ({lowest['score']:.1f}%). "
    
    if weighted and float(weighted) < 75:
        summary += f"Overall grade is {float(weighted):.1f}% - needs improvement."
    elif weighted:
        summary += f"Overall grade is {float(weighted):.1f}% - performing well."
    
    return {
        "graph_url": f"{CHART_URL_PREFIX}/{filename}",
        "graph_path": str(filepath),
        "summary": summary
    }


def _generate_student_all_subjects_graph(rows, student_name, graph_type):
    """Generate overview graph across all subjects"""
    data = []
    for row in rows[:10]:
        if row.get("weighted_score") is not None:
            subject = row.get("subject_code") or "Unknown"
            section = row.get("section")
            label = f"{subject} ({section})" if section else subject
            data.append({"subject": label, "value": float(row["weighted_score"])})
    
    if not data:
        return {"error": f"No computed grades available for {student_name}"}
    
    filename = _generate_bar_chart(
        data,
        f"Grade Performance - {student_name}",
        "Subject",
        "Grade %",
        "student_grades"
    )
    
    return {
        "graph_url": f"{CHART_URL_PREFIX}/{filename}",
        "graph_path": str(CHART_DIR / filename),
        "summary": f"{student_name}'s grades range from {min(d['value'] for d in data):.1f}% to {max(d['value'] for d in data):.1f}% across {len(data)} subjects."
    }


def _generate_class_chart(user_id, role):
    rows = get_class_performance_summary(user_id, role)
    if not rows:
        return {"error": "No class summary data found"}
    
    # Prepare data with more details
    data = []
    for row in rows[:15]:
        avg = row.get("average_weighted_score")
        if avg is not None and float(avg) > 0:
            subject = row.get("subject_code") or "Unknown"
            section = row.get("section")
            label = f"{subject}\n({section})" if section else subject
            data.append({
                "subject": label,
                "value": float(avg),
                "student_count": int(row.get("student_count") or 0),
                "low_grade_count": int(row.get("low_grade_count") or 0)
            })
    
    if not data:
        return {"error": "No sufficient score data to generate graph"}
    
    # Sort by average score to show problem areas first
    data.sort(key=lambda x: x["value"])
    
    # Generate enhanced bar chart
    fig, ax = plt.subplots(figsize=(12, 7))
    
    subjects = [d["subject"] for d in data]
    values = [d["value"] for d in data]
    
    colors = ['#2ecc71' if v >= 80 else '#f39c12' if v >= 75 else '#e74c3c' for v in values]
    
    bars = ax.bar(subjects, values, color=colors, alpha=0.8, edgecolor='black', linewidth=0.5)
    ax.set_xlabel('Subject (Section)', fontsize=12, fontweight='bold')
    ax.set_ylabel('Average Grade %', fontsize=12, fontweight='bold')
    ax.set_title('Class Performance by Subject\nAverage Grades Across All Students', fontsize=14, fontweight='bold')
    ax.axhline(y=75, color='red', linestyle='--', linewidth=2, alpha=0.7, label='Passing Line (75%)')
    ax.axhline(y=80, color='green', linestyle='--', linewidth=1, alpha=0.5, label='Good Performance (80%)')
    ax.set_ylim(0, 100)
    ax.legend(loc='upper right')
    ax.grid(axis='y', alpha=0.3)
    
    # Add value labels on bars
    for bar, d in zip(bars, data):
        height = bar.get_height()
        ax.text(bar.get_x() + bar.get_width()/2., height,
                f'{d["value"]:.1f}%\n({d["student_count"]} students)',
                ha='center', va='bottom', fontsize=8, fontweight='bold')
    
    plt.xticks(rotation=45, ha='right', fontsize=9)
    plt.tight_layout()
    
    filename = _safe_filename("class_performance")
    filepath = CHART_DIR / filename
    plt.savefig(filepath, dpi=120, bbox_inches='tight')
    plt.close(fig)
    
    # Generate detailed summary
    below_passing = [d for d in data if d["value"] < 75]
    good_performance = [d for d in data if d["value"] >= 80]
    
    summary = f"Class performance across {len(data)} subjects: "
    summary += f"Average ranges from {min(d['value'] for d in data):.1f}% to {max(d['value'] for d in data):.1f}%. "
    
    if below_passing:
        subjects_list = [d['subject'].replace('\n', ' ') for d in below_passing[:3]]
        summary += f"{len(below_passing)} subject(s) below passing (75%): {', '.join(subjects_list)}. "
    
    if good_performance:
        summary += f"{len(good_performance)} subject(s) performing well (≥80%). "
    
    if below_passing:
        summary += "Focus intervention on subjects below passing line."
    else:
        summary += "All subjects meeting minimum standards."
    
    return {
        "graph_url": f"{CHART_URL_PREFIX}/{filename}",
        "graph_path": str(filepath),
        "summary": summary
    }


def _generate_class_attendance_chart(user_id, role):
    from database_tools import get_attendance_concerns, get_students_needing_attention
    
    # Get all students to calculate attendance stats
    rows = get_students_needing_attention(user_id, role)
    if not rows:
        return {"error": "No student data found"}
    
    # Group by subject and calculate average attendance
    subject_attendance = {}
    for row in rows:
        subject = row.get("subject_code") or "Unknown"
        attendance = row.get("attendance_percentage")
        if attendance is not None:
            if subject not in subject_attendance:
                subject_attendance[subject] = []
            subject_attendance[subject].append(float(attendance))
    
    if not subject_attendance:
        return {"error": "No attendance data available"}
    
    data = []
    for subject, attendances in list(subject_attendance.items())[:10]:
        avg_attendance = sum(attendances) / len(attendances)
        data.append({
            "subject": subject,
            "value": round(avg_attendance, 2)
        })
    
    data.sort(key=lambda x: x["value"])
    
    filename = _generate_bar_chart(
        data,
        "Class Attendance by Subject",
        "Subject",
        "Average Attendance %",
        "class_attendance"
    )
    
    low_attendance = [d for d in data if d["value"] < 75]
    summary = f"Average attendance ranges from {min(d['value'] for d in data):.1f}% to {max(d['value'] for d in data):.1f}%."
    if low_attendance:
        summary += f" {len(low_attendance)} subject(s) have attendance below 75%."
    
    return {
        "graph_url": f"{CHART_URL_PREFIX}/{filename}",
        "graph_path": str(CHART_DIR / filename),
        "summary": summary
    }


def _generate_class_risk_chart(user_id, role):
    from database_tools import get_high_risk_students, get_students_needing_attention
    
    rows = get_students_needing_attention(user_id, role)
    if not rows:
        return {"error": "No student data found"}
    
    # Count risk levels
    risk_counts = {"High Risk": 0, "Medium Risk": 0, "Low Risk": 0}
    for row in rows:
        level = row.get("risk_level", "Low Risk")
        if level in risk_counts:
            risk_counts[level] += 1
    
    data = []
    for level in ["High Risk", "Medium Risk", "Low Risk"]:
        if risk_counts[level] > 0:
            data.append({"label": level, "value": risk_counts[level]})
    
    if not data:
        return {"error": "No risk data available"}
    
    filename = _generate_pie_chart(data, "Class Risk Distribution")
    
    total = sum(risk_counts.values())
    summary = f"Out of {total} students: {risk_counts['High Risk']} high-risk, {risk_counts['Medium Risk']} medium-risk, {risk_counts['Low Risk']} low-risk."
    
    return {
        "graph_url": f"{CHART_URL_PREFIX}/{filename}",
        "graph_path": str(CHART_DIR / filename),
        "summary": summary
    }


def _generate_bar_chart(data, title, xlabel, ylabel, chart_type):
    fig, ax = plt.subplots(figsize=(10, 6))
    
    subjects = [d["subject"] for d in data]
    values = [d["value"] for d in data]
    
    colors = ['#2ecc71' if v >= 75 else '#e74c3c' if v < 60 else '#f39c12' for v in values]
    
    ax.bar(subjects, values, color=colors, alpha=0.8)
    ax.set_xlabel(xlabel, fontsize=12)
    ax.set_ylabel(ylabel, fontsize=12)
    ax.set_title(title, fontsize=14, fontweight='bold')
    ax.axhline(y=75, color='gray', linestyle='--', linewidth=1, alpha=0.5, label='Passing (75%)')
    ax.legend()
    ax.grid(axis='y', alpha=0.3)
    
    plt.xticks(rotation=45, ha='right')
    plt.tight_layout()
    
    filename = _safe_filename(chart_type)
    filepath = CHART_DIR / filename
    plt.savefig(filepath, dpi=100, bbox_inches='tight')
    plt.close(fig)
    
    return filename


def _generate_pie_chart(data, title):
    fig, ax = plt.subplots(figsize=(8, 8))
    
    labels = [d["label"] for d in data]
    values = [d["value"] for d in data]
    colors = ['#e74c3c', '#f39c12', '#2ecc71']
    
    ax.pie(values, labels=labels, autopct='%1.1f%%', colors=colors, startangle=90)
    ax.set_title(title, fontsize=14, fontweight='bold')
    
    filename = _safe_filename("risk_distribution")
    filepath = CHART_DIR / filename
    plt.savefig(filepath, dpi=100, bbox_inches='tight')
    plt.close(fig)
    
    return filename


def _safe_filename(prefix):
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    random_id = uuid.uuid4().hex[:8]
    return f"{prefix}_{timestamp}_{random_id}.png"
