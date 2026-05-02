from database_tools import _execute, _query_one, ensure_smart_chatbot_tables


def save_feedback(message_id, user_id, rating, feedback_text=None, corrected_intent=None):
    if rating not in {"helpful", "not_helpful"}:
        raise ValueError("rating must be helpful or not_helpful")

    ensure_smart_chatbot_tables()
    message = _query_one(
        """
        SELECT id, user_id, user_message, detected_intent
        FROM chatbot_messages
        WHERE id = %s AND user_id = %s
        LIMIT 1
        """,
        (int(message_id), int(user_id)),
    )
    if not message:
        return False

    _execute(
        """
        INSERT INTO chatbot_feedback (
            message_id,
            user_id,
            rating,
            feedback_text,
            corrected_intent
        )
        VALUES (%s, %s, %s, %s, %s)
        """,
        (
            int(message_id),
            int(user_id),
            rating,
            (feedback_text or "").strip()[:2000] or None,
            (corrected_intent or "").strip()[:80] or None,
        ),
    )

    if rating == "not_helpful":
        add_training_example(
            text=message.get("user_message") or "",
            original_intent=message.get("detected_intent"),
            corrected_intent=corrected_intent or None,
            source="user_feedback",
            reviewed=False,
        )

    return True


def add_training_example(text, original_intent, corrected_intent, source="user_feedback", reviewed=False):
    if source not in {"user_feedback", "admin_added", "system_suggested"}:
        source = "system_suggested"

    ensure_smart_chatbot_tables()
    _execute(
        """
        INSERT INTO chatbot_training_examples (
            text,
            original_intent,
            corrected_intent,
            source,
            reviewed
        )
        VALUES (%s, %s, %s, %s, %s)
        """,
        (
            (text or "").strip()[:4000],
            (original_intent or "").strip()[:80] or None,
            (corrected_intent or "").strip()[:80] or None,
            source,
            1 if reviewed else 0,
        ),
    )
