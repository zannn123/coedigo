"""
groq_provider.py — Groq API integration for the COEDIGO chatbot.

Sends the user's message (with academic context) to the Groq API (Llama 3)
and returns a natural-language response.
"""

import os
import json
import time
import requests
from dotenv import load_dotenv

load_dotenv()

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "llama-3.1-8b-instant"

USAGE_FILE = os.path.join(os.path.dirname(__file__), "groq_usage.json")
MAX_CHATS_PER_USER = 20
LIMIT_WINDOW_SECONDS = 5 * 3600

def _get_usage():
    if os.path.exists(USAGE_FILE):
        try:
            with open(USAGE_FILE, "r") as f:
                return json.load(f)
        except json.JSONDecodeError:
            pass
    return {}

def _increment_usage(user_id: str):
    usage = _get_usage()
    uid = str(user_id)
    now = time.time()
    
    timestamps = usage.get(uid, [])
    if isinstance(timestamps, int):
        timestamps = []
        
    timestamps = [ts for ts in timestamps if now - ts < LIMIT_WINDOW_SECONDS]
    timestamps.append(now)
    usage[uid] = timestamps
    
    try:
        with open(USAGE_FILE, "w") as f:
            json.dump(usage, f)
    except IOError:
        pass

def _check_limit(user_id: str) -> bool:
    usage = _get_usage()
    uid = str(user_id)
    now = time.time()
    
    timestamps = usage.get(uid, [])
    if isinstance(timestamps, int):
        timestamps = []
        
    valid_timestamps = [ts for ts in timestamps if now - ts < LIMIT_WINDOW_SECONDS]
    return len(valid_timestamps) >= MAX_CHATS_PER_USER

SYSTEM_INSTRUCTION = (
    "You are Zenx AI, an intelligent academic assistant embedded in the C.O.E.D.I.G.O. "
    "school management system. You help students, faculty, and administrators with "
    "academic questions, general knowledge, and study assistance. "
    "You are friendly, concise, and always provide helpful answers. "
    "When answering general knowledge questions, speak naturally as if you already know the answer. "
    "Keep responses clear, well-structured, and avoid unnecessary filler. "
    "If the prompt includes an 'Authorized database-grounded result', treat that result as the "
    "authoritative system data and rewrite it clearly without adding records. "
    "Do not tell the user to switch to Local AI when authorized system data is already provided. "
    "If a user asks for private academic records and no authorized result is provided, do not invent "
    "records; explain that the request must be checked against authorized system data."
)

def groq_chat(message: str, context: list = None, user_name: str = None, user_id: str = None) -> dict:
    """
    Send a message to the Groq API and return the response.
    
    Returns:
        dict with 'reply' key (str), and optionally 'source' (str).
    """
    if user_id and _check_limit(user_id):
        return {
            "reply": (
                "**Groq Rate Limit Exceeded**\n\n"
                "You have reached your limit of 20 fast queries per 5 hours. "
                "Please switch your model to **Zenx AI (Local AI)** in the dropdown menu to continue chatting indefinitely without limits."
            ),
            "model": "groq",
        }

    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        return {
            "reply": (
                "Groq is not configured yet. "
                "Ask your system administrator to add a GROQ_API_KEY to the chatbot .env file."
            ),
            "model": "groq",
        }

    model = "llama-3.1-8b-instant"

    messages = [{"role": "system", "content": SYSTEM_INSTRUCTION}]

    if context:
        for turn in context[-8:]:
            user_msg = (turn.get("user_message") or "").strip()
            bot_msg = (turn.get("bot_reply") or "").strip()
            if user_msg:
                messages.append({"role": "user", "content": user_msg})
            if bot_msg:
                messages.append({"role": "assistant", "content": bot_msg})

    greeting = f"(The user's name is {user_name}.) " if user_name else ""
    messages.append({"role": "user", "content": f"{greeting}{message}"})

    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 800,
        "top_p": 0.95
    }
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }

    try:
        response = requests.post(GROQ_API_URL, json=payload, headers=headers, timeout=15)
        response.raise_for_status()
        data = response.json()
    except requests.Timeout:
        return {"reply": "Groq took too long to respond. Please try again.", "model": "groq"}
    except requests.RequestException as e:
        error_detail = ""
        if hasattr(e, "response") and e.response is not None:
            try:
                err_data = e.response.json()
                error_detail = err_data.get("error", {}).get("message", "")
            except (ValueError, AttributeError):
                pass
        return {
            "reply": f"Unable to reach Groq right now. {error_detail}".strip(),
            "model": "groq",
        }

    try:
        choices = data.get("choices", [])
        if not choices:
            return {"reply": "Groq returned an empty response. Try rephrasing your question.", "model": "groq"}

        reply_text = choices[0].get("message", {}).get("content", "").strip()

        if not reply_text:
            return {"reply": "Groq returned an empty response. Try rephrasing your question.", "model": "groq"}

        if user_id:
            _increment_usage(user_id)

        return {"reply": reply_text, "model": "groq"}
    except (KeyError, IndexError, TypeError):
        return {"reply": "Could not parse Groq's response. Please try again.", "model": "groq"}
