# C.O.E.D.I.G.O. Chatbot Intelligence Upgrade

This upgrade keeps the chatbot local, role-based, and database-grounded. It does not retrain from raw user messages and it does not use paid AI APIs for normal chat requests.

## Intent Detection Flow

`intent_detector.py` now detects intent in this order:

1. Same-session follow-up handling from recent chat context.
2. Strong rule and phrase matching for obvious commands.
3. Local semantic matching from `semantic_matcher.py`.
4. Reviewed intent model fallback from `retraining_pipeline.py`, if an approved model exists.
5. Role-specific clarification or help response.

The semantic matcher normalizes wording and compares the user message against paraphrase examples for schedule, grades, risk, class summaries, high-risk students, attendance, missing activities, dean summaries, and program chair summaries.

## Context Awareness

`context_manager.py` stores and retrieves the same user's same-session messages. It also tracks:

- `last_intent`
- `last_result_type`
- `pending_clarification`
- session summary

This lets the chatbot understand short follow-ups such as:

- `today` after `class schedule`
- `why?` after a risk result
- `tell me more about it`
- `what specific attendance?`
- `show only high risk`

The chatbot uses context only inside the same user and session scope.

## Role Policy

`role_policy.py` defines which intents each role can use.

- Students can only retrieve their own schedule, grades, attendance, missing activities, and risk status.
- Faculty can retrieve only their handled classes and enrolled students.
- Deans can use broader college or department monitoring intents.
- Program chairs can use program-level monitoring intents.

The chatbot validates `user_id` and `role` against the `users` table before answering. If the role is not authorized for an intent, it returns:

`Sorry, you do not have permission to view that information.`

## Database-Grounded Answers

The chatbot never invents academic records. Every academic answer goes through `database_tools.py`, which uses prepared statements and role-scoped SQL filters.

If no scoped record exists, the chatbot returns:

`No matching record was found.`

## Clarification Behavior

Confidence handling:

- `>= 0.75`: execute the detected intent.
- `0.50 to 0.74`: ask a targeted clarification.
- `< 0.50`: show role-specific help text.

Examples:

```json
{
  "reply": "Do you want your schedule for today, tomorrow, or this week?",
  "intent": "schedule_clarification",
  "confidence": 0.64,
  "needs_clarification": true,
  "suggested_questions": ["Today", "Tomorrow", "This week"]
}
```

## Feedback Learning

Helpful/not helpful feedback is stored in `chatbot_feedback`.

When a user marks an answer as `not_helpful`, the message is also saved into `chatbot_training_examples` as an unreviewed example. It is not used for retraining until an admin or developer reviews it and sets `reviewed = 1` with a corrected intent.

Manual training flow:

1. User marks answer not helpful.
2. Example is saved for review.
3. Admin/developer corrects and reviews the intent.
4. `retraining_pipeline.py` trains from reviewed examples only.
5. A model version is saved under `ai_chatbot/models/`.
6. Deployment remains manual through `active_model.json`.

## API Response

`POST /chat` returns:

```json
{
  "reply": "Class performance summary: ...",
  "intent": "class_summary",
  "confidence": 0.9,
  "role": "faculty",
  "session_id": "current_session_id",
  "message_id": 101,
  "suggested_questions": [
    "Show high-risk students",
    "Show students with missing activities",
    "Show students with poor attendance"
  ]
}
```

## Files Added

- `semantic_matcher.py`: local paraphrase and semantic intent matching.
- `role_policy.py`: role-intent permissions and role-specific fallback text.
- `response_templates.py`: clarification and suggested follow-up templates.
- `README_CHATBOT_INTELLIGENCE.md`: this guide.

## Files Upgraded

- `intent_detector.py`: hybrid rules, context, semantic matching, confidence.
- `chatbot.py`: role policy, clarification responses, expanded intent routing.
- `context_manager.py`: session state and context tracking.
- `database_tools.py`: additive session columns for context state.
- `feedback_manager.py`: unreviewed training examples for all not-helpful feedback.
