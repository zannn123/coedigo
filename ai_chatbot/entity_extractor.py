import re


def extract_entities(message, intent, context=None, session_state=None):
    text = (message or "").strip()
    context = context or []
    session_state = session_state or {}
    
    entities = {
        "student_name": None,
        "subject_hint": None,
        "date_range": None,
        "graph_type": None,
        "metric": None,
        "web_search_topic": None,
    }
    
    if intent in {"student_graph", "student_grade_graph", "student_attendance_graph", "student_risk_graph", "report_graph"}:
        entities["student_name"] = _extract_student_name(text, context, session_state)
        entities["subject_hint"] = _extract_subject_hint(text)
        if _same_value(entities["student_name"], entities["subject_hint"]):
            entities["subject_hint"] = None
        entities["graph_type"] = _extract_graph_type(text, intent)
        entities["metric"] = _extract_metric(text)
        entities["date_range"] = _extract_date_range(text)
        
        # Check if this is a clarification response (just a subject code/name)
        pending = session_state.get("pending_clarification")
        if pending in {"student_graph", "student_grade_graph", "report_graph"} and not entities["student_name"]:
            # User might be responding with just a subject
            if _looks_like_subject_code(text):
                entities["subject_hint"] = text.upper()
            elif len(text.split()) <= 3 and not _has_intent_keywords(text):
                entities["subject_hint"] = text
    
    if intent == "web_search":
        entities["web_search_topic"] = _extract_web_search_topic(text)
    
    if intent in {"student_grade_lookup", "subject_grade"}:
        entities["student_name"] = _extract_student_name(text, context, session_state)
        entities["subject_hint"] = _extract_subject_hint(text)
    
    return entities


def _extract_student_name(text, context, session_state):
    patterns = [
        r"\b(?:show|create|make|generate|visualize)\s+(?:a\s+)?(?:graph|chart)\s+(?:of|for|the)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})(?:\s+(?:in|under|subject|for)\s+|[?.!,]|$)",
        r"\b(?:graph|chart)\s+(?:of|for|the)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})(?:\s+(?:in|under|subject|for)\s+|[?.!,]|$)",
        r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})['']?s?\s+(?:graph|chart|performance|grades|attendance)",
        r"\b(?:student|name)\s+(?:is|called|named)?\s*:?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})",
        r"\b(?:graph|chart|show|create|make|generate|visualize)\s+(?:a\s+)?(?:graph|chart)?\s*(?:of|for|the)?\s*([a-zA-Z][a-zA-Z0-9.'-]{1,}(?:\s+[a-zA-Z][a-zA-Z0-9.'-]{1,}){0,3})(?:\s+(?:in|under|subject|for)\s+|[?.!,]|$)",
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            name = match.group(1).strip()
            if _is_valid_student_name(name):
                return _clean_student_name(name)
    
    pending = session_state.get("pending_clarification")
    if pending in {"student_graph", "student_grade_lookup", "report_graph"}:
        words = text.split()
        if 1 <= len(words) <= 4 and all(re.match(r"^[a-zA-Z0-9.'-]+$", word) for word in words):
            name = " ".join(words)
            if _is_valid_student_name(name):
                return _clean_student_name(name)
    
    for row in reversed(context):
        if row.get("detected_intent") in {"student_graph", "student_grade_lookup", "report_graph"}:
            prev_name = _extract_student_name(row.get("user_message") or "", [], {})
            if prev_name:
                return prev_name
    
    return None


def _extract_subject_hint(text):
    code_match = re.search(r"\b([A-Z]{2,6}\s*\d{2,4}[A-Z]?)\b", text)
    if code_match:
        return " ".join(code_match.group(1).upper().split())
    
    patterns = [
        r"\b(?:in|under|subject)\s+([A-Za-z0-9\s&.-]{2,60})(?:\s+(?:graph|chart|class|section)|$)",
    ]

    if not re.search(r"\b(graph|chart|plot|visualize)\b", text, flags=re.IGNORECASE):
        patterns.append(r"\b(?:for|of)\s+([A-Za-z0-9\s&.-]{2,60})(?:\s+(?:graph|chart|class|section)|$)")
    
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            hint = _clean_subject_hint(match.group(1))
            if hint:
                return hint
    
    return None


