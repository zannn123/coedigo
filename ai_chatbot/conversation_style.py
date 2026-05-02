def should_greet(session_id, context):
    if not context:
        return True
    
    if len(context) <= 1:
        return True
    
    recent_intents = [row.get("detected_intent") for row in context[-3:]]
    if "small_talk_greeting" in recent_intents:
        return False
    
    return False


def get_greeting_style(role, user_name=None):
    name = user_name or "there"
    
    greetings = {
        "student": f"Hi {name}. I can help with schedules, grades, attendance, missing work, and risk status.",
        "faculty": f"Hi {name}. I can help with class summaries, high-risk students, and performance monitoring.",
        "dean": f"Hi {name}. I can help with college summaries, program risk analysis, and department insights.",
        "program_chair": f"Hi {name}. I can help with program summaries, section analysis, and student monitoring.",
        "admin": f"Hi {name}. I can help with system-wide summaries and academic monitoring.",
    }
    
    return greetings.get(role, f"Hi {name}. How can I help you today?")


def format_direct_answer(reply, intent, role):
    if not reply:
        return reply
    
    redundant_prefixes = [
        "Hello! Welcome to C.O.E.D.I.G.O.",
        "Welcome to the chatbot",
        "How can I assist you today?",
        "I am your AI assistant",
    ]
    
    for prefix in redundant_prefixes:
        if reply.startswith(prefix):
            parts = reply.split(".", 1)
            if len(parts) > 1:
                return parts[1].strip()
    
    return reply


def get_context_aware_followup(intent, role, result_data=None):
    if role == "student":
        followups = {
            "current_grade": ["Do I have missing activities?", "Am I at risk?"],
            "risk_status": ["What should I improve?", "Show my grades"],
            "attendance_status": ["Show my grades", "Am I at risk?"],
            "missing_activities": ["Am I at risk?", "Show my grades"],
            "schedule_today": ["What is my next class?", "Show my subjects"],
        }
    elif role == "faculty":
        followups = {
            "class_summary": ["Show high-risk students", "Show attendance concerns"],
            "high_risk_students": ["Show missing activities", "Show attendance details"],
            "students_needing_attention": ["Show only high risk", "What about attendance?"],
        }
    elif role in {"dean", "program_chair"}:
        followups = {
            "college_summary": ["Show high-risk overview", "Which programs need attention?"],
            "program_summary": ["Show section summary", "Show high-risk students"],
            "high_risk_overview": ["Show attendance overview", "Which subjects are problematic?"],
        }
    else:
        followups = {}
    
    return followups.get(intent, [])


def vary_response_phrasing(reply, intent):
    if not reply:
        return reply
    
    variations = {
        "No matching record was found.": [
            "I couldn't find any matching records.",
            "No records match your request.",
            "There are no matching records in the system.",
        ],
        "Sorry, you do not have permission to view that information.": [
            "You don't have permission to access that information.",
            "That information is not available for your account.",
            "Access to that information is restricted.",
        ],
    }
    
    for original, options in variations.items():
        if reply == original:
            import random
            return random.choice(options)
    
    return reply
