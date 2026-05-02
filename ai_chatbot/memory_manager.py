import json
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


def update_user_memory(user_id, role, detected_intent):
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
    memory_summary = _build_memory_summary(role, frequent)

    _execute(
        """
        INSERT INTO chatbot_user_memory (
            user_id,
            role,
            preferred_response_style,
            frequent_intents,
            last_topics,
            memory_summary
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
            preferred_response_style = VALUES(preferred_response_style),
            frequent_intents = VALUES(frequent_intents),
            last_topics = VALUES(last_topics),
            memory_summary = VALUES(memory_summary),
            updated_at = NOW()
        """,
        (
            int(user_id),
            role,
            preferred_style,
            json.dumps(frequent),
            json.dumps(last_topics),
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
            "memory_summary": "",
        }

    row["frequent_intents_map"] = _safe_json(row.get("frequent_intents"), {})
    row["last_topics_list"] = _safe_json(row.get("last_topics"), [])
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


def _build_memory_summary(role, frequent):
    if not frequent:
        return ""
    top_intent = next(iter(frequent))
    return f"{role} commonly asks about {top_intent.replace('_', ' ')}."


def _safe_json(value, fallback):
    if not value:
        return fallback
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, type(fallback)) else fallback
    except (TypeError, ValueError):
        return fallback
