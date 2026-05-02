import re
from dataclasses import dataclass

from retraining_pipeline import predict_intent_with_model
from semantic_matcher import match_intent, normalize_text


@dataclass(frozen=True)
class IntentResult:
    intent: str
    subject_hint: str | None = None
    confidence: float = 0.0
    source: str = "rule"
    needs_clarification: bool = False


SUPPORTED_INTENTS = {
    "schedule_clarification",
    "schedule_today",
    "schedule_tomorrow",
    "schedule_week",
    "next_class",
    "schedule_next",
    "enrolled_subjects",
    "subjects",
    "current_grade",
    "subject_grade",
    "attendance_status",
    "missing_activities",
    "risk_status",
    "improvement_advice",
    "explain_risk",
    "class_summary",
    "students_needing_attention",
    "high_risk_students",
    "low_grade_students",
    "poor_attendance_students",
    "missing_activity_students",
    "subject_performance_summary",
    "explain_student_risk",
    "consultation_candidates",
    "college_summary",
    "program_risk_summary",
    "subject_risk_summary",
    "high_risk_overview",
    "attendance_overview",
    "intervention_summary",
    "faculty_class_monitoring",
    "program_summary",
    "year_level_summary",
    "section_summary",
    "program_high_risk_students",
    "program_subject_concerns",
    "program_attendance_concerns",
    "program_intervention_summary",
    "explain_previous_result",
    "filter_previous_result",
    "show_more_details",
    "show_only_high_risk",
    "show_attendance_details",
    "show_missing_activity_details",
    "clarify_date",
    "unknown",
}

MODEL_INTENT_ALIASES = {
    "schedule_next": "next_class",
    "subjects": "enrolled_subjects",
    "attendance_concerns": "poor_attendance_students",
}


def detect_intent(message: str, role=None, context=None, session_state=None) -> IntentResult:
    # Backward compatibility for previous calls: detect_intent(message, context).
    if isinstance(role, list) and context is None:
        context = role
        role = None

    text = normalize_text(message)
    context = context or []
    session_state = session_state or {}

    if not text:
        return IntentResult("unknown", confidence=0.0)

    follow_up = _detect_context_follow_up(text, role, context, session_state)
    if follow_up.intent != "unknown":
        return follow_up

    keyword = _detect_keyword_intent(text, role)
    if keyword.intent != "unknown":
        return keyword

    model_intent, model_confidence = predict_intent_with_model(text)
    model_intent = MODEL_INTENT_ALIASES.get(model_intent, model_intent)

    semantic = match_intent(text, role)
    semantic_intent = MODEL_INTENT_ALIASES.get(semantic.intent, semantic.intent)

    if semantic_intent in SUPPORTED_INTENTS and semantic.score >= 0.58:
        confidence = min(0.94, max(0.55, semantic.score))
        if model_intent == semantic_intent and model_confidence > confidence:
            confidence = min(0.96, model_confidence)
        return IntentResult(
            semantic_intent,
            extract_subject_hint(text),
            confidence,
            source=f"semantic:{semantic.example}",
        )

    if model_intent in SUPPORTED_INTENTS and model_confidence >= 0.5:
        return IntentResult(model_intent, extract_subject_hint(text), model_confidence, "reviewed_model")

    return IntentResult("unknown", confidence=0.2, source="fallback")


def extract_subject_hint(text: str) -> str | None:
    patterns = [
        r"\bgrade\s+(?:in|for|of)\s+(.+?)(?:\?|$)",
        r"\bcurrent\s+grade\s+(?:in|for|of)\s+(.+?)(?:\?|$)",
        r"\bsubject\s+(?:called|named)\s+(.+?)(?:\?|$)",
    ]

    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        hint = _clean_subject_hint(match.group(1))
        if hint:
            return hint
    return None


