from database_tools import normalize_role
from prompts import NO_PERMISSION_REPLY


ROLE_ALLOWED_INTENTS = {
    "student": {
        "small_talk_greeting",
        "identity_recall",
        "web_search",
        "schedule_clarification",
        "schedule_today",
        "schedule_tomorrow",
        "schedule_week",
        "next_class",
        "enrolled_subjects",
        "current_grade",
        "subject_grade",
        "attendance_status",
        "missing_activities",
        "risk_status",
        "improvement_advice",
        "explain_risk",
        "explain_previous_result",
        "show_more_details",
        "show_attendance_details",
        "show_missing_activity_details",
        "clarify_date",
        "report_graph",
        "student_graph",
        "student_grade_graph",
        "student_attendance_graph",
        "student_risk_graph",
        "unknown",
    },
    "faculty": {
        "small_talk_greeting",
        "identity_recall",
        "web_search",
        "schedule_clarification",
        "schedule_today",
        "schedule_tomorrow",
        "schedule_week",
        "next_class",
        "class_summary",
        "students_needing_attention",
        "high_risk_students",
        "low_grade_students",
        "poor_attendance_students",
        "missing_activity_students",
        "subject_performance_summary",
        "explain_student_risk",
        "consultation_candidates",
        "student_grade_lookup",
        "explain_previous_result",
        "filter_previous_result",
        "show_more_details",
        "show_only_high_risk",
        "show_attendance_details",
        "show_missing_activity_details",
        "clarify_date",
        "report_graph",
        "student_graph",
        "student_grade_graph",
        "student_attendance_graph",
        "student_risk_graph",
        "class_performance_graph",
        "class_attendance_graph",
        "class_risk_graph",
        "high_risk_chart",
        "unknown",
    },
    "dean": {
        "small_talk_greeting",
        "identity_recall",
        "web_search",
        "college_summary",
        "program_risk_summary",
        "subject_risk_summary",
        "high_risk_overview",
        "attendance_overview",
        "intervention_summary",
        "faculty_class_monitoring",
        "students_needing_attention",
        "high_risk_students",
        "poor_attendance_students",
        "missing_activity_students",
        "student_grade_lookup",
        "explain_previous_result",
        "filter_previous_result",
        "show_more_details",
        "show_only_high_risk",
        "show_attendance_details",
        "show_missing_activity_details",
        "clarify_date",
        "unknown",
    },
    "program_chair": {
        "small_talk_greeting",
        "identity_recall",
        "web_search",
        "program_summary",
        "year_level_summary",
        "section_summary",
        "program_high_risk_students",
        "program_subject_concerns",
        "program_attendance_concerns",
        "program_intervention_summary",
        "students_needing_attention",
        "high_risk_students",
        "poor_attendance_students",
        "missing_activity_students",
        "subject_risk_summary",
        "student_grade_lookup",
        "explain_previous_result",
        "filter_previous_result",
        "show_more_details",
        "show_only_high_risk",
        "show_attendance_details",
        "show_missing_activity_details",
        "clarify_date",
        "unknown",
    },
    "admin": {
        "small_talk_greeting",
        "identity_recall",
        "web_search",
        "college_summary",
        "program_risk_summary",
        "subject_risk_summary",
        "high_risk_overview",
        "attendance_overview",
        "intervention_summary",
        "faculty_class_monitoring",
        "class_summary",
        "students_needing_attention",
        "high_risk_students",
        "low_grade_students",
        "poor_attendance_students",
        "missing_activity_students",
        "student_grade_lookup",
        "explain_previous_result",
        "filter_previous_result",
        "show_more_details",
        "show_only_high_risk",
        "show_attendance_details",
        "show_missing_activity_details",
        "clarify_date",
        "unknown",
    },
}


ROLE_FALLBACKS = {
    "student": "I’m not sure yet. Do you want to check your schedule, grades, attendance, missing activities, or risk status?",
    "faculty": "I’m not sure yet. Do you want a class summary, high-risk students, attendance concerns, or missing activities?",
    "dean": "I’m not sure yet. Do you want a college summary, program risk summary, high-risk overview, or attendance overview?",
    "program_chair": "I’m not sure yet. Do you want a program summary, section summary, high-risk students, or subject concerns?",
    "admin": "I’m not sure yet. Do you want an overall summary, high-risk overview, attendance concerns, or missing activities?",
}

