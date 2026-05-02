import hashlib
import os
import re
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
        options = [_student_option(rows[0], student_name) for rows in student_groups.values()]
        names = [option["label"] for option in options]
        return {
            "error": f"Did you mean one of these students for \"{student_name}\"?",
            "needs_clarification": True,
            "clarification_options": options[:6],
        }
    
    student_rows = list(student_groups.values())[0]
    actual_name = student_rows[0].get("student_name", student_name)

    if graph_type == "attendance":
        return _generate_student_attendance_graph(student_rows, actual_name, subject_hint)

    if graph_type == "risk":
        return _generate_student_risk_graph(student_rows, actual_name)
    
    # Group by subject to check if we need clarification
    subject_groups = {}
    for row in student_rows:
        subject_key = (row.get("subject_code"), row.get("section"))
        if subject_key not in subject_groups:
            subject_groups[subject_key] = []
        subject_groups[subject_key].append(row)
    
    # Multiple subjects and no hint: show an overview graph. Subject-specific
    # clarification is only needed when the user explicitly asks for one subject.
    if len(subject_groups) > 1 and not subject_hint:
        return _generate_student_all_subjects_graph(student_rows, actual_name, graph_type)
    
    # Single subject or subject specified - generate detailed component graph
    if subject_hint or len(subject_groups) == 1:
        # Get the specific subject data
        if subject_hint:
            target_rows = [
                row for row in student_rows
                if _matches_subject(row, subject_hint)
            ] or student_rows
        else:
            target_rows = list(subject_groups.values())[0]
        
        # Generate component breakdown graph (quiz, exam, project)
        return _generate_student_component_graph(target_rows, actual_name, graph_type)
    
    # Fallback: show all subjects
    return _generate_student_all_subjects_graph(student_rows, actual_name, graph_type)


def _generate_student_attendance_graph(rows, student_name, subject_hint=None):
    target_rows = [
        row for row in rows
        if not subject_hint or _matches_subject(row, subject_hint)
    ]

    data = []
    seen = set()
    for row in target_rows[:10]:
        attendance = row.get("attendance_percentage")
        if attendance is None:
            continue
        subject = row.get("subject_code") or "Unknown"
        section = row.get("section")
        key = (subject, section)
        if key in seen:
            continue
        seen.add(key)
        label = f"{subject} ({section})" if section else subject
        data.append({"subject": label, "value": float(attendance)})

    if not data:
        suffix = f" for {subject_hint}" if subject_hint else ""
        return {"error": f"No attendance data available for {student_name}{suffix}."}

    data.sort(key=lambda item: item["value"])
    filename = _generate_bar_chart(
        data,
        f"Attendance - {student_name}",
        "Subject",
        "Attendance %",
        "student_attendance",
    )

    low = [item for item in data if item["value"] < 75]
    summary = (
        f"{student_name}'s attendance ranges from {min(item['value'] for item in data):.1f}% "
        f"to {max(item['value'] for item in data):.1f}% across {len(data)} subject(s)."
    )
    if low:
        summary += f" {len(low)} subject(s) are below the 75% attendance target."

    return {
        "graph_url": f"{CHART_URL_PREFIX}/{filename}",
        "graph_path": str(CHART_DIR / filename),
        "summary": summary,
    }


def _generate_student_risk_graph(rows, student_name):
    risk_counts = {"High Risk": 0, "Medium Risk": 0, "Low Risk": 0}
    for row in rows:
        level = row.get("risk_level") or "Low Risk"
        if level in risk_counts:
            risk_counts[level] += 1

    data = [{"label": level, "value": count} for level, count in risk_counts.items() if count]
    if not data:
        return {"error": f"No risk data available for {student_name}."}

    filename = _generate_pie_chart(data, f"Risk Distribution - {student_name}")
    summary = (
        f"{student_name} has {risk_counts['High Risk']} high-risk, "
        f"{risk_counts['Medium Risk']} medium-risk, and {risk_counts['Low Risk']} low-risk subject record(s)."
    )

    return {
        "graph_url": f"{CHART_URL_PREFIX}/{filename}",
        "graph_path": str(CHART_DIR / filename),
        "summary": summary,
    }


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
    
    # Term scores make it clear whether the record is midterm-only, final-only,
    # or already a completed subject result.
    midterm = row.get("midterm_grade")
    if midterm is not None:
        data.append({"component": "Midterm", "score": float(midterm)})

    final_term = row.get("final_term_score")
    if final_term is not None:
        data.append({"component": "Final Term", "score": float(final_term)})

    subject_score = row.get("overall_grade")
    if subject_score is not None:
        data.append({"component": "Subject Overall", "score": float(subject_score)})

    # Component averages remain useful drill-down signals.
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
    
    weighted = row.get("weighted_score")
    if weighted is not None and subject_score is None and midterm is None and final_term is None:
        data.append({"component": "Current Performance", "score": float(weighted)})
    
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
    ax.axhline(y=75, color='gray', linestyle='--', linewidth=1, alpha=0.5, label='Target (75%)')
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
    
    if subject_score is not None:
        if float(subject_score) < 75:
            summary += f"Combined subject performance is {float(subject_score):.1f}%, below the 75% target."
        else:
            summary += f"Combined subject performance is {float(subject_score):.1f}%."
    elif final_term is not None:
        summary += f"Final-term performance is {float(final_term):.1f}%; subject outcome is still pending until all required data is complete."
    elif midterm is not None:
        summary += f"Midterm performance is {float(midterm):.1f}%; final-term and subject outcome are still pending."
    
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
        summary += f"{len(below_passing)} subject(s) below the 75% target: {', '.join(subjects_list)}. "
    
    if good_performance:
        summary += f"{len(good_performance)} subject(s) performing well (≥80%). "
    
    if below_passing:
        summary += "Focus intervention on subjects below the target line."
    else:
        summary += "All subjects meet the current target line."
    
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
    ax.axhline(y=75, color='gray', linestyle='--', linewidth=1, alpha=0.5, label='Target (75%)')
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


def _student_option(row, query):
    name = row.get("student_name") or "Unnamed student"
    context = []
    if row.get("program"):
        context.append(str(row["program"]))
    if row.get("year_level"):
        context.append(f"Year {row['year_level']}")
    if row.get("section"):
        context.append(f"Section {row['section']}")
    return {
        "label": name,
        "value": f"Create graph for {name}",
        "match": _best_match_fragment(name, query),
        "kind": "student",
        "meta": " · ".join(context),
    }


def _best_match_fragment(name, query):
    tokens = [token for token in re.findall(r"[a-z0-9]+", str(query or "").lower()) if len(token) >= 2]
    lower_name = str(name or "").lower()
    for token in tokens:
        if token in lower_name:
            return token
    return tokens[0] if tokens else ""


def _matches_subject(row, subject_hint):
    text = str(subject_hint or "").lower()
    return (
        text in str(row.get("subject_code") or "").lower()
        or text in str(row.get("subject_name") or "").lower()
        or text in str(row.get("section") or "").lower()
    )