def _detect_keyword_intent(text: str, role=None) -> IntentResult:
    if _is_schedule_clarification(text):
        return IntentResult("schedule_clarification", confidence=0.64, needs_clarification=True)

    if _has_any(text, ["next class", "upcoming class", "class is next", "next schedule"]):
        return IntentResult("next_class", confidence=0.94)

    if _has_any(text, ["schedule today", "class today", "classes today", "today schedule", "for today"]) or _schedule_word_with_day(text, "today"):
        return IntentResult("schedule_today", confidence=0.94)

    if _has_any(text, ["schedule tomorrow", "class tomorrow", "classes tomorrow", "tomorrow schedule", "for tomorrow"]) or _schedule_word_with_day(text, "tomorrow"):
        return IntentResult("schedule_tomorrow", confidence=0.94)

    if _has_any(text, ["schedule this week", "weekly schedule", "schedule week", "classes this week", "this week schedule"]) or (
        _has_any(text, ["schedule", "class", "classes"]) and "week" in text
    ):
        return IntentResult("schedule_week", confidence=0.91)

    if text in {"today", "today please"}:
        return IntentResult("schedule_today", confidence=0.76, source="short_date")

    if text in {"tomorrow", "tomorrow please"}:
        return IntentResult("schedule_tomorrow", confidence=0.76, source="short_date")

    if text in {"this week", "week", "weekly"}:
        return IntentResult("schedule_week", confidence=0.76, source="short_date")

    if _has_any(text, ["my subjects", "subjects this semester", "enrolled subjects", "subjects enrolled", "subject list"]):
        return IntentResult("enrolled_subjects", confidence=0.9)

    if _has_any(text, ["why am i high risk", "why am i at risk", "explain my risk", "why am i failing"]):
        return IntentResult("explain_risk", confidence=0.9)

    if _has_any(text, ["what should i improve", "what subject should i focus", "how can i improve", "weak areas", "focus on"]):
        return IntentResult("improvement_advice", confidence=0.88)

    if _has_any(text, ["my attendance", "attendance status", "show my attendance", "attendance record"]):
        return IntentResult("attendance_status", confidence=0.88)

    if _has_any(text, ["am i at risk", "risk status", "risk of failing", "my risk level", "am i failing"]):
        return IntentResult("risk_status", confidence=0.9)

    if "grade" in text or "lowest subject" in text or "lowest grade" in text:
        subject_hint = extract_subject_hint(text)
        return IntentResult("subject_grade" if subject_hint else "current_grade", subject_hint, confidence=0.86)

    if _has_any(text, ["what date", "which date", "what day", "when"]):
        return IntentResult("clarify_date", confidence=0.76, needs_clarification=True)

    if _has_any(text, ["show only high risk", "only high risk", "high risk only", "filter high risk"]):
        return IntentResult("show_only_high_risk", confidence=0.9, source="context_filter")

    if _has_any(text, ["what specific attendance", "specific attendance", "what about attendance", "how about attendance"]):
        return IntentResult("show_attendance_details", confidence=0.86, source="follow_up_phrase")

    if _has_any(text, ["what about missing activities", "how about missing activities", "missing activity details"]):
        return IntentResult("show_missing_activity_details", confidence=0.86, source="follow_up_phrase")

    if _has_any(text, ["tell me more", "tell me more about it", "more details", "explain more"]) or text == "more":
        return IntentResult("show_more_details", confidence=0.82, source="follow_up_phrase")

    if _has_any(text, ["why", "explain that", "explain it", "why included", "why is he", "why is she"]):
        return IntentResult("explain_previous_result", confidence=0.78, source="follow_up_phrase")

    if _has_any(text, ["high risk students in my program", "program high risk students", "at risk students in my program"]):
        return IntentResult("program_high_risk_students", confidence=0.93)

    if _has_any(text, ["program attendance concerns", "attendance concerns in my program", "program attendance problems"]):
        return IntentResult("program_attendance_concerns", confidence=0.9)

    if _has_any(text, ["program intervention", "students needing consultation in my program", "program students needing intervention"]):
        return IntentResult("program_intervention_summary", confidence=0.88)

    if _has_any(text, ["year level summary", "by year level", "which year level"]):
        return IntentResult("year_level_summary", confidence=0.9)

    if _has_any(text, ["section summary", "section performance", "which section"]):
        return IntentResult("section_summary", confidence=0.9)

    if _has_any(text, ["subject concerns", "which subjects are problematic", "problematic subjects"]):
        if role == "program_chair":
            return IntentResult("program_subject_concerns", confidence=0.9)
        return IntentResult("subject_risk_summary", confidence=0.88)

    if _has_any(text, ["program summary", "performance of my program", "program performance"]):
        return IntentResult("program_summary", confidence=0.91)

    if _has_any(text, ["high risk overview", "high risk by program", "all high risk students"]):
        return IntentResult("high_risk_overview", confidence=0.92)

    if _has_any(text, ["program risk summary", "which program needs attention", "programs with high risk"]):
        return IntentResult("program_risk_summary", confidence=0.9)

    if _has_any(text, ["attendance overview", "attendance concerns across the college", "college attendance concerns"]):
        return IntentResult("attendance_overview", confidence=0.9)

    if _has_any(text, ["intervention summary", "academic intervention", "students needing academic intervention"]):
        return IntentResult("intervention_summary", confidence=0.88)

    if _has_any(text, ["faculty class monitoring", "which faculty", "which class needs attention", "classes needing attention"]):
        return IntentResult("faculty_class_monitoring", confidence=0.86)

    if _has_any(text, ["overall performance", "overall academic performance", "college performance", "department performance"]):
        if role == "program_chair":
            return IntentResult("program_summary", confidence=0.86)
        if role in {"dean", "admin"}:
            return IntentResult("college_summary", confidence=0.9)
        return IntentResult("class_summary", confidence=0.82)

    if _has_any(text, ["poor attendance", "attendance concern", "attendance concerns", "attendance problem", "attendance issue", "low attendance", "always absent"]):
        return IntentResult("poor_attendance_students", confidence=0.9)

    if _has_any(text, ["missing activity", "missing activities", "missing requirement", "missing requirements", "not submitted", "incomplete submissions"]):
        return IntentResult("missing_activity_students" if role != "student" else "missing_activities", confidence=0.92)

    if _has_any(text, ["low grade students", "students with low grades", "below passing", "below 75", "failing grade"]):
        return IntentResult("low_grade_students", confidence=0.88)

    if _has_any(text, ["high risk students", "who is high risk", "who is failing", "list failing students", "danger students", "high risk"]):
        return IntentResult("high_risk_students", confidence=0.91)

    if _is_students_attention_query(text):
        return IntentResult("students_needing_attention", confidence=0.88)

    if _has_any(text, ["my class performance", "class performance", "class doing", "class standing", "class report", "my students doing", "overall class status"]):
        return IntentResult("class_summary", confidence=0.9)

    return IntentResult("unknown", confidence=0.0)