ROLE_DEFAULT_CLARIFICATIONS = {
    "student": {
        "reply": "Do you want to check your schedule, grades, attendance, missing activities, or risk status?",
        "suggestions": ["Schedule today", "Show my grades", "Am I at risk?"],
    },
    "faculty": {
        "reply": "Do you want a class summary, high-risk students, attendance concerns, or missing activities?",
        "suggestions": ["Summarize my class performance", "Show high-risk students", "Show students with poor attendance"],
    },
    "dean": {
        "reply": "Do you want a college summary, program risk summary, high-risk overview, or attendance overview?",
        "suggestions": ["Show overall performance", "Show high-risk overview", "Show attendance concerns"],
    },
    "program_chair": {
        "reply": "Do you want a program summary, section summary, high-risk students, or subject concerns?",
        "suggestions": ["Show program summary", "Show section summary", "Show subject concerns"],
    },
    "admin": {
        "reply": "Do you want an overall summary, high-risk overview, attendance concerns, or missing activities?",
        "suggestions": ["Show overall performance", "Show high-risk overview", "Show attendance concerns"],
    },
}


def canonicalize_intent_for_role(intent, role):
    role = normalize_role(role)
    if role is None:
        return intent

    if role == "student":
        return {
            "next_class": "next_class",
            "show_more_details": "explain_previous_result",
            "show_attendance_details": "attendance_status",
            "show_missing_activity_details": "missing_activities",
        }.get(intent, intent)

    if role == "faculty":
        return {
            "show_only_high_risk": "high_risk_students",
            "filter_previous_result": "high_risk_students",
            "show_attendance_details": "poor_attendance_students",
            "show_missing_activity_details": "missing_activity_students",
            "show_more_details": "explain_previous_result",
            "subject_performance_summary": "class_summary",
            "consultation_candidates": "students_needing_attention",
        }.get(intent, intent)

    if role == "dean":
        return {
            "class_summary": "college_summary",
            "students_needing_attention": "intervention_summary",
            "high_risk_students": "high_risk_overview",
            "show_only_high_risk": "high_risk_overview",
            "filter_previous_result": "high_risk_overview",
            "poor_attendance_students": "attendance_overview",
            "show_attendance_details": "attendance_overview",
            "missing_activity_students": "intervention_summary",
            "show_missing_activity_details": "intervention_summary",
            "show_more_details": "explain_previous_result",
        }.get(intent, intent)

    if role == "program_chair":
        return {
            "class_summary": "program_summary",
            "students_needing_attention": "program_intervention_summary",
            "high_risk_students": "program_high_risk_students",
            "show_only_high_risk": "program_high_risk_students",
            "filter_previous_result": "program_high_risk_students",
            "poor_attendance_students": "program_attendance_concerns",
            "show_attendance_details": "program_attendance_concerns",
            "missing_activity_students": "program_intervention_summary",
            "show_missing_activity_details": "program_intervention_summary",
            "subject_risk_summary": "program_subject_concerns",
            "show_more_details": "explain_previous_result",
        }.get(intent, intent)

    return intent


def is_intent_allowed(intent, role):
    role = normalize_role(role)
    if role is None:
        return False
    return intent in ROLE_ALLOWED_INTENTS.get(role, set())


def get_role_fallback(role):
    return ROLE_FALLBACKS.get(normalize_role(role), ROLE_FALLBACKS["student"])


def get_unauthorized_reply():
    return NO_PERMISSION_REPLY


def get_clarification(intent, role):
    role = normalize_role(role)
    if intent == "schedule_clarification":
        return {
            "reply": "Do you want your schedule for today, tomorrow, or this week?",
            "suggestions": ["Today", "Tomorrow", "This week"],
        }

    if intent == "clarify_date":
        return {
            "reply": "Which date range do you mean: today, tomorrow, or this week?",
            "suggestions": ["Today", "Tomorrow", "This week"],
        }

    return ROLE_DEFAULT_CLARIFICATIONS.get(role, ROLE_DEFAULT_CLARIFICATIONS["student"])
