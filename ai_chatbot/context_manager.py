import uuid

from database_tools import _execute, _query_all, _query_one, ensure_smart_chatbot_tables, normalize_role


def create_or_get_session(user_id, role, session_id=None):
    role = normalize_role(role)
    if role is None:
        return None

    ensure_smart_chatbot_tables()

    if session_id:
        existing = _query_one(
            """
            SELECT id
            FROM chatbot_sessions
            WHERE id = %s AND user_id = %s AND role = %s
            LIMIT 1
            """,
            (session_id, int(user_id), role),
        )
        if existing:
            return existing["id"]

    new_session_id = uuid.uuid4().hex
    _execute(
        """
        INSERT INTO chatbot_sessions (id, user_id, role)
        VALUES (%s, %s, %s)
        """,
        (new_session_id, int(user_id), role),
    )
    return new_session_id


def save_message(user_id, role, session_id, user_message, intent, confidence, bot_response):
    role = normalize_role(role)
    if role is None:
        return None

    ensure_smart_chatbot_tables()
    message_id = _execute(
        """
        INSERT INTO chatbot_messages (
            user_id,
            role,
            session_id,
            user_message,
            detected_intent,
            confidence_score,
            bot_response
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        """,
        (
            int(user_id),
            role,
            session_id,
            (user_message or "").strip()[:4000],
            intent,
            float(confidence or 0),
            (bot_response or "").strip()[:4000],
        ),
    )
    _execute(
        """
        UPDATE chatbot_sessions
        SET last_intent = %s
        WHERE id = %s AND user_id = %s AND role = %s
        """,
        (intent, session_id, int(user_id), role),
    )
    return message_id


def update_session_state(session_id, user_id, role, last_result_type=None, pending_clarification=None):
    role = normalize_role(role)
    if role is None or not session_id:
        return

    ensure_smart_chatbot_tables()
    _execute(
        """
        UPDATE chatbot_sessions
        SET
            last_result_type = %s,
            pending_clarification = %s
        WHERE id = %s AND user_id = %s AND role = %s
        """,
        (
            (last_result_type or "").strip()[:80] or None,
            (pending_clarification or "").strip()[:80] or None,
            session_id,
            int(user_id),
            role,
        ),
    )


def get_session_state(user_id, role, session_id):
    role = normalize_role(role)
    if role is None or not session_id:
        return {}

    ensure_smart_chatbot_tables()
    row = _query_one(
        """
        SELECT
            id,
            last_intent,
            last_result_type,
            pending_clarification,
            summary
        FROM chatbot_sessions
        WHERE id = %s AND user_id = %s AND role = %s
        LIMIT 1
        """,
        (session_id, int(user_id), role),
    )
    return row or {}


def get_recent_context(user_id, session_id, limit=10):
    ensure_smart_chatbot_tables()
    limit = max(1, min(int(limit), 30))
    return _query_all(
        f"""
        SELECT
            id,
            user_id,
            role,
            session_id,
            user_message,
            detected_intent,
            confidence_score,
            bot_response,
            created_at
        FROM chatbot_messages
        WHERE user_id = %s AND session_id = %s
        ORDER BY created_at DESC, id DESC
        LIMIT {limit}
        """,
        (int(user_id), session_id),
    )[::-1]


def get_session_history(user_id, role, session_id, limit=30):
    role = normalize_role(role)
    if role is None or not session_id:
        return []

    ensure_smart_chatbot_tables()
    limit = max(1, min(int(limit), 60))
    return _query_all(
        f"""
        SELECT
            id,
            user_id,
            role,
            session_id,
            user_message,
            detected_intent,
            confidence_score,
            bot_response,
            created_at
        FROM chatbot_messages
        WHERE user_id = %s AND role = %s AND session_id = %s
        ORDER BY created_at DESC, id DESC
        LIMIT {limit}
        """,
        (int(user_id), role, session_id),
    )[::-1]


