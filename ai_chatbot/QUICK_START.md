# Quick Start Guide - Smart Academic Assistant

## Installation

### 1. Install Dependencies

```bash
cd ai_chatbot
pip install -r requirements.txt
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=coedigo_db
DB_PORT=3306

CHATBOT_TIMEZONE=Asia/Manila
CHATBOT_WEB_LOOKUP_ENABLED=1

# Optional: For enhanced web search
TAVILY_API_KEY=your_api_key_here
```

### 3. Create Static Directory

```bash
mkdir -p static/generated_charts
```

### 4. Run Tests

```bash
python test_smart_assistant.py
```

### 5. Start Server

```bash
python app.py
```

## Usage Examples

### Student Queries

```
"Show my grades"
"Graph my grades"
"Am I at risk?"
"Show my attendance"
"Do I have missing activities?"
"What is my schedule today?"
"Search the internet about academic probation"
```

### Faculty Queries

```
"Show high-risk students"
"Create a graph of John Reyes"
"Show students with poor attendance"
"Summarize my class performance"
"Who needs consultation?"
"Show missing activities"
```

### Dean Queries

```
"Show college summary"
"Which programs need attention?"
"Show high-risk overview"
"Show attendance concerns"
"Which subjects are problematic?"
```

### Program Chair Queries

```
"Show program summary"
"Show section summary"
"Show high-risk students in my program"
"Which subjects have problems?"
"Show year level summary"
```

## Key Features

### ✅ Natural Conversation
- No repetitive greetings
- Context-aware responses
- Role-appropriate tone

### ✅ Safe Graph Generation
- Student can graph own data
- Faculty can graph handled students
- Automatic permission checking
- Safe file handling

### ✅ Web Search Integration
- Public information only
- No private data sent online
- Multiple API support
- Graceful fallback

### ✅ Security
- SQL injection blocked
- Prompt injection blocked
- Role-based access control
- Audit logging

## Testing

### Security Tests

```bash
# Test SQL injection blocking
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1, "role": "student", "message": "SELECT * FROM users"}'

# Expected: "I can't help with that request..."
```

### Graph Tests

```bash
# Test student graph
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1, "role": "student", "message": "Graph my grades"}'

# Expected: Response with graph_url
```

### Web Search Tests

```bash
# Test public search
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"user_id": 1, "role": "student", "message": "Search the internet about CHED grading policy"}'

# Expected: Web lookup result with sources
```

## Troubleshooting

### Charts not generating?
- Check `static/generated_charts/` exists
- Install matplotlib: `pip install matplotlib`
- Check file permissions

### Web search not working?
- Set `CHATBOT_WEB_LOOKUP_ENABLED=1` in `.env`
- Check internet connection
- Verify API key if using Tavily

### Permission errors?
- Verify user role in database
- Check `role_policy.py` for allowed intents
- Review audit logs

## Architecture Overview

```
User Request
    ↓
Security Guard (blocks unsafe)
    ↓
Intent Detection
    ↓
Entity Extraction
    ↓
Role Policy Check
    ↓
Tool Router (safe functions)
    ↓
LLM Response Generator
    ↓
Audit Logger
    ↓
Natural Response
```

## API Endpoints

### POST /api/chat
Send a message to the chatbot

**Request:**
```json
{
  "user_id": 123,
  "role": "student",
  "message": "Show my grades",
  "session_id": "optional_session_id"
}
```

**Response:**
```json
{
  "reply": "Your current grade is 88...",
  "intent": "current_grade",
  "confidence": 0.92,
  "role": "student",
  "session_id": "abc123",
  "message_id": 456,
  "suggested_questions": ["Am I at risk?", "Show my attendance"]
}
```

### GET /api/history
Get chat history

**Query Parameters:**
- `user_id` (required)
- `role` (required)
- `limit` (optional, default: 40)
- `session_id` (optional)

### GET /api/sessions
Get user sessions

**Query Parameters:**
- `user_id` (required)
- `role` (required)
- `limit` (optional, default: 20)

## Next Steps

1. ✅ Test all security features
2. ✅ Test graph generation
3. ✅ Test web search
4. ✅ Test conversation flow
5. ✅ Review audit logs
6. ✅ Deploy to production

## Support

For issues or questions:
- Check `README_SMART_ASSISTANT.md` for detailed documentation
- Review test results in `test_smart_assistant.py`
- Check audit logs in database

---

**Made with ❤️ for JRMSU College of Engineering**
