# C.O.E.D.I.G.O. Academic Assistant

This folder adds only the AI chatbot module. It does not rebuild or replace the existing frontend, backend, or database.

Version 1 uses intent detection, prepared database queries, role-scoped retrieval, and rule-based risk analysis. It does not require model training or paid AI tokens.

Chat history is stored in the existing database table `chatbot_messages`. The chatbot does not train a model from this data; it uses recent history only for continuity and leaves a clean path for future LLM context.

## Files

- `app.py` - Flask API server with `POST /chat`.
- `chatbot.py` - Main controller for validation, intent routing, role checks, and final replies.
- `intent_detector.py` - Simple keyword-based intent detection.
- `database_tools.py` - Safe MySQL database access using environment variables and prepared statements.
- `risk_analyzer.py` - Rule-based academic risk analysis.
- `prompts.py` - Behavior rules for future LLM integration.
- `.env.example` - Environment variable template.
- `requirements.txt` - Python dependencies.

Optional manual migration:

```sql
SOURCE database/migration_chatbot_history.sql;
```

The chatbot also creates this table automatically when history is first used.

## Install

From the project root:

```powershell
cd ai_chatbot
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Edit `.env` and set the database credentials for the existing COEDIGO database:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=coedigo_db
DB_PORT=3306
CHATBOT_TIMEZONE=Asia/Manila
```

## Run

```powershell
python app.py
```

Default endpoint:

```text
http://127.0.0.1:5000/chat
```

Health check:

```powershell
curl.exe http://127.0.0.1:5000/health
```

## API

`POST /chat`

Request:

```json
{
  "user_id": 12,
  "role": "student",
  "message": "What is my class schedule today?"
}
```

Response:

```json
{
  "reply": "For today, you have 1 class: CE101 - Engineering Drawing, section A (MWF 08:00-09:00 AM, ENG-101)."
}
```

The `user_id` and `role` must come from the authenticated backend session, not directly from untrusted frontend input.

## Curl Tests

Student schedule:

```powershell
curl.exe -X POST http://127.0.0.1:5000/chat -H "Content-Type: application/json" -d "{\"user_id\":12,\"role\":\"student\",\"message\":\"What is my class schedule today?\"}"
```

Student grades:

```powershell
curl.exe -X POST http://127.0.0.1:5000/chat -H "Content-Type: application/json" -d "{\"user_id\":12,\"role\":\"student\",\"message\":\"Show my grades this semester.\"}"
```

Student risk status:

```powershell
curl.exe -X POST http://127.0.0.1:5000/chat -H "Content-Type: application/json" -d "{\"user_id\":12,\"role\":\"student\",\"message\":\"Am I at risk?\"}"
```

Faculty students needing attention:

```powershell
curl.exe -X POST http://127.0.0.1:5000/chat -H "Content-Type: application/json" -d "{\"user_id\":5,\"role\":\"faculty\",\"message\":\"Who are the students that need attention?\"}"
```

Program chair or dean summary:

```powershell
curl.exe -X POST http://127.0.0.1:5000/chat -H "Content-Type: application/json" -d "{\"user_id\":3,\"role\":\"program_chair\",\"message\":\"Show overall student performance.\"}"
```

## Existing PHP Backend Integration

Call the chatbot from the existing backend after authentication. Use the logged-in user ID and role from the backend session or token.

```php
function askAcademicAssistant($loggedInUserId, $loggedInUserRole, $userMessage) {
    $payload = json_encode([
        'user_id' => (int) $loggedInUserId,
        'role' => $loggedInUserRole,
        'message' => $userMessage,
    ]);

    $ch = curl_init('http://127.0.0.1:5000/chat');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_TIMEOUT => 15,
    ]);

    $rawResponse = curl_exec($ch);
    $error = curl_error($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($rawResponse === false || $status >= 500) {
        return ['reply' => 'The academic assistant is temporarily unavailable.'];
    }

    $decoded = json_decode($rawResponse, true);
    return is_array($decoded) ? $decoded : ['reply' => 'Invalid assistant response.'];
}
```

The existing frontend can display the returned `reply` string in a future chat UI.

## Frontend Test Integration

The dashboard now includes a right-side AI assistant rail. When opened, it sends chat requests to the chatbot API using the logged-in user's `id` and `role`.

From the `frontend` folder, the full local stack can be started with:

```powershell
npm run dev:fullstack
```

This starts XAMPP services, the PHP backend, the AI chatbot API, and Vite.

For local Vite testing, `frontend/vite.config.js` proxies:

```text
/ai-chatbot -> http://127.0.0.1:5000
```

Start the chatbot API:

```powershell
cd ai_chatbot
.\.venv\Scripts\Activate.ps1
python app.py
```

Start the frontend:

```powershell
cd frontend
npm run dev
```

Then open the dashboard and click the AI icon on the right side. The frontend sends requests to:

```text
/ai-chatbot/chat
```

To call Flask directly instead of using the Vite proxy, set this in `frontend/.env`:

```env
VITE_AI_CHATBOT_BASE_URL=http://127.0.0.1:5000
```

The Flask API allows local frontend origins through `CHATBOT_CORS_ORIGINS`.

## Supported Intents

- `schedule_today`
- `schedule_tomorrow`
- `schedule_week`
- `schedule_next`
- `subjects`
- `current_grade`
- `subject_grade`
- `risk_status`
- `students_needing_attention`
- `missing_activities`
- `class_summary`
- `unknown`

## Role Rules

- Student: own schedules, subjects, visible grades, attendance-derived risk status, and own missing activities only.
- Faculty: students and classes under `class_records.faculty_id`.
- Program Chair: students and subjects matching the chair's `program`.
- Dean: students and subjects matching the dean's `department`; if no department is stored, the dean role is treated as college-wide.
- Admin: system-wide academic monitoring records.

Unauthorized or mismatched role requests return:

```json
{
  "reply": "Sorry, you do not have permission to view that information."
}
```

## Risk Rules

High Risk if any available signal matches:

- `current_grade < 75`
- `attendance_percentage < 75`
- `missing_activities >= 4`
- `exam_avg < 65`

Medium Risk if any available signal matches:

- `current_grade` from `75` to `79`
- `attendance_percentage` from `75` to `84`
- `missing_activities` from `2` to `3`
- `exam_avg` from `65` to `74`

Low Risk is returned when available signals do not meet the risk thresholds. Unknown is returned when there is not enough grade, attendance, or activity data.

## Example Questions

Student:

- "What is my class schedule today?"
- "What is my next class?"
- "What are my subjects this semester?"
- "What is my grade in Calculus?"
- "Which subject is my lowest?"
- "Am I at risk?"
- "Do I have missing activities?"

Faculty:

- "Who are the students that need attention?"
- "Which students are high risk?"
- "Which students have poor attendance?"
- "Summarize my class performance."

Dean or Program Chair:

- "Which students are academically at risk?"
- "Show overall student performance."
- "Which subjects have many struggling students?"

## Future LLM Upgrade

The module is ready for a later LLM layer through `prompts.py` and `chatbot.py`. Keep database retrieval and authorization checks in `database_tools.py`; only pass retrieved, authorized records into any future local LLM or external AI API.
