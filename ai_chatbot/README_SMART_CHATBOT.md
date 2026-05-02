# C.O.E.D.I.G.O. Smart Academic Assistant Upgrade

This upgrade keeps the chatbot database-grounded and role-based while adding safe context, history, feedback, and personalization.

## Chat History

Chat turns are stored in `chatbot_messages` and grouped by `chatbot_sessions`.

The `/chat` endpoint accepts an optional `session_id`. If none is provided, the chatbot creates one:

```json
{
  "user_id": 5,
  "role": "faculty",
  "message": "Summarize my class performance",
  "session_id": "optional_existing_session_id"
}
```

Response:

```json
{
  "reply": "...",
  "intent": "class_summary",
  "confidence": 0.91,
  "session_id": "generated_or_existing_session_id",
  "message_id": 101,
  "suggested_questions": [
    "Show high-risk students",
    "Show students with missing activities"
  ]
}
```

Recent messages are used only for same-user, same-session follow-ups such as “show only high risk” or “what about attendance?”

## User Memory

Safe behavior memory is stored in `chatbot_user_memory`.

It stores behavior patterns only:

- frequent intents
- recent topics
- preferred response style
- safe profile preferences such as a preferred name
- short memory summary

It does not store private grades, attendance records, schedules, or student academic details. Those records are always retrieved from the database at request time.

Examples:

- User: `hi i am zann`
- Assistant: remembers `Zann` as the preferred name.
- User later: `who is me`
- Assistant: answers from saved same-user memory.

## Faculty Student Grade Lookup

Faculty and authorized academic roles can ask for a student grade by name. The assistant searches only inside the user's authorized database scope.

Example:

```json
{
  "user_id": 5,
  "role": "faculty",
  "message": "What is the grade of Gloryzann Aclao?"
}
```

If the student has multiple handled class records, the assistant asks which subject to use. A follow-up such as `CPE 316` continues the same lookup through session context.

Students cannot use this path to view another student's record.

## Optional Web Lookup

Explicit general web questions such as `search the web for machine learning` use an optional no-key web lookup path. Academic questions remain database-first and role-scoped. Set this environment variable to disable web lookup:

```text
CHATBOT_WEB_LOOKUP_ENABLED=0
```

## Feedback

Users can rate a chatbot answer:

```http
POST /chat/feedback
```

```json
{
  "message_id": 101,
  "user_id": 5,
  "rating": "not_helpful",
  "feedback_text": "I wanted high-risk students only.",
  "corrected_intent": "high_risk_students"
}
```

Response:

```json
{
  "success": true,
  "message": "Feedback saved for review."
}
```

Not-helpful feedback with a corrected intent is saved into `chatbot_training_examples` as unreviewed.

## No Blind Retraining

The chatbot does not automatically train from user messages or private academic records.

Safe improvement flow:

1. User asks a question.
2. Intent is detected.
3. Chatbot answers using authorized database records.
4. User gives feedback.
5. Bad examples are saved as unreviewed training examples.
6. Admin/developer reviews examples.
7. Only reviewed examples are used for manual retraining.
8. A new model version is evaluated.
9. Developer chooses whether to activate it.

## Manual Retraining

The manual pipeline is in `retraining_pipeline.py`.

Example:

```powershell
cd ai_chatbot
.\.venv\Scripts\Activate.ps1
python - <<'PY'
from retraining_pipeline import retrain_intent_model, save_model_version

result = retrain_intent_model()
print(result)

if result.get("trained"):
    print(save_model_version(result["model"]))
PY
```

Model files are saved under:

```text
ai_chatbot/models/
```

`active_model.json` defines the active model:

```json
{
  "active_model": "intent_model_v20260502103000.pkl",
  "updated_at": "2026-05-02T10:30:00Z"
}
```

## Role Privacy

The chatbot enforces the same academic boundaries:

- Student: own records only.
- Faculty: students/classes handled by that faculty user.
- Dean: assigned department or college scope.
- Program Chair: assigned program scope.
- Admin: system-level scope.

One user's chat history and memory are never used for another user.

## Database Tables

The chatbot automatically creates these tables if missing:

- `chatbot_sessions`
- `chatbot_messages`
- `chatbot_feedback`
- `chatbot_user_memory`
- `chatbot_training_examples`

Manual migration:

```sql
SOURCE database/migration_smart_chatbot.sql;
```

## Backend Integration

The existing backend should send authenticated values, not frontend-supplied identity:

```json
{
  "user_id": "logged_in_user_id",
  "role": "logged_in_user_role",
  "message": "user_message",
  "session_id": "optional_session_id"
}
```

The frontend may store `session_id` per active chat panel and send it with later messages.

## Safety Summary

The chatbot can assist with academic monitoring, but it does not make official academic decisions. Final decisions remain with authorized school personnel.