def _detect_context_follow_up(text, role, context, session_state):
    last_intents = [
        row.get("detected_intent")
        for row in reversed(context)
        if row.get("detected_intent")
    ]
    last_intent = session_state.get("pending_clarification") or (last_intents[0] if last_intents else None)
    last_result_type = session_state.get("last_result_type") or last_intent

    if text in {"today", "for today"} and _last_was_schedule_related(last_intent):
        return IntentResult("schedule_today", confidence=0.91, source="context_date")

    if text in {"tomorrow", "for tomorrow"} and _last_was_schedule_related(last_intent):
        return IntentResult("schedule_tomorrow", confidence=0.91, source="context_date")

    if text in {"this week", "week", "weekly"} and _last_was_schedule_related(last_intent):
        return IntentResult("schedule_week", confidence=0.91, source="context_date")

    if text in {"why", "why?", "explain", "explain that", "explain it"} and last_result_type:
        if role == "student" and last_result_type in {"risk_status", "explain_risk", "improvement_advice"}:
            return IntentResult("explain_risk", confidence=0.86, source="context_follow_up")
        return IntentResult("explain_previous_result", confidence=0.86, source="context_follow_up")

    if text in {"more", "details", "tell me more", "tell me more about it"} and last_result_type:
        return IntentResult("show_more_details", confidence=0.82, source="context_follow_up")

    if _has_any(text, ["show only high risk", "only high risk", "high risk only", "filter high risk"]):
        return IntentResult("show_only_high_risk", confidence=0.88, source="context_follow_up")

    if _has_any(text, ["attendance", "absent", "absence", "absences"]):
        return IntentResult("show_attendance_details", confidence=0.84, source="context_follow_up")

    if _has_any(text, ["missing activities", "requirements", "missing", "not submitted"]):
        return IntentResult("show_missing_activity_details", confidence=0.84, source="context_follow_up")

    if _has_any(text, ["what date", "which date", "what day", "when"]):
        return IntentResult("clarify_date", confidence=0.76, source="context_follow_up", needs_clarification=True)

    if text in {"yes", "ok", "okay", "sure"} and last_result_type:
        return IntentResult("show_more_details", confidence=0.62, source="context_acknowledgement", needs_clarification=True)

    return IntentResult("unknown", confidence=0.0)


def _is_schedule_clarification(text):
    if _has_any(text, ["today", "tomorrow", "week", "next", "upcoming"]):
        return False
    return text in {"schedule", "class schedule", "my schedule", "classes", "my classes", "school schedule"} or (
        _has_any(text, ["schedule", "classes"]) and len(text.split()) <= 4
    )


def _last_was_schedule_related(intent):
    return intent in {
        "schedule_clarification",
        "schedule_today",
        "schedule_tomorrow",
        "schedule_week",
        "next_class",
        "schedule_next",
        "clarify_date",
    }


def _is_students_attention_query(text: str) -> bool:
    attention_phrases = [
        "students need attention",
        "students that need attention",
        "students needing attention",
        "who needs attention",
        "who needs help",
        "need consultation",
        "needs consultation",
        "academically at risk",
        "students at risk",
        "students struggling",
        "weak students",
        "who should i monitor",
        "students with problems",
        "students needing support",
    ]
    if _has_any(text, attention_phrases):
        return True
    return "students" in text and _has_any(text, ["risk", "attention", "consultation", "failing", "weak", "struggling", "support"])


def _has_any(text: str, phrases: list[str]) -> bool:
    return any(phrase in text for phrase in phrases)


def _schedule_word_with_day(text: str, day_word: str) -> bool:
    return _has_any(text, ["schedule", "class", "classes"]) and day_word in text


def _clean_subject_hint(value: str) -> str | None:
    value = re.sub(r"\b(this subject|my subject|the subject|please|now|current)\b", "", value)
    value = re.sub(r"[^a-z0-9\s\-&.]", " ", value)
    value = " ".join(value.split()).strip()
    if not value or len(value) < 2:
        return None
    return value[:80]
