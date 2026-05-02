from role_policy import get_clarification, get_role_fallback


ROLE_FOLLOWUPS = {
    "student": {
        "schedule_today": ["What is my next class?", "Show my weekly schedule", "What subjects am I enrolled in?"],
        "schedule_week": ["What is my next class?", "Show my subjects", "Show my attendance"],
        "next_class": ["Show my schedule today", "Show my weekly schedule"],
        "current_grade": ["Show my missing activities", "What subject should I improve?", "Show my attendance"],
        "subject_grade": ["Am I at risk?", "Show my missing activities", "What should I improve?"],
        "risk_status": ["Show my missing activities", "What subject should I improve?", "Show my attendance"],
        "attendance_status": ["Am I at risk?", "Show my missing activities", "Show my grades"],
        "missing_activities": ["Am I at risk?", "What subject should I improve?", "Show my grades"],
        "improvement_advice": ["Show my grades", "Show my missing activities", "Show my attendance"],
    },
    "faculty": {
        "class_summary": ["Show high-risk students", "Show students with missing activities", "Show students with poor attendance"],
        "students_needing_attention": ["Show only high risk", "What about attendance?", "Show missing activities"],
        "high_risk_students": ["Explain why they are high risk", "Show students with missing activities", "Show students with poor attendance"],
        "low_grade_students": ["Show students needing consultation", "Show class performance summary"],
        "poor_attendance_students": ["Show high-risk students", "Show missing activities"],
        "missing_activity_students": ["Show high-risk students", "Show students with poor attendance"],
    },
    "dean": {
        "college_summary": ["Show high-risk overview", "Show program risk summary", "Show attendance concerns"],
        "program_risk_summary": ["Show high-risk overview", "Show subject risk summary", "Show intervention summary"],
        "subject_risk_summary": ["Show high-risk overview", "Show attendance concerns"],
        "high_risk_overview": ["Show program risk summary", "Show attendance concerns", "Show intervention summary"],
        "attendance_overview": ["Show high-risk overview", "Show program risk summary"],
        "intervention_summary": ["Show high-risk overview", "Show subject risk summary"],
    },
    "program_chair": {
        "program_summary": ["Show section summary", "Show program high-risk students", "Show subject concerns"],
        "year_level_summary": ["Show section summary", "Show program high-risk students"],
        "section_summary": ["Show program high-risk students", "Show subject concerns"],
        "program_high_risk_students": ["Show section summary", "Show attendance concerns", "Show subject concerns"],
        "program_subject_concerns": ["Show program high-risk students", "Show year level summary"],
        "program_attendance_concerns": ["Show program high-risk students", "Show section summary"],
        "program_intervention_summary": ["Show program high-risk students", "Show subject concerns"],
    },
}


def fallback_reply(role):
    return get_role_fallback(role)


def clarification_payload(intent, role):
    return get_clarification(intent, role)


def suggested_followups(role, intent):
    role_suggestions = ROLE_FOLLOWUPS.get(role, {})
    return list(role_suggestions.get(intent, []))[:3]


def no_matching_record():
    return "No matching record was found."
