import json
import re
from collections import Counter

from database_tools import _execute, _query_one, ensure_smart_chatbot_tables, normalize_role


ROLE_DEFAULT_STYLE = {
    "student": "recommendation-focused",
    "faculty": "concise",
    "dean": "summary-first",
    "program_chair": "summary-first",
    "admin": "concise",
}

ROLE_SUGGESTIONS = {
    "student": {
        "current_grade": ["Do I have missing activities?", "Am I at risk?", "What subject should I improve?"],
        "risk_status": ["Do I have missing activities?", "What should I improve?", "Show my grades this semester."],
        "missing_activities": ["Am I at risk?", "Show my grades this semester."],
        "schedule_today": ["What is my next class?", "What are my subjects this semester?"],
    },
    "faculty": {
        "class_summary": ["Show high-risk students", "Show students with missing activities", "Show students with poor attendance"],
        "students_needing_attention": ["Show only high risk", "What about attendance?", "Show missing activities"],
        "high_risk_students": ["Show students with missing activities", "Summarize my class performance"],
    },
    "dean": {
        "class_summary": ["Show high-risk students", "Which subjects have many struggling students?"],
        "students_needing_attention": ["Show overall student performance", "What subject has the problem?"],
    },
    "program_chair": {
        "class_summary": ["Show high-risk students", "Which subjects have many struggling students?"],
        "students_needing_attention": ["Show overall student performance", "What subject has the problem?"],
    },
    "admin": {
        "class_summary": ["Show high-risk students", "Show overall student performance"],
        "students_needing_attention": ["Show students with missing activities", "Show students with poor attendance"],
    },
}


def update_user_memory(user_id, role, detected_intent, user_message=None):
    role = normalize_role(role)
    if role is None or not detected_intent or detected_intent == "unknown":
        return

    ensure_smart_chatbot_tables()
    existing = get_user_memory(user_id, role)
    counts = Counter(existing.get("frequent_intents_map", {}))
    counts[detected_intent] += 1
    frequent = dict(counts.most_common(8))
    last_topics = [detected_intent] + [topic for topic in existing.get("last_topics_list", []) if topic != detected_intent]
    last_topics = last_topics[:6]
    preferred_style = existing.get("preferred_response_style") or ROLE_DEFAULT_STYLE.get(role, "concise")
    profile_memory = dict(existing.get("profile_memory_map", {}))
    profile_memory.update(extract_profile_memory(user_message))
    memory_summary = _build_memory_summary(role, frequent, profile_memory)

    _execute(
        """
        INSERT INTO chatbot_user_memory (
            user_id,
            role,
            preferred_response_style,
            frequent_intents,
            last_topics,
            profile_memory,
            memory_summary
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            preferred_response_style = VALUES(preferred_response_style),
            frequent_intents = VALUES(frequent_intents),
            last_topics = VALUES(last_topics),
            profile_memory = VALUES(profile_memory),
            memory_summary = VALUES(memory_summary),
            updated_at = NOW()
        """,
        (
            int(user_id),
            role,
            preferred_style,
            json.dumps(frequent),
            json.dumps(last_topics),
            json.dumps(profile_memory),
            memory_summary,
        ),
    )


def get_user_memory(user_id, role=None):
    ensure_smart_chatbot_tables()
    params = [int(user_id)]
    role_filter = ""
    normalized_role = normalize_role(role) if role else None
    if normalized_role:
        role_filter = "AND role = %s"
        params.append(normalized_role)

    row = _query_one(
        f"""
        SELECT
            user_id,
            role,
            preferred_response_style,
            frequent_intents,
            last_topics,
            profile_memory,
            memory_summary,
            updated_at
        FROM chatbot_user_memory
        WHERE user_id = %s
          {role_filter}
        ORDER BY updated_at DESC
        LIMIT 1
        """,
        tuple(params),
    )

    if not row:
        return {
            "preferred_response_style": ROLE_DEFAULT_STYLE.get(normalized_role or "", "concise"),
            "frequent_intents_map": {},
            "last_topics_list": [],
            "profile_memory_map": {},
            "memory_summary": "",
        }

    row["frequent_intents_map"] = _safe_json(row.get("frequent_intents"), {})
    row["last_topics_list"] = _safe_json(row.get("last_topics"), [])
    row["profile_memory_map"] = _safe_json(row.get("profile_memory"), {})
    return row


def get_suggested_followups(user_id, role, last_intent):
    role = normalize_role(role)
    if role is None:
        return []

    memory = get_user_memory(user_id, role)
    role_suggestions = ROLE_SUGGESTIONS.get(role, {})
    suggestions = list(role_suggestions.get(last_intent, []))

    frequent = [
        intent
        for intent, _count in sorted(
            memory.get("frequent_intents_map", {}).items(),
            key=lambda item: item[1],
            reverse=True,
        )
        if intent != last_intent
    ]
    for intent in frequent:
        for suggestion in role_suggestions.get(intent, []):
            if suggestion not in suggestions:
                suggestions.append(suggestion)

    return suggestions[:3]


def extract_profile_memory(message):
    text = (message or "").strip()
    if not text:
        return {}

    patterns = [
        r"(?:^|\b)(?:hi|hello|hey)?\s*(?:i am|i'm|im|my name is|call me|you can call me)\s+([a-z][a-z\s.'-]{1,48})(?:[.!?,]|$)",
        r"(?:^|\b)(?:remember that|remember,?)\s+(?:i am|i'm|im|my name is)\s+([a-z][a-z\s.'-]{1,48})(?:[.!?,]|$)",
    ]

    lowered = text.lower()
    for pattern in patterns:
        match = re.search(pattern, lowered, flags=re.IGNORECASE)
        if not match:
            continue
        name = _clean_preferred_name(match.group(1))
        if name:
            return {"preferred_name": name}
    return {}


def get_preferred_name(user_id, role):
    memory = get_user_memory(user_id, role)
    return (memory.get("profile_memory_map") or {}).get("preferred_name")


def is_identity_question(message):
    text = re.sub(r"[^a-z0-9\s]", " ", (message or "").lower())
    text = " ".join(text.split())
    return text in {
        "who am i",
        "who is me",
        "what is my name",
        "do you remember me",
        "do you remember my name",
        "what did i say my name is",
    }


def _build_memory_summary(role, frequent, profile_memory=None):
    fragments = []
    preferred_name = (profile_memory or {}).get("preferred_name")
    if preferred_name:
        fragments.append(f"User prefers to be called {preferred_name}.")
    if frequent:
        top_intent = next(iter(frequent))
        fragments.append(f"{role} commonly asks about {top_intent.replace('_', ' ')}.")
    return " ".join(fragments)


def _clean_preferred_name(value):
    value = re.sub(
        r"\b(and|but|because|please|thanks|thank you|what|show|check|get|display|view|can|do)\b.*$",
        "",
        value or "",
        flags=re.IGNORECASE,
    )
    value = re.sub(r"[^a-zA-Z\s.'-]", " ", value)
    value = " ".join(value.split()).strip(" .'-")
    if not value:
        return None

    blocked = {
        "a student",
        "an student",
        "faculty",
        "a faculty",
        "at risk",
        "in class",
        "not sure",
        "fine",
        "okay",
        "ok",
    }
    if value.lower() in blocked or value.lower().startswith(("at ", "in ", "a ", "an ", "not ")):
        return None
    if len(value) > 40:
        return None

    return " ".join(part.capitalize() for part in value.split())


def _safe_json(value, fallback):
    if not value:
        return fallback
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, type(fallback)) else fallback
    except (TypeError, ValueError):
        return fallback