def get_user_sessions(user_id, role, limit=20):
    role = normalize_role(role)
    if role is None:
        return []

    ensure_smart_chatbot_tables()
    limit = max(1, min(int(limit), 50))
    rows = _query_all(
        f"""
        SELECT
            s.id,
            s.started_at,
            s.ended_at,
            s.last_intent,
            s.summary,
            COUNT(m.id) AS message_count,
            MAX(m.created_at) AS last_message_at
        FROM chatbot_sessions s
        LEFT JOIN chatbot_messages m
            ON m.session_id = s.id
            AND m.user_id = s.user_id
            AND m.role = s.role
        WHERE s.user_id = %s AND s.role = %s
        GROUP BY s.id, s.started_at, s.ended_at, s.last_intent, s.summary
        ORDER BY COALESCE(MAX(m.created_at), s.started_at) DESC
        LIMIT {limit}
        """,
        (int(user_id), role),
    )

    for row in rows:
        preview = _query_one(
            """
            SELECT user_message, bot_response
            FROM chatbot_messages
            WHERE user_id = %s AND role = %s AND session_id = %s
            ORDER BY created_at DESC, id DESC
            LIMIT 1
            """,
            (int(user_id), role, row["id"]),
        )
        if preview:
            row["preview"] = (preview.get("user_message") or preview.get("bot_response") or "").strip()
        else:
            row["preview"] = ""
    return rows


def delete_session(user_id, role, session_id):
    role = normalize_role(role)
    if role is None or not session_id:
        return False

    ensure_smart_chatbot_tables()
    existing = _query_one(
        """
        SELECT id
        FROM chatbot_sessions
        WHERE id = %s AND user_id = %s AND role = %s
        LIMIT 1
        """,
        (session_id, int(user_id), role),
    )
    if not existing:
        return False

    _execute(
        """
        DELETE FROM chatbot_messages
        WHERE session_id = %s AND user_id = %s AND role = %s
        """,
        (session_id, int(user_id), role),
    )
    _execute(
        """
        DELETE FROM chatbot_sessions
        WHERE id = %s AND user_id = %s AND role = %s
        """,
        (session_id, int(user_id), role),
    )
    return True


def get_recent_user_history(user_id, role, limit=30):
    role = normalize_role(role)
    if role is None:
        return []

    ensure_smart_chatbot_tables()
    limit = max(1, min(int(limit), 100))
    return _query_all(
        f"""
        SELECT
            id,
            user_id,
            role,
            session_id,
            user_message,
            detected_intent,
            confidence_score,
            bot_response,
            created_at
        FROM chatbot_messages
        WHERE user_id = %s AND role = %s
        ORDER BY created_at DESC, id DESC
        LIMIT {limit}
        """,
        (int(user_id), role),
    )[::-1]


def update_session_summary(session_id, summary):
    ensure_smart_chatbot_tables()
    _execute(
        """
        UPDATE chatbot_sessions
        SET summary = %s
        WHERE id = %s
        """,
        ((summary or "").strip()[:2000], session_id),
    )


def get_last_intent(user_id, session_id):
    ensure_smart_chatbot_tables()
    row = _query_one(
        """
        SELECT last_intent
        FROM chatbot_sessions
        WHERE user_id = %s AND id = %s
        LIMIT 1
        """,
        (int(user_id), session_id),
    )
    return row.get("last_intent") if row else None


def summarize_recent_conversation(context_rows):
    if not context_rows:
        return ""

    intents = [row.get("detected_intent") for row in context_rows if row.get("detected_intent")]
    last_intent = intents[-1] if intents else "unknown"
    return f"Recent conversation has {len(context_rows)} turn(s). Last intent: {last_intent}."


def get_last_context_state(context_rows):
    if not context_rows:
        return {
            "last_intent": None,
            "last_user_message": "",
            "last_bot_response": "",
            "has_previous_result": False,
        }

    last_row = context_rows[-1]
    last_bot_response = last_row.get("bot_response") or ""
    return {
        "last_intent": last_row.get("detected_intent"),
        "last_user_message": last_row.get("user_message") or "",
        "last_bot_response": last_bot_response,
        "has_previous_result": bool(last_bot_response),
    }