def _extract_graph_type(text, intent):
    text_lower = text.lower()
    
    if "attendance" in text_lower:
        return "attendance"
    if "grade" in text_lower or "score" in text_lower:
        return "grades"
    if "risk" in text_lower:
        return "risk"
    if "performance" in text_lower:
        return "performance"
    if "class" in text_lower and "performance" in text_lower:
        return "class_performance"
    
    if intent == "student_attendance_graph":
        return "attendance"
    if intent == "student_grade_graph":
        return "grades"
    if intent == "student_risk_graph":
        return "risk"
    
    return "general_performance"


def _extract_metric(text):
    text_lower = text.lower()
    
    if "attendance" in text_lower:
        return "attendance"
    if "grade" in text_lower or "score" in text_lower:
        return "grades"
    if "risk" in text_lower:
        return "risk"
    if "missing" in text_lower and "activit" in text_lower:
        return "missing_activities"
    if "performance" in text_lower:
        return "performance"
    
    return None


def _extract_date_range(text):
    text_lower = text.lower()
    
    if "this semester" in text_lower or "current semester" in text_lower:
        return "current_semester"
    if "this month" in text_lower or "current month" in text_lower:
        return "current_month"
    if "this week" in text_lower:
        return "current_week"
    if "midterm" in text_lower:
        return "midterm"
    if "final" in text_lower or "finals" in text_lower:
        return "finals"
    
    return None


def _extract_web_search_topic(text):
    text = text.strip()
    
    prefixes = [
        "search the internet about",
        "search the internet for",
        "search the web about",
        "search the web for",
        "search online about",
        "search online for",
        "look up online",
        "look up",
        "search for",
        "find information about",
        "what is",
        "who is",
        "define",
    ]
    
    text_lower = text.lower()
    for prefix in prefixes:
        if text_lower.startswith(prefix):
            topic = text[len(prefix):].strip(" :,.-")
            return topic if len(topic) >= 3 else None
    
    return text if len(text) >= 3 else None


def _is_valid_student_name(name):
    if not name or len(name) < 2 or len(name) > 60:
        return False
    
    blocked = {
        "my", "me", "mine", "student", "the student", "a student",
        "graph", "chart", "show", "create", "make", "generate",
        "performance", "grades", "attendance", "risk", "example", "sample"
    }
    
    if name.lower() in blocked:
        return False
    
    words = name.split()
    if len(words) > 4:
        return False
    
    return True


def _clean_student_name(name):
    name = re.sub(r"\s+(?:in|under|subject|for)\s+[a-zA-Z]{2,6}(?:\s*\d{2,4}[A-Z]?)?.*$", " ", name or "", flags=re.IGNORECASE)
    name = re.sub(r"\b(graph|chart|show|create|make|generate|visualize|for|of|the|student|performance|grades?|attendance|risk|scores?)\b", " ", name, flags=re.IGNORECASE)
    name = re.sub(r"[^a-zA-Z0-9\s.'-]", " ", name)
    return " ".join(name.split()).strip()[:60]


def _clean_subject_hint(value):
    value = re.sub(r"\b(the|subject|class|please|graph|chart|show)\b", " ", value, flags=re.IGNORECASE)
    value = re.sub(r"[^a-zA-Z0-9\s&.-]", " ", value)
    value = " ".join(value.split()).strip()
    return value[:60] if len(value) >= 2 else None


def _looks_like_subject_code(text):
    return bool(re.match(r"^[A-Z]{2,6}\s*\d{2,4}[A-Z]?$", text, re.IGNORECASE))


def _has_intent_keywords(text):
    keywords = ["graph", "chart", "show", "create", "make", "generate", "visualize", 
                "grade", "performance", "attendance", "risk", "student"]
    text_lower = text.lower()
    return any(keyword in text_lower for keyword in keywords)


def _same_value(left, right):
    if not left or not right:
        return False
    return re.sub(r"[^a-z0-9]+", "", left.lower()) == re.sub(r"[^a-z0-9]+", "", right.lower())
