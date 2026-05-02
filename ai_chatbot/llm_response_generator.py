def generate_natural_response(result_data, intent, role, entities=None):
    if not result_data:
        return "I couldn't find any information for that request."
    
    if isinstance(result_data, str):
        return _enhance_text_response(result_data, intent, role)
    
    if isinstance(result_data, dict):
        if result_data.get("error"):
            return _format_error_naturally(result_data["error"], intent, role)
        
        if result_data.get("graph_url"):
            return _format_graph_response(result_data, intent, role, entities)
        
        if result_data.get("reply"):
            return _enhance_text_response(result_data["reply"], intent, role)
    
    if isinstance(result_data, list):
        return _format_list_response(result_data, intent, role)
    
    return str(result_data)


def _enhance_text_response(text, intent, role):
    if not text:
        return text
    
    if role == "student":
        if intent in {"risk_status", "explain_risk"}:
            if "High Risk" in text:
                text = _add_supportive_tone(text, "high_risk")
            elif "Medium Risk" in text:
                text = _add_supportive_tone(text, "medium_risk")
        
        if intent == "current_grade":
            if "below" in text.lower() or "low" in text.lower():
                text = _add_supportive_tone(text, "low_grade")
    
    elif role == "faculty":
        if intent in {"students_needing_attention", "high_risk_students"}:
            text = _add_action_oriented_tone(text)
    
    elif role in {"dean", "program_chair"}:
        if intent in {"college_summary", "program_summary"}:
            text = _add_executive_tone(text)
    
    return text


def _add_supportive_tone(text, situation):
    if situation == "high_risk":
        if not any(phrase in text for phrase in ["focus", "improve", "action"]):
            text += " Focus on improving attendance and completing missing activities to reduce your risk level."
    
    elif situation == "medium_risk":
        if not any(phrase in text for phrase in ["keep", "maintain", "continue"]):
            text += " Keep working on your current action plan to maintain or improve your standing."
    
    elif situation == "low_grade":
        if not any(phrase in text for phrase in ["improve", "focus", "work on"]):
            text += " Consider reviewing the subject material and completing all activities to improve your grade."
    
    return text


def _add_action_oriented_tone(text):
    if "needing attention" in text.lower() or "high risk" in text.lower():
        if not any(phrase in text for phrase in ["consult", "follow up", "reach out"]):
            text += " Consider scheduling consultations with these students to provide targeted support."
    
    return text


def _add_executive_tone(text):
    if "summary" in text.lower():
        if not any(phrase in text for phrase in ["prioritize", "focus", "allocate"]):
            text += " Prioritize resources for areas with the highest concentration of at-risk students."
    
    return text


def _format_error_naturally(error, intent, role):
    if "not found" in error.lower():
        if role == "student":
            return "I couldn't find that information in your records. Try asking about your schedule, grades, or risk status."
        else:
            return "I couldn't find matching records in your authorized scope. Try refining your search or ask for a summary."
    
    if "permission" in error.lower() or "unauthorized" in error.lower():
        return "You don't have permission to access that information. I can only show data within your authorized scope."
    
    if "ambiguous" in error.lower() or "multiple" in error.lower():
        return "I found multiple matches. Please be more specific with the student name or subject."
    
    return error


def _format_graph_response(graph_data, intent, role, entities):
    summary = graph_data.get("summary", "")
    student_name = (entities or {}).get("student_name")
    
    if role == "student":
        base = "Here is your performance visualization. "
    elif student_name:
        base = f"Here is the performance graph for {student_name}. "
    else:
        base = "Here is the class performance visualization. "
    
    if summary:
        return base + summary
    
    return base + "The graph shows the current academic standing based on available data."


def _format_list_response(data_list, intent, role):
    if not data_list:
        return "No records found."
    
    if role == "student":
        return f"I found {len(data_list)} record(s) for your request."
    
    return f"I found {len(data_list)} record(s) in your authorized scope."


def explain_result_naturally(result_data, intent, role):
    if not result_data:
        return "There's no additional detail available for that result."
    
    if isinstance(result_data, str):
        if "reason:" in result_data.lower():
            parts = result_data.split("reason:", 1)
            if len(parts) > 1:
                reason = parts[1].split(".", 1)[0].strip()
                return f"The main reason is: {reason}. This is based on the current academic monitoring rules and available data."
        
        if "suggested action:" in result_data.lower():
            parts = result_data.split("suggested action:", 1)
            if len(parts) > 1:
                action = parts[1].split(".", 1)[0].strip()
                return f"Suggested action: {action}."
    
    return "The result is based on current grades, attendance, and missing activities according to the academic monitoring system."


def format_clarification_naturally(clarification_type, role, options=None):
    if clarification_type == "student_name":
        return "Which student do you mean? Please provide the full name."
    
    if clarification_type == "subject":
        if options:
            return f"Which subject? Available options: {', '.join(options[:5])}."
        return "Which subject do you mean? Please specify the subject code or name."
    
    if clarification_type == "date":
        return "Which date range: today, tomorrow, or this week?"
    
    if clarification_type == "multiple_matches":
        if options:
            return f"I found multiple matches: {', '.join(options[:5])}. Which one do you mean?"
        return "I found multiple matches. Please be more specific."
    
    return "I need more information to answer that. Can you clarify?"
