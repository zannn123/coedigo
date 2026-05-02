import logging
import os
import re
from collections import defaultdict
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import mysql.connector
from dotenv import load_dotenv

from risk_analyzer import analyze_student_risk


load_dotenv()

LOGGER = logging.getLogger(__name__)
VALID_ROLES = {"student", "faculty", "dean", "program_chair", "admin"}
GRADE_VISIBLE_STATUSES = {"faculty_verified", "officially_released"}


class ChatbotDatabaseError(RuntimeError):
    pass


def normalize_role(role):
    if role is None:
        return None
    role = str(role).strip().lower().replace("-", "_")
    return role if role in VALID_ROLES else None


def validate_user(user_id, role):
    role = normalize_role(role)
    if not role:
        return None

    row = _query_one(
        """
        SELECT id, first_name, middle_name, last_name, email, role, department, program, year_level
        FROM users
        WHERE id = %s AND role = %s AND is_active = 1
        LIMIT 1
        """,
        (int(user_id), role),
    )
    if row:
        row["full_name"] = _full_name(row)
    return row


def get_chat_history(user_id, role, limit=40):
    role = normalize_role(role)
    if role is None:
        return []

    ensure_smart_chatbot_tables()
    limit = max(1, min(int(limit), 100))
    row_limit = max(1, (limit + 1) // 2)
    rows = _query_all(
        f"""
        SELECT
            id,
            session_id,
            user_id,
            role,
            user_message,
            detected_intent,
            confidence_score,
            bot_response,
            created_at
        FROM chatbot_messages
        WHERE user_id = %s AND role = %s
        ORDER BY created_at DESC, id DESC
        LIMIT {row_limit}
        """,
        (int(user_id), role),
    )

    history = []
    for row in rows[::-1]:
        if row.get("user_message"):
            history.append({
                "id": f"{row['id']}-user",
                "message_id": row["id"],
                "session_id": row.get("session_id"),
                "message_role": "user",
                "content": row.get("user_message"),
                "intent": row.get("detected_intent"),
                "confidence_score": row.get("confidence_score"),
                "created_at": row.get("created_at"),
            })
        if row.get("bot_response"):
            history.append({
                "id": f"{row['id']}-assistant",
                "message_id": row["id"],
                "session_id": row.get("session_id"),
                "message_role": "assistant",
                "content": row.get("bot_response"),
                "intent": row.get("detected_intent"),
                "confidence_score": row.get("confidence_score"),
                "created_at": row.get("created_at"),
            })
    return history


def save_chat_message(user_id, role, message_role, content, intent=None):
    role = normalize_role(role)
    if role is None or message_role not in {"user", "assistant"}:
        return

    content = (content or "").strip()
    if not content:
        return

    ensure_smart_chatbot_tables()
    if message_role == "user":
        user_message = content[:4000]
        bot_response = ""
    else:
        user_message = ""
        bot_response = content[:4000]

    _execute(
        """
        INSERT INTO chatbot_messages (user_id, role, user_message, detected_intent, confidence_score, bot_response)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (int(user_id), role, user_message, intent, 1.0 if intent else 0.0, bot_response),
    )


def clear_chat_history(user_id, role):
    role = normalize_role(role)
    if role is None:
        return

    ensure_smart_chatbot_tables()
    _execute(
        """
        DELETE FROM chatbot_messages
        WHERE user_id = %s AND role = %s
        """,
        (int(user_id), role),
    )
    _execute(
        """
        DELETE FROM chatbot_sessions
        WHERE user_id = %s AND role = %s
        """,
        (int(user_id), role),
    )


def get_student_schedule_today(user_id):
    return _filter_schedule_rows(_get_student_classes(user_id), _today())


def get_student_schedule_tomorrow(user_id):
    return _filter_schedule_rows(_get_student_classes(user_id), _today() + timedelta(days=1))


def get_student_schedule_week(user_id):
    return _get_student_classes(user_id)


def get_user_schedule_today(user_id, role):
    return _filter_schedule_rows(_get_schedule_rows(user_id, role), _today())


def get_user_schedule_tomorrow(user_id, role):
    return _filter_schedule_rows(_get_schedule_rows(user_id, role), _today() + timedelta(days=1))


def get_user_schedule_week(user_id, role):
    return _get_schedule_rows(user_id, role)


def get_user_schedule_next(user_id, role):
    rows = _get_schedule_rows(user_id, role)
    if not rows:
        return None

    now = _now()
    candidates = []
    for offset in range(0, 8):
        target_date = now.date() + timedelta(days=offset)
        for row in _filter_schedule_rows(rows, target_date):
            start_at = _parse_schedule_start(row.get("schedule"), target_date)
            if start_at is None:
                if offset > 0:
                    fallback = dict(row)
                    fallback["next_date_label"] = _date_label(target_date)
                    return fallback
                continue
            if start_at >= now:
                candidate = dict(row)
                candidate["next_start_at"] = start_at
                candidate["next_date_label"] = _date_label(target_date)
                candidates.append(candidate)
        if candidates:
            return sorted(candidates, key=lambda row: row["next_start_at"])[0]

    return None


def get_student_subjects(user_id):
    return _get_student_classes(user_id)


def get_student_grades(user_id, subject_hint=None):
    subject_clause = ""
    params = [int(user_id)]

    if subject_hint:
        subject_clause = "AND (LOWER(s.name) LIKE %s OR LOWER(s.code) LIKE %s)"
        pattern = f"%{subject_hint.lower()}%"
        params.extend([pattern, pattern])

    rows = _query_all(
        f"""
        SELECT
            e.id AS enrollment_id,
            cr.id AS class_id,
            cr.section,
            cr.academic_year,
            cr.semester,
            cr.schedule,
            cr.room,
            cr.grade_status,
            s.code AS subject_code,
            s.name AS subject_name,
            s.units,
            CONCAT(f.first_name, ' ', f.last_name) AS faculty_name,
            g.major_exam_avg,
            g.quiz_avg,
            g.project_avg,
            g.weighted_score,
            NULL AS midterm_grade,
            g.final_grade,
            NULL AS overall_grade,
            g.remarks,
            g.computed_at
        FROM enrollments e
        INNER JOIN class_records cr ON cr.id = e.class_record_id
        INNER JOIN subjects s ON s.id = cr.subject_id
        INNER JOIN users f ON f.id = cr.faculty_id
        LEFT JOIN grades g ON g.enrollment_id = e.id
        WHERE e.student_id = %s
          AND e.is_active = 1
          AND cr.is_active = 1
          {subject_clause}
        ORDER BY cr.academic_year DESC, cr.semester DESC, s.code
        """,
        tuple(params),
    )

    rows = _apply_term_performance(rows)

    for row in rows:
        can_view = row.get("grade_status") in GRADE_VISIBLE_STATUSES
        row["can_view_grade"] = can_view
        if not can_view:
            for field in ("major_exam_avg", "quiz_avg", "project_avg", "weighted_score", "midterm_grade", "final_grade", "overall_grade", "remarks"):
                row[field] = None
    return rows


def get_student_risk_status(user_id):
    rows = _get_risk_rows(user_id, "student")
    return [_decorate_risk_row(row, expose_unverified_grade=False) for row in rows]


def get_faculty_students_needing_attention(user_id):
    return get_students_needing_attention(user_id, "faculty")


def get_students_needing_attention(user_id, role, limit=20):
    role = normalize_role(role)
    if role == "student" or role is None:
        return []

    rows = [_decorate_risk_row(row, expose_unverified_grade=True) for row in _get_risk_rows(user_id, role)]
    rows = [row for row in rows if row.get("risk_level") in {"High Risk", "Medium Risk"}]
    rows.sort(
        key=lambda row: (
            _risk_rank(row.get("risk_level")),
            _none_high(row.get("current_grade")),
            -int(row.get("missing_activities") or 0),
        )
    )
    return rows[: max(1, min(int(limit), 100))]


def get_class_performance_summary(user_id, role):
    role = normalize_role(role)
    if role == "student" or role is None:
        return []

    rows = _get_risk_rows(user_id, role)
    grouped = {}
    for row in rows:
        class_id = row.get("class_id")
        if not class_id:
            continue

        item = grouped.setdefault(class_id, {
            "class_id": class_id,
            "section": row.get("section"),
            "academic_year": row.get("academic_year"),
            "semester": row.get("semester"),
            "schedule": row.get("schedule"),
            "room": row.get("room"),
            "grade_status": row.get("grade_status"),
            "subject_code": row.get("subject_code"),
            "subject_name": row.get("subject_name"),
            "subject_program": row.get("subject_program"),
            "student_count": 0,
            "_scores": [],
            "_attendance": [],
            "low_grade_count": 0,
            "poor_attendance_count": 0,
            "missing_activity_student_count": 0,
        })

        item["student_count"] += 1
        score = _to_float(row.get("weighted_score"))
        if score is not None:
            item["_scores"].append(score)
            if score < 75 or row.get("term_performance_status") in {"midterm_below_target", "final_below_target", "subject_below_target"}:
                item["low_grade_count"] += 1

        total_sessions = int(row.get("total_sessions") or 0)
        attendance_points = _to_float(row.get("attendance_points")) or 0.0
        attendance_percentage = round((attendance_points / total_sessions) * 100, 2) if total_sessions else None
        if attendance_percentage is not None:
            item["_attendance"].append(attendance_percentage)
            if attendance_percentage < 75:
                item["poor_attendance_count"] += 1

        missing = int(row.get("missing_activities") or 0)
        if missing >= 2:
            item["missing_activity_student_count"] += 1

    summaries = []
    for item in grouped.values():
        scores = item.pop("_scores")
        attendance = item.pop("_attendance")
        item["average_weighted_score"] = round(sum(scores) / len(scores), 2) if scores else None
        item["lowest_weighted_score"] = round(min(scores), 2) if scores else None
        item["average_attendance_percentage"] = round(sum(attendance) / len(attendance), 2) if attendance else None
        summaries.append(item)

    summaries.sort(
        key=lambda row: (
            int(row.get("low_grade_count") or 0),
            int(row.get("poor_attendance_count") or 0),
            int(row.get("missing_activity_student_count") or 0),
            str(row.get("subject_code") or ""),
        ),
        reverse=True,
    )
    return summaries[:20]


def get_missing_activities(user_id, role, limit=100):
    role = normalize_role(role)
    if role is None:
        return []

    where_sql, params = _scope_condition(user_id, role, student_alias="stu", class_alias="cr", subject_alias="s")
    limit = max(1, min(int(limit), 200))

    return _query_all(
        f"""
        SELECT
            e.id AS enrollment_id,
            stu.id AS student_user_id,
            stu.student_id AS student_number,
            CONCAT(stu.first_name, ' ', stu.last_name) AS student_name,
            stu.program,
            stu.year_level,
            cr.id AS class_id,
            cr.section,
            cr.academic_year,
            cr.semester,
            s.code AS subject_code,
            s.name AS subject_name,
            ga.category,
            ga.component_name,
            ga.max_score
        FROM enrollments e
        INNER JOIN users stu ON stu.id = e.student_id
        INNER JOIN class_records cr ON cr.id = e.class_record_id
        INNER JOIN subjects s ON s.id = cr.subject_id
        INNER JOIN grade_assessments ga ON ga.class_record_id = cr.id
        LEFT JOIN grade_components gc
            ON gc.enrollment_id = e.id
           AND gc.category = ga.category
           AND gc.component_name = ga.component_name
        WHERE e.is_active = 1
          AND cr.is_active = 1
          AND LOWER(ga.component_name) <> 'attendance'
          AND (gc.id IS NULL OR gc.score IS NULL)
          AND {where_sql}
        ORDER BY stu.last_name, stu.first_name, s.code, ga.category, ga.component_name
        LIMIT {limit}
        """,
        tuple(params),
    )


def _get_schedule_rows(user_id, role):
    role = normalize_role(role)
    if role == "student":
        return _get_student_classes(user_id)
    if role == "faculty":
        return _get_faculty_classes(user_id)
    return []


def _get_student_classes(user_id):
    return _query_all(
        """
        SELECT
            e.id AS enrollment_id,
            cr.id AS class_id,
            cr.section,
            cr.academic_year,
            cr.semester,
            cr.schedule,
            cr.room,
            cr.grade_status,
            s.code AS subject_code,
            s.name AS subject_name,
            s.units,
            CONCAT(f.first_name, ' ', f.last_name) AS faculty_name
        FROM enrollments e
        INNER JOIN class_records cr ON cr.id = e.class_record_id
        INNER JOIN subjects s ON s.id = cr.subject_id
        INNER JOIN users f ON f.id = cr.faculty_id
        WHERE e.student_id = %s
          AND e.is_active = 1
          AND cr.is_active = 1
        ORDER BY cr.academic_year DESC, cr.semester DESC, s.code, cr.section
        """,
        (int(user_id),),
    )


def _get_faculty_classes(user_id):
    return _query_all(
        """
        SELECT
            cr.id AS class_id,
            cr.section,
            cr.academic_year,
            cr.semester,
            cr.schedule,
            cr.room,
            cr.grade_status,
            s.code AS subject_code,
            s.name AS subject_name,
            s.units,
            COUNT(e.id) AS student_count
        FROM class_records cr
        INNER JOIN subjects s ON s.id = cr.subject_id
        LEFT JOIN enrollments e ON e.class_record_id = cr.id AND e.is_active = 1
        WHERE cr.faculty_id = %s
          AND cr.is_active = 1
        GROUP BY cr.id
        ORDER BY cr.academic_year DESC, cr.semester DESC, s.code, cr.section
        """,
        (int(user_id),),
    )


def _get_risk_rows(user_id, role):
    where_sql, params = _scope_condition(user_id, role, student_alias="stu", class_alias="cr", subject_alias="s")

    rows = _query_all(
        f"""
        SELECT
            e.id AS enrollment_id,
            stu.id AS student_user_id,
            stu.student_id AS student_number,
            CONCAT(stu.first_name, ' ', stu.last_name) AS student_name,
            stu.department,
            stu.program,
            stu.year_level,
            cr.id AS class_id,
            cr.section,
            cr.academic_year,
            cr.semester,
            cr.schedule,
            cr.room,
            cr.grade_status,
            s.code AS subject_code,
            s.name AS subject_name,
            s.program AS subject_program,
            g.major_exam_avg,
            g.quiz_avg,
            g.project_avg,
            g.weighted_score,
            NULL AS midterm_grade,
            g.final_grade,
            NULL AS overall_grade,
            g.remarks,
            att.total_sessions,
            att.present_count,
            att.absent_count,
            att.attendance_points,
            miss.assessment_count,
            miss.missing_activities
        FROM enrollments e
        INNER JOIN users stu ON stu.id = e.student_id
        INNER JOIN class_records cr ON cr.id = e.class_record_id
        INNER JOIN subjects s ON s.id = cr.subject_id
        LEFT JOIN grades g ON g.enrollment_id = e.id
        LEFT JOIN (
            SELECT
                enrollment_id,
                COUNT(*) AS total_sessions,
                SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present_count,
                SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent_count,
                SUM(points) AS attendance_points
            FROM attendance_records
            GROUP BY enrollment_id
        ) att ON att.enrollment_id = e.id
        LEFT JOIN (
            SELECT
                e2.id AS enrollment_id,
                COUNT(ga.id) AS assessment_count,
                SUM(CASE WHEN gc.id IS NULL OR gc.score IS NULL THEN 1 ELSE 0 END) AS missing_activities
            FROM enrollments e2
            INNER JOIN grade_assessments ga ON ga.class_record_id = e2.class_record_id
            LEFT JOIN grade_components gc
                ON gc.enrollment_id = e2.id
               AND gc.category = ga.category
               AND gc.component_name = ga.component_name
            WHERE LOWER(ga.component_name) <> 'attendance'
            GROUP BY e2.id
        ) miss ON miss.enrollment_id = e.id
        WHERE e.is_active = 1
          AND cr.is_active = 1
          AND {where_sql}
        ORDER BY stu.last_name, stu.first_name, s.code
        """,
        tuple(params),
    )
    return _apply_term_performance(rows)


def _scope_condition(user_id, role, student_alias, class_alias, subject_alias):
    role = normalize_role(role)
    if role == "student":
        return f"{student_alias}.id = %s", [int(user_id)]

    if role == "faculty":
        return f"{class_alias}.faculty_id = %s", [int(user_id)]

    if role == "program_chair":
        user = validate_user(user_id, "program_chair")
        program = (user or {}).get("program")
        if not program:
            return "1 = 0", []
        return f"({student_alias}.program = %s OR {subject_alias}.program = %s)", [program, program]

    if role == "dean":
        user = validate_user(user_id, "dean")
        department = (user or {}).get("department")
        if department:
            return f"({student_alias}.department = %s OR {subject_alias}.department = %s)", [department, department]
        return "1 = 1", []

    if role == "admin":
        return "1 = 1", []

    return "1 = 0", []


def _apply_term_performance(rows):
    rows = [dict(row) for row in rows]
    enrollment_ids = sorted({int(row["enrollment_id"]) for row in rows if row.get("enrollment_id")})
    if not enrollment_ids:
        return rows

    placeholders = ",".join(["%s"] * len(enrollment_ids))
    components = _query_all(
        f"""
        SELECT enrollment_id, category, component_name, max_score, score
        FROM grade_components
        WHERE enrollment_id IN ({placeholders})
          AND score IS NOT NULL
          AND LOWER(component_name) <> 'attendance'
        ORDER BY enrollment_id, category, component_name
        """,
        tuple(enrollment_ids),
    )
    setting_rows = _query_all(
        """
        SELECT setting_key, setting_value
        FROM system_settings
        WHERE setting_key IN ('major_exam_weight','quiz_weight','project_weight')
        """
    )
    settings = {row["setting_key"]: row["setting_value"] for row in setting_rows}
    weights = {
        "exam": float(settings.get("major_exam_weight") or 30) / 100,
        "quiz": float(settings.get("quiz_weight") or 30) / 100,
        "project": float(settings.get("project_weight") or 40) / 100,
    }

    grouped = defaultdict(list)
    for component in components:
        grouped[int(component["enrollment_id"])].append(component)

    for row in rows:
        performance = _term_performance(grouped.get(int(row.get("enrollment_id") or 0), []), weights)
        if performance["current_score"] is None:
            continue

        row["midterm_grade"] = performance["midterm_score"]
        row["final_term_score"] = performance["final_score"]
        row["overall_grade"] = performance["subject_score"]
        row["weighted_score"] = performance["current_score"]
        row["has_midterm_scores"] = performance["has_midterm"]
        row["has_final_scores"] = performance["has_final"]
        row["term_performance_status"] = performance["status"]

        if not performance["has_complete_subject"]:
            row["final_grade"] = None
            if str(row.get("remarks") or "").lower() == "failed":
                row["remarks"] = "No Grade"

    return rows


def _term_performance(components, weights):
    terms = _organize_components_by_term(components)
    midterm_score = _calculate_term_score(terms["midterm"], weights) if _term_has_scores(terms["midterm"]) else None
    final_score = _calculate_term_score(terms["final"], weights) if _term_has_scores(terms["final"]) else None
    has_midterm = midterm_score is not None
    has_final = final_score is not None
    subject_score = ((midterm_score or 0) * 0.5) + ((final_score or 0) * 0.5) if has_midterm and has_final else None
    current_score = subject_score if subject_score is not None else (final_score if final_score is not None else midterm_score)

    status = "on_track"
    if subject_score is not None and subject_score < 75:
        status = "subject_below_target"
    elif final_score is not None and final_score < 75:
        status = "final_below_target"
    elif midterm_score is not None and midterm_score < 75:
        status = "midterm_below_target"

    return {
        "midterm_score": round(midterm_score, 2) if midterm_score is not None else None,
        "final_score": round(final_score, 2) if final_score is not None else None,
        "subject_score": round(subject_score, 2) if subject_score is not None else None,
        "current_score": round(current_score, 2) if current_score is not None else None,
        "has_midterm": has_midterm,
        "has_final": has_final,
        "has_complete_subject": has_midterm and has_final,
        "status": status,
    }


def _organize_components_by_term(components):
    terms = {
        "midterm": {"major_exam": [], "quiz": [], "project": []},
        "final": {"major_exam": [], "quiz": [], "project": []},
    }
    for category in ("major_exam", "quiz", "project"):
        category_components = [component for component in components if component.get("category") == category]
        unassigned = []
        assigned_count = 0
        for component in category_components:
            term = _detect_assessment_term(component.get("component_name"))
            if term:
                terms[term][category].append(component)
                assigned_count += 1
            else:
                unassigned.append(component)

        if not unassigned:
            continue
        if assigned_count == 0:
            midterm_count = (len(unassigned) + 1) // 2
            for index, component in enumerate(unassigned):
                terms["midterm" if index < midterm_count else "final"][category].append(component)
            continue
        terms["midterm"][category].extend(unassigned)
    return terms


def _detect_assessment_term(name):
    text = str(name or "").lower()
    if re.search(r"\bfinal\b|\bfinals\b|\bfin\b", text):
        return "final"
    if re.search(r"\bmidterm\b|\bmid-term\b|\bmid\b|\bprelim\b", text):
        return "midterm"
    return None


def _term_has_scores(term_components):
    return any(
        component.get("score") is not None
        for category in ("major_exam", "quiz", "project")
        for component in term_components.get(category, [])
    )


def _calculate_term_score(term_components, weights):
    exam_avg = _transmuted_average(term_components.get("major_exam", []))
    quiz_avg = _transmuted_average(term_components.get("quiz", []))
    project_avg = _performance_task_average(term_components.get("project", []))
    if exam_avg is None and quiz_avg is None and project_avg is None:
        return None
    return ((exam_avg or 0) * weights["exam"]) + ((quiz_avg or 0) * weights["quiz"]) + ((project_avg or 0) * weights["project"])


def _transmuted_average(components):
    values = []
    for component in components:
        max_score = _to_float(component.get("max_score")) or 0
        score = _to_float(component.get("score"))
        if max_score > 0 and score is not None:
            values.append(((score / max_score) * 50) + 50)
    return _average(values)


def _performance_task_average(components):
    values = []
    subtotal_score = 0.0
    subtotal_max = 0.0
    for component in components:
        max_score = _to_float(component.get("max_score")) or 0
        score = _to_float(component.get("score"))
        if max_score <= 0 or score is None:
            continue
        if max_score < 100:
            subtotal_score += score
            subtotal_max += max_score
            continue
        values.append((score / max_score) * 100)
    if subtotal_max > 0:
        values.insert(0, ((subtotal_score / subtotal_max) * 50) + 50)
    return _average(values)


def _average(values):
    values = [float(value) for value in values if value is not None]
    return sum(values) / len(values) if values else None


def _decorate_risk_row(row, expose_unverified_grade):
    row = dict(row)
    can_view_grade = expose_unverified_grade or row.get("grade_status") in GRADE_VISIBLE_STATUSES
    current_grade = _to_float(row.get("weighted_score")) if can_view_grade else None
    exam_avg = _to_float(row.get("major_exam_avg")) if can_view_grade else None
    midterm_grade = _to_float(row.get("midterm_grade")) if can_view_grade else None
    final_grade = _to_float(row.get("final_grade")) if can_view_grade else None
    remarks = row.get("remarks") if can_view_grade else None
    if final_grade is None and str(remarks or "").lower() == "failed":
        remarks = "No Grade"

    total_sessions = int(row.get("total_sessions") or 0)
    attendance_points = _to_float(row.get("attendance_points")) or 0.0
    attendance_percentage = round((attendance_points / total_sessions) * 100, 2) if total_sessions else None

    assessment_count = int(row.get("assessment_count") or 0)
    missing_activities = int(row.get("missing_activities") or 0) if assessment_count else None

    analysis = analyze_student_risk(
        {
            "current_grade": current_grade,
            "attendance_percentage": attendance_percentage,
            "missing_activities": missing_activities,
            "exam_avg": exam_avg,
            "remarks": remarks,
            "midterm_grade": midterm_grade,
            "final_grade": final_grade,
        }
    )

    row.update(analysis)
    row["can_view_grade"] = can_view_grade
    row["current_grade"] = current_grade
    row["exam_avg"] = exam_avg
    row["attendance_percentage"] = attendance_percentage
    row["missing_activities"] = missing_activities

    if not can_view_grade:
        for field in ("major_exam_avg", "quiz_avg", "project_avg", "weighted_score", "midterm_grade", "final_grade", "overall_grade", "remarks"):
            row[field] = None

    return row


def _query_one(sql, params=()):
    rows = _query_all(sql, params)
    return rows[0] if rows else None


def _query_all(sql, params=()):
    connection = None
    cursor = None
    try:
        connection = mysql.connector.connect(
            host=os.getenv("DB_HOST", "localhost"),
            user=os.getenv("DB_USER", "root"),
            password=os.getenv("DB_PASSWORD", os.getenv("DB_PASS", "")),
            database=os.getenv("DB_NAME", "coedigo_db"),
            port=int(os.getenv("DB_PORT", "3306")),
            autocommit=True,
            connection_timeout=8,
        )
        cursor = connection.cursor(dictionary=True)
        cursor.execute(sql, params)
        return cursor.fetchall()
    except mysql.connector.Error as exc:
        LOGGER.exception("Academic assistant database query failed: %s", exc.__class__.__name__)
        raise ChatbotDatabaseError("Database query failed") from exc
    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()


def _execute(sql, params=()):
    connection = None
    cursor = None
    try:
        connection = mysql.connector.connect(
            host=os.getenv("DB_HOST", "localhost"),
            user=os.getenv("DB_USER", "root"),
            password=os.getenv("DB_PASSWORD", os.getenv("DB_PASS", "")),
            database=os.getenv("DB_NAME", "coedigo_db"),
            port=int(os.getenv("DB_PORT", "3306")),
            autocommit=True,
            connection_timeout=8,
        )
        cursor = connection.cursor()
        cursor.execute(sql, params)
        return cursor.lastrowid
    except mysql.connector.Error as exc:
        LOGGER.exception("Academic assistant database write failed: %s", exc.__class__.__name__)
        raise ChatbotDatabaseError("Database write failed") from exc
    finally:
        if cursor is not None:
            cursor.close()
        if connection is not None and connection.is_connected():
            connection.close()


def ensure_smart_chatbot_tables():
    _execute(
        """
        CREATE TABLE IF NOT EXISTS chatbot_sessions (
            id VARCHAR(64) PRIMARY KEY,
            user_id INT NOT NULL,
            role ENUM('admin', 'faculty', 'student', 'dean', 'program_chair') NOT NULL,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ended_at DATETIME DEFAULT NULL,
            last_intent VARCHAR(80) DEFAULT NULL,
            summary TEXT DEFAULT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_chatbot_sessions_user_started (user_id, role, started_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """,
    )

    _execute(
        """
        CREATE TABLE IF NOT EXISTS chatbot_messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            role ENUM('admin', 'faculty', 'student', 'dean', 'program_chair') NOT NULL,
            session_id VARCHAR(64) DEFAULT NULL,
            user_message TEXT NOT NULL,
            detected_intent VARCHAR(80) DEFAULT NULL,
            confidence_score DECIMAL(4,3) DEFAULT 0.000,
            bot_response TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (session_id) REFERENCES chatbot_sessions(id) ON DELETE SET NULL,
            INDEX idx_chatbot_messages_user_created (user_id, role, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """,
    )

    for column, ddl in {
        "last_result_type": "ALTER TABLE chatbot_sessions ADD COLUMN last_result_type VARCHAR(80) DEFAULT NULL AFTER last_intent",
        "pending_clarification": "ALTER TABLE chatbot_sessions ADD COLUMN pending_clarification VARCHAR(80) DEFAULT NULL AFTER last_result_type",
    }.items():
        if not _column_exists("chatbot_sessions", column):
            _execute(ddl)

    for column, ddl in {
        "session_id": "ALTER TABLE chatbot_messages ADD COLUMN session_id VARCHAR(64) DEFAULT NULL AFTER role",
        "user_message": "ALTER TABLE chatbot_messages ADD COLUMN user_message TEXT NULL AFTER session_id",
        "detected_intent": "ALTER TABLE chatbot_messages ADD COLUMN detected_intent VARCHAR(80) DEFAULT NULL AFTER user_message",
        "confidence_score": "ALTER TABLE chatbot_messages ADD COLUMN confidence_score DECIMAL(4,3) DEFAULT 0.000 AFTER detected_intent",
        "bot_response": "ALTER TABLE chatbot_messages ADD COLUMN bot_response TEXT NULL AFTER confidence_score",
    }.items():
        if not _column_exists("chatbot_messages", column):
            _execute(ddl)

    if _column_exists("chatbot_messages", "message_role"):
        _execute("ALTER TABLE chatbot_messages MODIFY message_role ENUM('user','assistant') NULL")
    if _column_exists("chatbot_messages", "content"):
        _execute("ALTER TABLE chatbot_messages MODIFY content TEXT NULL")

    _execute(
        """
        CREATE TABLE IF NOT EXISTS chatbot_feedback (
            id INT AUTO_INCREMENT PRIMARY KEY,
            message_id INT NOT NULL,
            user_id INT NOT NULL,
            rating ENUM('helpful', 'not_helpful') NOT NULL,
            feedback_text TEXT DEFAULT NULL,
            corrected_intent VARCHAR(80) DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (message_id) REFERENCES chatbot_messages(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_chatbot_feedback_message (message_id),
            INDEX idx_chatbot_feedback_user_created (user_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """,
    )

    _execute(
        """
        CREATE TABLE IF NOT EXISTS chatbot_user_memory (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            role ENUM('admin', 'faculty', 'student', 'dean', 'program_chair') NOT NULL,
            preferred_response_style VARCHAR(40) DEFAULT 'concise',
            frequent_intents TEXT DEFAULT NULL,
            last_topics TEXT DEFAULT NULL,
            memory_summary TEXT DEFAULT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE KEY uk_chatbot_user_memory (user_id, role)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """,
    )

    _execute(
        """
        CREATE TABLE IF NOT EXISTS chatbot_training_examples (
            id INT AUTO_INCREMENT PRIMARY KEY,
            text TEXT NOT NULL,
            original_intent VARCHAR(80) DEFAULT NULL,
            corrected_intent VARCHAR(80) DEFAULT NULL,
            source ENUM('user_feedback', 'admin_added', 'system_suggested') DEFAULT 'system_suggested',
            reviewed TINYINT(1) DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_chatbot_training_reviewed (reviewed, corrected_intent)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """,
    )


def _column_exists(table, column):
    if table not in {"chatbot_messages", "chatbot_sessions"}:
        return False
    return _query_one(
        """
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = %s
          AND COLUMN_NAME = %s
        LIMIT 1
        """,
        (table, column),
    ) is not None


def get_student_next_class(user_id):
    return get_user_schedule_next(user_id, "student")


def get_student_missing_activities(user_id):
    return get_missing_activities(user_id, "student")


def get_faculty_class_summary(user_id):
    return get_class_performance_summary(user_id, "faculty")


def get_high_risk_students(user_id, role, limit=20):
    rows = get_students_needing_attention(user_id, role, limit=100)
    return [row for row in rows if row.get("risk_level") == "High Risk"][:limit]


def get_attendance_concerns(user_id, role, limit=20):
    rows = [_decorate_risk_row(row, expose_unverified_grade=normalize_role(role) != "student") for row in _get_risk_rows(user_id, role)]
    rows = [
        row for row in rows
        if row.get("attendance_percentage") is not None and float(row["attendance_percentage"]) < 75
    ]
    rows.sort(key=lambda row: float(row.get("attendance_percentage") or 999))
    return rows[:limit]


def _filter_schedule_rows(rows, target_date):
    matched = [row for row in rows if _schedule_matches_date(row.get("schedule"), target_date)]
    return sorted(matched, key=lambda row: _schedule_sort_key(row.get("schedule"), target_date))


def _schedule_matches_date(schedule, target_date):
    codes = _day_codes(schedule)
    if not codes:
        return False
    weekday_code = ["M", "T", "W", "TH", "F", "SAT", "SUN"][target_date.weekday()]
    return weekday_code in codes


def _day_codes(schedule):
    if not schedule:
        return set()

    day_part = re.split(r"\d", str(schedule), maxsplit=1)[0].upper()
    day_part = day_part.replace(".", "").replace(",", " ")
    compact = re.sub(r"[^A-Z]", "", day_part)

    if "DAILY" in compact:
        return {"M", "T", "W", "TH", "F"}

    codes = set()
    if "MON" in compact or "M" in compact:
        codes.add("M")
    if "WED" in compact or "W" in compact:
        codes.add("W")
    if "FRI" in compact or "F" in compact:
        codes.add("F")
    if "THU" in compact or "TH" in compact or "R" in compact:
        codes.add("TH")
    if "TUE" in compact or "T" in compact.replace("TH", ""):
        codes.add("T")
    if "SAT" in compact:
        codes.add("SAT")
    if "SUN" in compact:
        codes.add("SUN")
    return codes


def _schedule_sort_key(schedule, target_date):
    start_at = _parse_schedule_start(schedule, target_date)
    return start_at or datetime.combine(target_date, datetime.max.time()).replace(tzinfo=_timezone())


def _parse_schedule_start(schedule, target_date):
    if not schedule:
        return None

    match = re.search(
        r"(\d{1,2}:\d{2})\s*(AM|PM)?\s*[-–]\s*(\d{1,2}:\d{2})\s*(AM|PM)",
        str(schedule),
        flags=re.IGNORECASE,
    )
    if not match:
        return None

    start_text, start_meridiem, end_text, end_meridiem = match.groups()
    if not start_meridiem:
        start_meridiem = _infer_start_meridiem(start_text, end_text, end_meridiem.upper())

    try:
        parsed = datetime.strptime(f"{target_date.isoformat()} {start_text} {start_meridiem.upper()}", "%Y-%m-%d %I:%M %p")
    except ValueError:
        return None
    return parsed.replace(tzinfo=_timezone())


def _infer_start_meridiem(start_text, end_text, end_meridiem):
    start_hour = int(start_text.split(":", 1)[0])
    end_hour = int(end_text.split(":", 1)[0])

    if end_meridiem == "AM":
        return "AM"

    if start_hour == 12:
        return "PM"
    if end_hour == 12 or start_hour > end_hour:
        return "AM"
    return "PM"


def _today():
    return _now().date()


def _now():
    return datetime.now(_timezone())


def _timezone():
    timezone_name = os.getenv("CHATBOT_TIMEZONE", "Asia/Manila")
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def _date_label(value):
    today = _today()
    if value == today:
        return "today"
    if value == today + timedelta(days=1):
        return "tomorrow"
    return f"on {value.strftime('%A, %B %d, %Y')}"


def _full_name(row):
    return " ".join(
        part
        for part in [
            row.get("first_name"),
            row.get("middle_name"),
            row.get("last_name"),
        ]
        if part
    )


def _to_float(value):
    if value is None or value == "":
        return None
    return float(value)


def _risk_rank(level):
    return {"High Risk": 0, "Medium Risk": 1, "Low Risk": 2, "Unknown": 3}.get(level, 4)


def _none_high(value):
    return float(value) if value is not None else 999.0
