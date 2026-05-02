from collections import defaultdict
from dataclasses import replace
import re

from chart_generator import generate_chart
from context_manager import (
    create_or_get_session,
    delete_session as delete_chat_session,
    get_recent_context,
    get_session_history,
    get_session_state,
    get_user_sessions,
    save_message,
    summarize_recent_conversation,
    update_session_summary,
    update_session_state,
)
from database_tools import (
    ChatbotDatabaseError,
    clear_chat_history,
    get_attendance_concerns,
    get_authorized_student_grade_records,
    get_class_performance_summary,
    get_chat_history,
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
    validate_user,
)
from entity_extractor import extract_entities
from feedback_manager import save_feedback as persist_feedback
from intent_detector import detect_intent
from memory_manager import extract_profile_memory, get_preferred_name, get_suggested_followups, update_user_memory
from prompts import (
    DATABASE_ERROR_REPLY,
    NO_PERMISSION_REPLY,
)
from response_templates import clarification_payload, fallback_reply, no_matching_record, suggested_followups
from role_policy import canonicalize_intent_for_role, get_unauthorized_reply, is_intent_allowed
from web_search import summarize_context, web_lookup


class AcademicChatbot:
    def handle_message(self, user_id, role, message, session_id=None):
        user_id = self._normalize_user_id(user_id)
        role = normalize_role(role)
        message = (message or "").strip()

        if not user_id or role is None or not message:
            return {
                "reply": "Invalid request. Please provide user_id, role, and message.",
                "_status": 400,
            }

        try:
            user = validate_user(user_id, role)
            if not user:
                return {"reply": NO_PERMISSION_REPLY, "_status": 403}

            session_id = create_or_get_session(user_id, role, session_id)
            context = get_recent_context(user_id, session_id, limit=10)
            session_state = get_session_state(user_id, role, session_id)
            intent = detect_intent(message, role=role, context=context, session_state=session_state)
            canonical_intent = canonicalize_intent_for_role(intent.intent, role)
            intent = replace(intent, intent=canonical_intent)

            needs_clarification = False
            custom_suggestions = None
            graph_data = None

            if not is_intent_allowed(intent.intent, role):
                reply = get_unauthorized_reply()
            elif intent.intent in {"schedule_clarification", "clarify_date"} or intent.needs_clarification:
                clarification = clarification_payload(intent.intent, role)
                reply = clarification["reply"]
                custom_suggestions = clarification.get("suggestions", [])
                needs_clarification = True
            elif intent.confidence < 0.5:
                reply = fallback_reply(role)
                needs_clarification = True
            elif intent.confidence < 0.75:
                clarification = clarification_payload(intent.intent, role)
                reply = clarification["reply"]
                custom_suggestions = clarification.get("suggestions", [])
                needs_clarification = True
            else:
                dispatch_result = self._dispatch(user_id, role, message, intent, context, session_state, user)
                if isinstance(dispatch_result, dict):
                    reply = dispatch_result.get("reply", "")
                    needs_clarification = bool(dispatch_result.get("needs_clarification"))
                    custom_suggestions = dispatch_result.get("suggestions")
                    graph_data = dispatch_result.get("graph")
                else:
                    reply = dispatch_result

            message_id = save_message(
                user_id=user_id,
                role=role,
                session_id=session_id,
                user_message=message,
                intent=intent.intent,
                confidence=intent.confidence,
                bot_response=reply,
            )
            update_session_summary(session_id, summarize_recent_conversation(context))
            update_session_state(
                session_id,
                user_id,
                role,
                last_result_type=None if needs_clarification else intent.intent,
                pending_clarification=intent.intent if needs_clarification else None,
            )
            update_user_memory(user_id, role, intent.intent, message)
            suggestions = custom_suggestions or self._suggestions(user_id, role, intent.intent)

            response = {
                "reply": reply,
                "intent": intent.intent,
                "confidence": round(float(intent.confidence), 3),
                "role": role,
                "session_id": session_id,
                "message_id": message_id,
                "suggested_questions": suggestions,
            }
            if needs_clarification:
                response["needs_clarification"] = True
            if graph_data:
                # Support both old format (dict with type/data) and new format (dict with url)
                if isinstance(graph_data, dict):
                    if graph_data.get("url"):
                        response["graph_url"] = graph_data["url"]
                        response["graph_type"] = "image"
                    elif graph_data.get("type"):
                        response["graph"] = graph_data
            return response
        except ChatbotDatabaseError:
            return {"reply": DATABASE_ERROR_REPLY, "_status": 503}
        except Exception:
            return {
                "reply": "Sorry, I could not process that request safely.",
                "_status": 500,
            }

    def get_history(self, user_id, role, limit=40, session_id=None):
        user_id = self._normalize_user_id(user_id)
        role = normalize_role(role)
        try:
            limit = int(limit)
        except (TypeError, ValueError):
            limit = 40

        if not user_id or role is None:
            return {"reply": "Invalid request. Please provide user_id and role.", "_status": 400}

        try:
            if not validate_user(user_id, role):
                return {"reply": NO_PERMISSION_REPLY, "_status": 403}

            if session_id:
                row_limit = max(1, (limit + 1) // 2)
                rows = get_session_history(user_id, role, session_id, row_limit)
                return {"messages": self._format_turn_rows(rows)}

            rows = get_chat_history(user_id, role, limit)
            return {
                "messages": [
                    {
                        "id": row.get("id"),
                        "message_id": row.get("message_id"),
                        "session_id": row.get("session_id"),
                        "role": row.get("message_role"),
                        "text": row.get("content"),
                        "intent": row.get("intent"),
                        "confidence": float(row.get("confidence_score") or 0),
                        "created_at": row.get("created_at").isoformat() if hasattr(row.get("created_at"), "isoformat") else row.get("created_at"),
                    }
                    for row in rows
                ]
            }
        except ChatbotDatabaseError:
            return {"reply": DATABASE_ERROR_REPLY, "_status": 503}

    def get_sessions(self, user_id, role, limit=20):
        user_id = self._normalize_user_id(user_id)
        role = normalize_role(role)
        try:
            limit = int(limit)
        except (TypeError, ValueError):
            limit = 20

        if not user_id or role is None:
            return {"reply": "Invalid request. Please provide user_id and role.", "_status": 400}

        try:
            if not validate_user(user_id, role):
                return {"reply": NO_PERMISSION_REPLY, "_status": 403}

            rows = get_user_sessions(user_id, role, limit)
            return {
                "sessions": [
                    {
                        "id": row.get("id"),
                        "started_at": self._date_to_json(row.get("started_at")),
                        "last_message_at": self._date_to_json(row.get("last_message_at") or row.get("started_at")),
                        "last_intent": row.get("last_intent"),
                        "summary": row.get("summary"),
                        "preview": row.get("preview"),
                        "message_count": int(row.get("message_count") or 0),
                    }
                    for row in rows
                ]
            }
        except ChatbotDatabaseError:
            return {"reply": DATABASE_ERROR_REPLY, "_status": 503}

    def delete_session(self, user_id, role, session_id):
        user_id = self._normalize_user_id(user_id)
        role = normalize_role(role)

        if not user_id or role is None or not session_id:
            return {"success": False, "message": "Invalid request. Please provide user_id, role, and session_id.", "_status": 400}

        try:
            if not validate_user(user_id, role):
                return {"success": False, "message": NO_PERMISSION_REPLY, "_status": 403}

            deleted = delete_chat_session(user_id, role, session_id)
            if not deleted:
                return {"success": False, "message": "Chat session was not found.", "_status": 404}
            return {"success": True}
        except ChatbotDatabaseError:
            return {"success": False, "message": DATABASE_ERROR_REPLY, "_status": 503}

    def clear_history(self, user_id, role):
        user_id = self._normalize_user_id(user_id)
        role = normalize_role(role)

        if not user_id or role is None:
            return {"reply": "Invalid request. Please provide user_id and role.", "_status": 400}

        try:
            if not validate_user(user_id, role):
                return {"reply": NO_PERMISSION_REPLY, "_status": 403}

            clear_chat_history(user_id, role)
            return {"success": True}
        except ChatbotDatabaseError:
            return {"reply": DATABASE_ERROR_REPLY, "_status": 503}

    def save_feedback(self, message_id, user_id, rating, feedback_text=None, corrected_intent=None):
        user_id = self._normalize_user_id(user_id)
        if not user_id:
            return {"success": False, "message": "Invalid user_id.", "_status": 400}

        try:
            saved = persist_feedback(message_id, user_id, rating, feedback_text, corrected_intent)
            if not saved:
                return {"success": False, "message": "Feedback target was not found.", "_status": 404}
            return {"success": True, "message": "Feedback saved for review."}
        except ValueError as exc:
            return {"success": False, "message": str(exc), "_status": 422}
        except ChatbotDatabaseError:
            return {"success": False, "message": DATABASE_ERROR_REPLY, "_status": 503}

    @staticmethod
    def _suggestions(user_id, role, intent):
        suggestions = suggested_followups(role, intent)
        for suggestion in get_suggested_followups(user_id, role, intent):
            if suggestion not in suggestions:
                suggestions.append(suggestion)
        return suggestions[:3]

    def _dispatch(self, user_id, role, message, intent, context=None, session_state=None, user=None):
        if intent.intent == "small_talk_greeting":
            return self._format_greeting(user_id, role, message, user)

        if intent.intent == "identity_recall":
            return self._format_identity_recall(user_id, role, user)

        if intent.intent == "web_search":
            return web_lookup(message)

        if intent.intent == "summarize":
            return summarize_context(context or [])

        if intent.intent == "schedule_today":
            return self._format_schedule(
                get_user_schedule_today(user_id, role),
                "today",
            )

        if intent.intent == "schedule_tomorrow":
            return self._format_schedule(
                get_user_schedule_tomorrow(user_id, role),
                "tomorrow",
            )

        if intent.intent == "schedule_week":
            return self._format_schedule(
                get_user_schedule_week(user_id, role),
                "this week",
            )

        if intent.intent in {"next_class", "schedule_next"}:
            row = get_user_schedule_next(user_id, role)
            return self._format_next_schedule(row)

        if intent.intent in {"subjects", "enrolled_subjects"}:
            if role != "student":
                return "This subject list inquiry is available for student accounts only."
            return self._format_subjects(get_student_subjects(user_id))

        if intent.intent == "student_grade_lookup":
            if role == "student":
                return "Students can only ask about their own grades. Ask: Show my grades."
            return self._format_authorized_student_grade_lookup(user_id, role, message, context or [], session_state or {})

        if intent.intent in {"current_grade", "subject_grade"}:
            if role != "student":
                return (
                    "Grade inquiries for individual records are available only to the "
                    "student who owns the record. Faculty can ask for students needing attention."
                )
            grades = get_student_grades(user_id, intent.subject_hint)
            return self._format_grades(grades, message, intent.subject_hint)

        if intent.intent == "report_graph":
            # NEW: Use chart_generator for actual PNG graph generation
            entities = extract_entities(message, intent.intent, context or [], session_state or {})
            
            if role == "student":
                chart_result = generate_chart(user_id, role, entities, intent.intent)
                if isinstance(chart_result, dict) and chart_result.get("error"):
                    return chart_result["error"]
                if isinstance(chart_result, dict) and chart_result.get("graph_url"):
                    return {
                        "reply": chart_result.get("summary", "Here is your performance graph."),
                        "graph": {
                            "type": "image",
                            "url": chart_result["graph_url"],
                            "path": chart_result.get("graph_path")
                        }
                    }
            else:
                student_name = entities.get("student_name")
                subject_hint = entities.get("subject_hint") or intent.subject_hint
                
                if student_name:
                    chart_result = generate_chart(user_id, role, entities, intent.intent)
                    if isinstance(chart_result, dict) and chart_result.get("error"):
                        return chart_result["error"]
                    if isinstance(chart_result, dict) and chart_result.get("graph_url"):
                        return {
                            "reply": chart_result.get("summary", f"Here is the performance graph for {student_name}."),
                            "graph": {
                                "type": "image",
                                "url": chart_result["graph_url"],
                                "path": chart_result.get("graph_path")
                            }
                        }
                else:
                    chart_result = generate_chart(user_id, role, entities, intent.intent)
                    if isinstance(chart_result, dict) and chart_result.get("error"):
                        return chart_result["error"]
                    if isinstance(chart_result, dict) and chart_result.get("graph_url"):
                        return {
                            "reply": chart_result.get("summary", "Here is the class performance graph."),
                            "graph": {
                                "type": "image",
                                "url": chart_result["graph_url"],
                                "path": chart_result.get("graph_path")
                            }
                        }
        
        # Handle new graph intents
        if intent.intent in {"student_graph", "student_grade_graph", "student_attendance_graph", 
                            "student_risk_graph", "class_performance_graph", "class_attendance_graph",
                            "class_risk_graph", "high_risk_chart"}:
            entities = extract_entities(message, intent.intent, context or [], session_state or {})
            chart_result = generate_chart(user_id, role, entities, intent.intent)
            
            if isinstance(chart_result, dict) and chart_result.get("error"):
                error_msg = chart_result["error"]
                needs_clarification = chart_result.get("needs_clarification", False)
                clarification_options = chart_result.get("clarification_options", [])
                
                if needs_clarification:
                    return {
                        "reply": error_msg,
                        "needs_clarification": True,
                        "suggestions": clarification_options[:3] if clarification_options else [
                            "Specify subject code",
                            "Show all subjects",
                            "List students"
                        ]
                    }
                return error_msg
            
            if isinstance(chart_result, dict) and chart_result.get("graph_url"):
                return {
                    "reply": chart_result.get("summary", "Here is your graph."),
                    "graph": {
                        "type": "image",
                        "url": chart_result["graph_url"],
                        "path": chart_result.get("graph_path")
                    }
                }

        if intent.intent in {"risk_status", "improvement_advice", "explain_risk"}:
            if role != "student":
                return "Please ask for students needing attention or a class performance summary."
            rows = get_student_risk_status(user_id)
            if intent.intent == "improvement_advice":
                return self._format_student_improvement_advice(rows)
            return self._format_student_risk(rows)

        if intent.intent in {"students_needing_attention", "consultation_candidates", "intervention_summary", "program_intervention_summary"}:
            if role == "student":
                return "Students can only ask about their own risk status."
            return self._format_students_needing_attention(
                get_students_needing_attention(user_id, role)
            )

        if intent.intent in {"high_risk_students", "high_risk_overview", "program_high_risk_students", "show_only_high_risk", "filter_previous_result"}:
            if role == "student":
                rows = [row for row in get_student_risk_status(user_id) if row.get("risk_level") == "High Risk"]
                return self._format_student_risk(rows) if rows else "No high-risk academic monitoring record was found for your account."
            return self._format_students_needing_attention(get_high_risk_students(user_id, role))

        if intent.intent in {"attendance_status", "poor_attendance_students", "attendance_overview", "program_attendance_concerns", "show_attendance_details"}:
            if role == "student":
                return self._format_student_attendance(get_student_risk_status(user_id))
            return self._format_attendance_concerns(get_attendance_concerns(user_id, role))

        if intent.intent in {"missing_activities", "missing_activity_students", "show_missing_activity_details"}:
            return self._format_missing_activities(
                get_missing_activities(user_id, role),
                role,
            )

        if intent.intent == "low_grade_students":
            if role == "student":
                return "Students can only ask about their own grade or risk status."
            return self._format_students_needing_attention(
                _filter_low_grade_students(get_students_needing_attention(user_id, role))
            )

        if intent.intent in {
            "class_summary",
            "subject_performance_summary",
            "college_summary",
            "program_summary",
            "program_risk_summary",
            "subject_risk_summary",
            "faculty_class_monitoring",
            "program_subject_concerns",
        }:
            if role == "student":
                return "Class performance summaries are available to faculty and authorized academic administrators."
            return self._format_class_summary(
                get_class_performance_summary(user_id, role),
                role,
                intent.intent,
            )

        if intent.intent == "year_level_summary":
            if role not in {"program_chair", "dean", "admin"}:
                return "Year-level summaries are available to authorized academic administrators."
            return self._format_grouped_risk_summary(get_students_needing_attention(user_id, role), "year_level", "year level")

        if intent.intent == "section_summary":
            if role not in {"program_chair", "dean", "admin"}:
                return "Section summaries are available to authorized academic administrators."
            return self._format_grouped_risk_summary(get_students_needing_attention(user_id, role), "section", "section")

        if intent.intent in {"explain_previous_result", "show_more_details", "explain_student_risk"}:
            return self._format_previous_result_explanation(user_id, role, message, context or [])

        if intent.intent == "web_search":
            return web_lookup(message)

        return fallback_reply(role)

    @staticmethod
    def _normalize_user_id(user_id):
        try:
            user_id = int(user_id)
        except (TypeError, ValueError):
            return None
        return user_id if user_id > 0 else None

    @staticmethod
    def _date_to_json(value):
        return value.isoformat() if hasattr(value, "isoformat") else value

    @classmethod
    def _format_turn_rows(cls, rows):
        messages = []
        for row in rows:
            created_at = cls._date_to_json(row.get("created_at"))
            if row.get("user_message"):
                messages.append({
                    "id": f"{row.get('id')}-user",
                    "message_id": row.get("id"),
                    "session_id": row.get("session_id"),
                    "role": "user",
                    "text": row.get("user_message"),
                    "intent": row.get("detected_intent"),
                    "confidence": float(row.get("confidence_score") or 0),
                    "created_at": created_at,
                })
            if row.get("bot_response"):
                messages.append({
                    "id": f"{row.get('id')}-assistant",
                    "message_id": row.get("id"),
                    "session_id": row.get("session_id"),
                    "role": "assistant",
                    "text": row.get("bot_response"),
                    "intent": row.get("detected_intent"),
                    "confidence": float(row.get("confidence_score") or 0),
                    "created_at": created_at,
                })
        return messages

    @staticmethod
    def _format_schedule(rows, label):
        if not rows:
            return f"No class schedule record was found for {label}."

        parts = []
        for row in rows[:8]:
            subject = _subject_label(row)
            schedule = row.get("schedule") or "no schedule time recorded"
            room = row.get("room") or "no room recorded"
            section = row.get("section")
            section_text = f", section {section}" if section else ""
            parts.append(f"{subject}{section_text} ({schedule}, {room})")

        prefix = f"For {label}, you have {len(rows)} class"
        prefix += "" if len(rows) == 1 else "es"
        reply = prefix + ": " + "; ".join(parts)
        if len(rows) > 8:
            reply += f"; and {len(rows) - 8} more."
        else:
            reply += "."
        return reply

    @staticmethod
    def _format_next_schedule(row):
        if not row:
            return "No upcoming class schedule record was found."

        subject = _subject_label(row)
        schedule = row.get("schedule") or "no schedule time recorded"
        room = row.get("room") or "no room recorded"
        when = row.get("next_date_label") or "upcoming"
        return f"Your next class is {subject} {when} ({schedule}, {room})."

    @staticmethod
    def _format_subjects(rows):
        if not rows:
            return "No enrolled subject record was found."

        parts = []
        for row in rows[:10]:
            subject = _subject_label(row)
            section = row.get("section")
            semester = row.get("semester")
            academic_year = row.get("academic_year")
            details = ", ".join(
                value for value in [f"section {section}" if section else None, semester, academic_year] if value
            )
            parts.append(f"{subject} ({details})" if details else subject)

        reply = "Your enrolled subjects are: " + "; ".join(parts)
        if len(rows) > 10:
            reply += f"; and {len(rows) - 10} more."
        else:
            reply += "."
        return reply

    @staticmethod
    def _format_greeting(user_id, role, message, user=None):
        profile = extract_profile_memory(message)
        preferred_name = profile.get("preferred_name") or get_preferred_name(user_id, role)
        display_name = preferred_name or (user or {}).get("first_name") or "there"
        if profile.get("preferred_name"):
            return (
                f"Hi {display_name}. I’ll remember that name for our chats. "
                "Ask me about schedules, grades, attendance, missing work, or student risk records."
            )
        return (
            f"Hi {display_name}. I can help with schedules, grades, attendance, missing work, "
            "student risk, and class performance records."
        )

    @staticmethod
    def _format_identity_recall(user_id, role, user=None):
        preferred_name = get_preferred_name(user_id, role)
        if preferred_name:
            return f"You told me your name is {preferred_name}."

        full_name = (user or {}).get("full_name")
        if full_name:
            return f"You are signed in as {full_name}."
        return "I do not have a preferred name saved yet. Tell me your name with: my name is Zann."

    def _format_authorized_student_grade_lookup(self, user_id, role, message, context, session_state):
        entities = _extract_student_grade_entities(message, context, session_state)
        student_name = entities.get("student_name")
        subject_hint = entities.get("subject_hint")

        if not student_name:
            return {
                "reply": "Which student should I check?",
                "needs_clarification": True,
                "suggestions": ["Grade of student name", "Show students needing attention"],
            }

        rows = get_authorized_student_grade_records(user_id, role, student_name, subject_hint)
        if not rows and subject_hint:
            candidates = get_authorized_student_grade_records(user_id, role, student_name, None)
            if candidates:
                student = _student_name(candidates[0])
                subjects = _subject_suggestions(candidates)
                return {
                    "reply": (
                        f"I found {student}, but no handled class matched \"{subject_hint}\". "
                        f"Available subject options: {', '.join(subjects)}."
                    ),
                    "needs_clarification": True,
                    "suggestions": subjects[:3],
                }

        if not rows:
            return (
                f"No grade record was found for \"{student_name}\" in your authorized scope. "
                "Check the spelling or ask for students needing attention."
            )

        student_groups = defaultdict(list)
        for row in rows:
            student_groups[int(row.get("student_user_id") or 0)].append(row)

        if len(student_groups) > 1:
            options = []
            for group_rows in list(student_groups.values())[:5]:
                row = group_rows[0]
                context_text = _student_context(row)
                options.append(f"{_student_name(row)}{context_text}")
            return {
                "reply": "I found multiple matching students. Which one do you mean? " + "; ".join(options) + ".",
                "needs_clarification": True,
                "suggestions": [_student_name(group_rows[0]) for group_rows in list(student_groups.values())[:3]],
            }

        if not subject_hint and len(_unique_subject_keys(rows)) > 1:
            student = _student_name(rows[0])
            subjects = _subject_suggestions(rows)
            return {
                "reply": (
                    f"I found {len(rows)} class records for {student}. "
                    f"Which subject do you want? Options: {', '.join(subjects)}."
                ),
                "needs_clarification": True,
                "suggestions": subjects[:3],
            }

        return self._format_authorized_grade_rows(rows)

    @staticmethod
    def _format_authorized_grade_rows(rows):
        lines = []
        for row in rows[:6]:
            student = _student_name(row)
            subject = _subject_label(row)
            section = row.get("section")
            section_text = f", section {section}" if section else ""
            status = (row.get("grade_status") or "draft").replace("_", " ")

            if row.get("weighted_score") is None:
                lines.append(
                    f"{student}'s record for {subject}{section_text}: no computed grade is recorded yet "
                    f"(class status: {status})."
                )
                continue

            parts = [
                f"current weighted score {_format_percent(row.get('weighted_score'))}",
            ]
            if row.get("midterm_grade") is not None:
                parts.append(f"midterm {_format_percent(row.get('midterm_grade'))}")
            if row.get("final_term_score") is not None:
                parts.append(f"final term {_format_percent(row.get('final_term_score'))}")
            if row.get("final_grade") is not None:
                parts.append(f"final grade {float(row.get('final_grade')):.2f}")
            if row.get("remarks"):
                parts.append(f"remarks {row.get('remarks')}")
            parts.append(f"class status {status}")
            lines.append(f"{student}'s record for {subject}{section_text}: " + ", ".join(parts) + ".")

        reply = " ".join(lines)
        if len(rows) > 6:
            reply += f" {len(rows) - 6} more matching class record(s) were found."
        return reply

    @staticmethod
    def _format_grades(rows, message, subject_hint):
        if not rows:
            if subject_hint:
                return f"No grade record was found for {subject_hint}."
            return "No grade record was found."

        wants_lowest = "lowest" in message.lower()
        visible = [row for row in rows if row.get("weighted_score") is not None]
        if wants_lowest:
            if not visible:
                return "No released or faculty-verified grade record is available for comparison."
            lowest = min(visible, key=lambda row: float(row["weighted_score"]))
            return _grade_line(lowest, prefix="Your lowest available subject is ")

        lines = [_grade_line(row) for row in rows[:8]]
        reply = " ".join(lines)
        if len(rows) > 8:
            reply += f" {len(rows) - 8} more grade records were found."
        return reply

    @staticmethod
    def _format_student_performance_graph(rows, subject_hint, student_name=None):
        if not rows:
            if student_name:
                return f"No grade record was found for {student_name}."
            return "No grade record was found."
        
        visible = [row for row in rows if row.get("weighted_score") is not None]
        if not visible:
            return "No computed grades are available to generate a graph."
        
        data = []
        for row in visible[:10]:
            subject = row.get("subject_code") or "Unknown"
            score = float(row.get("weighted_score"))
            data.append({"name": subject, "score": round(score, 2)})
            
        reply_msg = f"Here is the performance graph for {student_name}." if student_name else "Here is the performance graph for your enrolled subjects."
        return {
            "reply": reply_msg,
            "graph": {
                "type": "bar",
                "title": f"Subject Grades ({student_name})" if student_name else "Subject Grades",
                "data": data,
                "dataKey": "score"
            }
        }

    @staticmethod
    def _format_class_performance_graph(rows, role):
        if not rows:
            return "No class summary records found to generate a graph."
        
        data = []
        for row in rows[:10]:
            subject = row.get("subject_code") or "Unknown"
            score = float(row.get("average_weighted_score") or 0)
            if score > 0:
                data.append({"name": subject, "average_score": round(score, 2)})
                
        if not data:
            return "No sufficient score data to generate a graph."
            
        return {
            "reply": f"Here is the average performance graph across classes.",
            "graph": {
                "type": "bar",
                "title": "Average Class Performance",
                "data": data,
                "dataKey": "average_score"
            }
        }

    @staticmethod
    def _format_student_risk(rows):
        if not rows:
            return no_matching_record()

        ranked = sorted(rows, key=lambda row: _risk_rank(row.get("risk_level")))
        highest = ranked[0]
        subject = _subject_label(highest)
        reason = (highest.get("reason") or "available records meet the current monitoring rules").strip().rstrip(".")
        reply = (
            f"Your highest current risk level is {highest.get('risk_level')} in {subject}. "
            f"Main reason: {reason}. "
            f"Suggested action: {highest.get('suggested_action')}"
        )

        other_risks = [row for row in ranked[1:] if row.get("risk_level") in {"High Risk", "Medium Risk"}]
        if other_risks:
            subjects = ", ".join(_subject_label(row) for row in other_risks[:3])
            reply += f" Other subjects needing attention: {subjects}."
        return reply

    @staticmethod
    def _format_student_improvement_advice(rows):
        if not rows:
            return no_matching_record()

        ranked = sorted(rows, key=lambda row: (
            _risk_rank(row.get("risk_level")),
            _none_high(row.get("current_grade")),
            -int(row.get("missing_activities") or 0),
        ))
        focus = ranked[0]
        subject = _subject_label(focus)
        reasons = []
        if focus.get("current_grade") is not None and float(focus["current_grade"]) < 80:
            reasons.append(f"current grade is {_format_percent(focus.get('current_grade'))}")
        if focus.get("attendance_percentage") is not None and float(focus["attendance_percentage"]) < 85:
            reasons.append(f"attendance is {_format_percent(focus.get('attendance_percentage'))}")
        if focus.get("missing_activities"):
            reasons.append(f"{int(focus.get('missing_activities') or 0)} missing activity record(s)")
        reason_text = ", ".join(reasons) if reasons else "it has the highest monitoring priority in your records"
        return (
            f"Focus first on {subject}. Main indicators: {reason_text}. "
            f"Suggested action: {focus.get('suggested_action')}"
        )

    @staticmethod
    def _format_students_needing_attention(rows):
        if not rows:
            return no_matching_record()

        parts = []
        for row in rows[:10]:
            student = row.get("student_name") or "Unnamed student"
            subject = _subject_label(row)
            context = _student_context(row)
            risk = row.get("risk_level")
            reason = (row.get("reason") or "").rstrip(".")
            parts.append(f"{student}{context} in {subject} is {risk}: {reason}")

        reply = "The following students may need attention: " + "; ".join(parts)
        if len(rows) > 10:
            reply += f"; and {len(rows) - 10} more."
        else:
            reply += "."
        return reply

    @staticmethod
    def _format_attendance_concerns(rows):
        if not rows:
            return "No poor-attendance record was found in your authorized scope."

        parts = []
        for row in rows[:10]:
            student = row.get("student_name") or "Unnamed student"
            attendance = _format_percent(row.get("attendance_percentage"))
            parts.append(f"{student}{_student_context(row)} in {_subject_label(row)} has attendance at {attendance}")
        reply = "Attendance concerns found: " + "; ".join(parts)
        if len(rows) > 10:
            reply += f"; and {len(rows) - 10} more."
        else:
            reply += "."
        return reply

    @staticmethod
    def _format_student_attendance(rows):
        if not rows:
            return "No attendance monitoring record was found for your account."

        parts = []
        for row in rows[:5]:
            attendance = _format_percent(row.get("attendance_percentage"))
            parts.append(f"{_subject_label(row)}: attendance is {attendance}")
        return "Your attendance summary: " + "; ".join(parts) + "."

    def _format_previous_result_explanation(self, user_id, role, message, context):
        previous_intents = [
            row.get("detected_intent")
            for row in reversed(context)
            if row.get("detected_intent")
        ]
        previous_intent = previous_intents[0] if previous_intents else None

        if role == "student":
            return self._format_student_risk(get_student_risk_status(user_id))

        if previous_intent in {
            "students_needing_attention",
            "high_risk_students",
            "high_risk_overview",
            "program_high_risk_students",
            "poor_attendance_students",
            "attendance_overview",
            "program_attendance_concerns",
            "missing_activities",
            "missing_activity_students",
            "class_summary",
            "college_summary",
            "program_summary",
            "intervention_summary",
            "program_intervention_summary",
            "explain_previous_result",
        }:
            rows = get_students_needing_attention(user_id, role)
            filtered = _filter_rows_by_message_name(rows, message)
            rows = filtered or rows
            if not rows:
                return "No matching risk record was found from the previous context."
            parts = []
            for row in rows[:5]:
                reason = (row.get("reason") or "the record meets the current risk rules").strip().rstrip(".")
                if reason.startswith("The student"):
                    reason = "the student" + reason[len("The student"):]
                parts.append(f"{row.get('student_name')} is included because {reason}")
            return " ".join(parts)

        return "I can explain a previous risk or class-summary result after you ask for one."

    @staticmethod
    def _format_missing_activities(rows, role):
        if not rows:
            return "No missing activity record was found."

        if role == "student":
            grouped = defaultdict(list)
            for row in rows:
                grouped[_subject_label(row)].append(row.get("component_name") or "Unnamed activity")

            parts = []
            for subject, activities in list(grouped.items())[:8]:
                parts.append(f"{subject}: {', '.join(activities[:5])}")
            return "Your missing activities are: " + "; ".join(parts) + "."

        grouped = defaultdict(lambda: {"count": 0, "subjects": set()})
        for row in rows:
            key = row.get("student_name") or "Unnamed student"
            grouped[key]["count"] += 1
            grouped[key]["subjects"].add(_subject_label(row))

        parts = []
        for student, data in list(grouped.items())[:10]:
            subjects = ", ".join(sorted(data["subjects"])[:3])
            parts.append(f"{student} has {data['count']} missing activity record(s) in {subjects}")
        return "Missing activity records found: " + "; ".join(parts) + "."

    @staticmethod
    def _format_class_summary(rows, role, intent="class_summary"):
        if not rows:
            return no_matching_record()

        scope = {
            "faculty": "your handled classes",
            "dean": "your authorized department or college scope",
            "program_chair": "your authorized program scope",
            "admin": "the system records",
        }.get(role, "your authorized scope")

        total_students = sum(int(row.get("student_count") or 0) for row in rows)
        total_low = sum(int(row.get("low_grade_count") or 0) for row in rows)
        total_attendance = sum(int(row.get("poor_attendance_count") or 0) for row in rows)
        total_missing = sum(int(row.get("missing_activity_student_count") or 0) for row in rows)
        risk_classes = [
            row
            for row in rows
            if int(row.get("low_grade_count") or 0) > 0
            or int(row.get("poor_attendance_count") or 0) > 0
            or int(row.get("missing_activity_student_count") or 0) > 0
        ]

        highlights = []
        for row in risk_classes[:5]:
            subject = _subject_label(row)
            section = row.get("section")
            subject_context = f"{subject} section {section}" if section else subject
            average = _format_percent(row.get("average_weighted_score"))
            low_count = int(row.get("low_grade_count") or 0)
            missing_count = int(row.get("missing_activity_student_count") or 0)
            attendance_count = int(row.get("poor_attendance_count") or 0)
            highlights.append(
                f"{subject_context} has average {average}, {low_count} low-grade student(s), "
                f"{attendance_count} poor-attendance student(s), and {missing_count} student(s) with missing activities"
            )

        summary_label = {
            "college_summary": "College summary",
            "program_summary": "Program summary",
            "program_risk_summary": "Program risk summary",
            "subject_risk_summary": "Subject concern summary",
            "faculty_class_monitoring": "Faculty/class monitoring summary",
            "program_subject_concerns": "Program subject concern summary",
        }.get(intent, "Class performance summary")

        reply = (
            f"{summary_label}: based on {scope}, {len(rows)} class record(s) and "
            f"{total_students} enrollment(s) were found. Monitoring indicators: "
            f"{total_low} low-grade case(s), {total_attendance} attendance concern(s), "
            f"and {total_missing} missing-activity concern(s)."
        )
        if highlights:
            reply += " Classes needing attention: " + "; ".join(highlights) + "."
        else:
            reply += " No major class-level risk indicators were found in the available records."
        reply += " Suggested action: prioritize consultation and follow-up for classes with repeated low-grade, attendance, or missing-activity indicators."
        return reply

    @staticmethod
    def _format_grouped_risk_summary(rows, group_key, label):
        if not rows:
            return no_matching_record()

        grouped = defaultdict(lambda: {"count": 0, "high": 0, "medium": 0, "subjects": set()})
        for row in rows:
            key = row.get(group_key) or "Unassigned"
            grouped[key]["count"] += 1
            if row.get("risk_level") == "High Risk":
                grouped[key]["high"] += 1
            elif row.get("risk_level") == "Medium Risk":
                grouped[key]["medium"] += 1
            grouped[key]["subjects"].add(_subject_label(row))

        parts = []
        for key, data in sorted(grouped.items(), key=lambda item: (-item[1]["high"], -item[1]["count"], str(item[0])))[:8]:
            subjects = ", ".join(sorted(data["subjects"])[:3])
            parts.append(
                f"{label.title()} {key}: {data['count']} student concern(s), "
                f"{data['high']} high-risk and {data['medium']} medium-risk, involving {subjects}"
            )
        return "Risk summary by " + label + ": " + "; ".join(parts) + "."


def _subject_label(row):
    code = row.get("subject_code")
    name = row.get("subject_name")
    if code and name:
        return f"{code} - {name}"
    return name or code or "Unnamed subject"


def _student_name(row):
    return row.get("student_name") or "Unnamed student"


def _unique_subject_keys(rows):
    keys = []
    for row in rows:
        key = (row.get("class_id"), row.get("subject_code"), row.get("section"))
        if key not in keys:
            keys.append(key)
    return keys


def _subject_suggestions(rows):
    suggestions = []
    for row in rows:
        label = row.get("subject_code") or row.get("subject_name") or "Unnamed subject"
        section = row.get("section")
        if section:
            label = f"{label} {section}"
        if label not in suggestions:
            suggestions.append(label)
    return suggestions[:8]


def _extract_student_grade_entities(message, context, session_state):
    subject_hint = _extract_lookup_subject_hint(message, session_state)
    student_name = _extract_lookup_student_name(message)

    if not student_name:
        for row in reversed(context or []):
            if row.get("detected_intent") != "student_grade_lookup":
                continue
            student_name = _extract_lookup_student_name(row.get("user_message") or "")
            if student_name:
                break

    return {
        "student_name": student_name,
        "subject_hint": subject_hint,
    }


def _extract_lookup_student_name(message):
    original = (message or "").strip()
    if not original:
        return None

    patterns = [
        r"\b(?:grade|grades|score|mark|standing)\s+(?:of|for|ni|kay)\s+(.+?)(?:\s+(?:in|under|from|subject)\s+|[?.!,]|$)",
        r"\b(?:show|check|get|display|view)\s+(.+?)['’]?\s+(?:grade|grades|score|mark|standing)(?:\s+(?:in|under|from|subject)\s+|[?.!,]|$)",
        r"\b(?:what|how)\s+(?:is|are)\s+(.+?)['’]?\s+(?:grade|grades|score|mark|standing)(?:\s+(?:in|under|from|subject)\s+|[?.!,]|$)",
        r"\bhow\s+(?:is|s)\s+(.+?)\s+(?:doing|performing)(?:\s+(?:in|under|from|subject)\s+|[?.!,]|$)",
    ]
    for pattern in patterns:
        match = re.search(pattern, original, flags=re.IGNORECASE)
        if match:
            name = _clean_lookup_name(match.group(1))
            if name:
                return name
    return None


def _extract_lookup_subject_hint(message, session_state=None):
    original = (message or "").strip()
    if not original:
        return None

    code_match = re.search(r"\b([A-Z]{2,6}\s*\d{2,4}[A-Z]?)\b", original, flags=re.IGNORECASE)
    if code_match:
        return " ".join(code_match.group(1).upper().split())

    patterns = [
        r"\b(?:in|under|subject)\s+([a-zA-Z0-9\s&.-]{2,80})(?:[?.!,]|$)",
    ]
    for pattern in patterns:
        match = re.search(pattern, original, flags=re.IGNORECASE)
        if match:
            value = _clean_subject_lookup(match.group(1))
            if value:
                return value

    pending = (session_state or {}).get("pending_clarification")
    if pending == "student_grade_lookup" and not re.search(r"\b(grade|grades|score|mark|standing)\b", original, flags=re.IGNORECASE):
        return _clean_subject_lookup(original)
    return None


def _clean_lookup_name(value):
    value = re.sub(r"\b(the|student|current|final|grade|grades|score|mark|standing|please|pls)\b", " ", value or "", flags=re.IGNORECASE)
    value = re.sub(r"[^a-zA-Z0-9\s.'-]", " ", value)
    value = " ".join(value.split()).strip(" .'-")
    if not value or len(value) < 2:
        return None
    if value.lower() in {"my", "me", "mine", "student"}:
        return None
    return value[:80]


def _clean_subject_lookup(value):
    value = re.sub(r"\b(please|pls|subject|class|grade|grades|score|mark|standing)\b", " ", value or "", flags=re.IGNORECASE)
    value = re.sub(r"[^a-zA-Z0-9\s&.-]", " ", value)
    value = " ".join(value.split()).strip(" .-&")
    return value[:80] if len(value) >= 2 else None


def _student_context(row):
    details = []
    if row.get("program"):
        details.append(str(row["program"]))
    if row.get("year_level"):
        details.append(f"Year {row['year_level']}")
    if row.get("section"):
        details.append(f"section {row['section']}")
    return f" ({', '.join(details)})" if details else ""


def _filter_rows_by_message_name(rows, message):
    text = (message or "").lower()
    matches = []
    for row in rows:
        name = (row.get("student_name") or "").lower()
        if not name:
            continue
        name_parts = [part for part in name.split() if len(part) >= 3]
        if any(part in text for part in name_parts):
            matches.append(row)
    return matches


def _filter_low_grade_students(rows):
    return [
        row
        for row in rows
        if (row.get("current_grade") is not None and float(row.get("current_grade")) < 75)
        or (row.get("final_grade") is not None and str(row.get("remarks") or "").lower() == "failed")
        or row.get("risk_level") == "High Risk"
    ]


def _grade_line(row, prefix=""):
    subject = _subject_label(row)
    if not row.get("can_view_grade"):
        status = row.get("grade_status") or "not released"
        return f"{prefix}{subject}: the current grade is not available yet because the class status is {status}."

    if row.get("weighted_score") is None:
        return f"{prefix}{subject}: no computed grade is recorded yet."

    weighted = _format_percent(row.get("weighted_score"))
    final_grade = row.get("final_grade")
    remarks = row.get("remarks") or "No remarks"
    if final_grade is None and str(remarks).lower() == "failed":
        remarks = "Subject outcome pending"
    final_text = f", final grade {float(final_grade):.2f}" if final_grade is not None else ""
    return f"{prefix}{subject}: current weighted score {weighted}{final_text}, remarks {remarks}."


def _format_percent(value):
    if value is None:
        return "not available"
    return f"{float(value):.2f}%"


def _risk_rank(level):
    return {"High Risk": 0, "Medium Risk": 1, "Low Risk": 2, "Unknown": 3}.get(level, 4)


def _none_high(value):
    return float(value) if value is not None else 999.0
