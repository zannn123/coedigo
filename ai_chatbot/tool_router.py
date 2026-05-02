from chart_generator import generate_chart
from database_tools import (
    get_attendance_concerns,
    get_authorized_student_grade_records,
    get_class_performance_summary,
    get_high_risk_students,
    get_missing_activities,
    get_student_grades,
    get_student_risk_status,
    get_student_subjects,
    get_students_needing_attention,
    get_user_schedule_next,
    get_user_schedule_today,
    get_user_schedule_tomorrow,
    get_user_schedule_week,
    normalize_role,
)
from web_search import web_lookup


ALLOWED_TOOLS = {
    "get_student_grades",
    "get_student_attendance",
    "get_student_schedule",
    "get_student_missing_activities",
    "get_student_risk_summary",
    "get_class_summary",
    "get_high_risk_students",
    "get_dean_summary",
    "get_program_chair_summary",
    "generate_student_grade_graph",
    "generate_student_attendance_graph",
    "generate_student_risk_graph",
    "generate_class_performance_graph",
    "safe_web_search",
}


def route_to_tool(user_id, role, intent, entities, context=None):
    role = normalize_role(role)
    if not role:
        return {"error": "Invalid role"}
    
    tool_name = _intent_to_tool(intent, role, entities)
    
    if not tool_name or tool_name not in ALLOWED_TOOLS:
        return {"error": "Unsupported intent or tool"}
    
    try:
        return _execute_tool(tool_name, user_id, role, intent, entities, context)
    except Exception as e:
        return {"error": f"Tool execution failed: {str(e)}"}


def _intent_to_tool(intent, role, entities):
    mapping = {
        "schedule_today": "get_student_schedule",
        "schedule_tomorrow": "get_student_schedule",
        "schedule_week": "get_student_schedule",
        "next_class": "get_student_schedule",
        "enrolled_subjects": "get_student_schedule",
        "current_grade": "get_student_grades",
        "subject_grade": "get_student_grades",
        "student_grade_lookup": "get_student_grades",
        "attendance_status": "get_student_attendance",
        "poor_attendance_students": "get_student_attendance",
        "missing_activities": "get_student_missing_activities",
        "missing_activity_students": "get_student_missing_activities",
        "risk_status": "get_student_risk_summary",
        "improvement_advice": "get_student_risk_summary",
        "explain_risk": "get_student_risk_summary",
        "students_needing_attention": "get_class_summary",
        "high_risk_students": "get_high_risk_students",
        "high_risk_overview": "get_high_risk_students",
        "class_summary": "get_class_summary",
        "college_summary": "get_dean_summary",
        "program_summary": "get_program_chair_summary",
        "report_graph": "generate_student_grade_graph",
        "student_graph": "generate_student_grade_graph",
        "student_grade_graph": "generate_student_grade_graph",
        "student_attendance_graph": "generate_student_attendance_graph",
        "student_risk_graph": "generate_student_risk_graph",
        "class_performance_graph": "generate_class_performance_graph",
        "web_search": "safe_web_search",
    }
    
    return mapping.get(intent)


def _execute_tool(tool_name, user_id, role, intent, entities, context):
    if tool_name == "get_student_schedule":
        if intent == "schedule_today":
            return get_user_schedule_today(user_id, role)
        elif intent == "schedule_tomorrow":
            return get_user_schedule_tomorrow(user_id, role)
        elif intent == "schedule_week":
            return get_user_schedule_week(user_id, role)
        elif intent == "next_class":
            return get_user_schedule_next(user_id, role)
        elif intent == "enrolled_subjects":
            return get_student_subjects(user_id)
    
    if tool_name == "get_student_grades":
        if intent == "student_grade_lookup" and role != "student":
            student_name = entities.get("student_name")
            subject_hint = entities.get("subject_hint")
            if not student_name:
                return {"error": "Student name is required", "needs_clarification": True}
            return get_authorized_student_grade_records(user_id, role, student_name, subject_hint)
        
        subject_hint = entities.get("subject_hint")
        return get_student_grades(user_id, subject_hint)
    
    if tool_name == "get_student_attendance":
        if role == "student":
            return get_student_risk_status(user_id)
        return get_attendance_concerns(user_id, role)
    
    if tool_name == "get_student_missing_activities":
        return get_missing_activities(user_id, role)
    
    if tool_name == "get_student_risk_summary":
        return get_student_risk_status(user_id)
    
    if tool_name == "get_class_summary":
        if intent == "students_needing_attention":
            return get_students_needing_attention(user_id, role)
        return get_class_performance_summary(user_id, role)
    
    if tool_name == "get_high_risk_students":
        return get_high_risk_students(user_id, role)
    
    if tool_name == "get_dean_summary":
        return get_class_performance_summary(user_id, role)
    
    if tool_name == "get_program_chair_summary":
        return get_class_performance_summary(user_id, role)
    
    if tool_name in {
        "generate_student_grade_graph",
        "generate_student_attendance_graph",
        "generate_student_risk_graph",
        "generate_class_performance_graph",
    }:
        return generate_chart(user_id, role, entities, intent)
    
    if tool_name == "safe_web_search":
        topic = entities.get("web_search_topic")
        if not topic:
            return {"error": "Search topic is required"}
        
        if _contains_private_data(topic):
            return {"error": "Cannot search for private academic data online"}
        
        return web_lookup(topic)
    
    return {"error": "Tool not implemented"}


def _contains_private_data(text):
    text_lower = text.lower()
    
    private_indicators = [
        "student grade",
        "student attendance",
        "student risk",
        "class list",
        "student list",
        "student record",
        "academic record",
    ]
    
    return any(indicator in text_lower for indicator in private_indicators)
