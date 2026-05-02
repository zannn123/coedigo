"""
web_search.py — AI-style web knowledge module.

Instead of raw "Web lookup result for X: ..." dumps, all responses are
formatted as natural, first-person LLM-style answers, as if the AI
already knew the information.
"""

import os
import re
from urllib.parse import quote

import requests
from dotenv import load_dotenv


load_dotenv()

DUCKDUCKGO_API    = "https://api.duckduckgo.com/"
WIKIPEDIA_API     = "https://en.wikipedia.org/w/api.php"
WIKIPEDIA_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/"
TAVILY_API        = "https://api.tavily.com/search"

# ─── Openers that make the response feel conversational ───────────────────────

_OPENERS = [
    "Based on what I know, ",
    "From what I can tell, ",
    "Here's what I found: ",
    "Sure — ",
    "",   # plain, no opener
]
_opener_idx = 0


def _opener():
    global _opener_idx
    out = _OPENERS[_opener_idx % len(_OPENERS)]
    _opener_idx += 1
    return out


# ─── Main entry points ────────────────────────────────────────────────────────

def web_lookup(query: str) -> str:
    """
    Perform an intelligent web search and return a natural-language answer.
    Does NOT say 'Web lookup result for X:' — formats it as if the AI knows it.
    """
    clean = _clean_query(query)
    if not clean:
        return "What would you like me to look up?"

    if os.getenv("CHATBOT_WEB_LOOKUP_ENABLED", "1") != "1":
        return "Web lookup is currently disabled for this service."

    if _is_private_academic_query(clean):
        return (
            "That looks like it's about private academic data. "
            "Ask me directly about grades, attendance, or risk records "
            "and I'll pull that from the academic records instead."
        )

    # ── Tavily (premium, best quality) ───────────────────────────────────────
    tavily_key = os.getenv("TAVILY_API_KEY")
    if tavily_key:
        result = _tavily_search(clean, tavily_key)
        if result:
            return result

    # ── DuckDuckGo Instant Answer ─────────────────────────────────────────────
    result = _duckduckgo(clean)
    if result:
        return result

    # ── Wikipedia (direct title lookup) ──────────────────────────────────────
    result = _wiki_summary_by_title(clean)
    if result:
        return result

    # ── Wikipedia simplified (strip question words) ───────────────────────────
    simplified = _simplify(clean)
    if simplified and simplified != clean:
        result = _wiki_summary_by_title(simplified)
        if result:
            return result

    # ── Wikipedia full-text search ────────────────────────────────────────────
    result = _wiki_fulltext_search(clean)
    if result:
        return result

    # ── Graceful fallback ─────────────────────────────────────────────────────
    ddg_url = f"https://duckduckgo.com/?q={quote(clean)}"
    return (
        f"I wasn't able to find a confident answer for that online. "
        f"You can search for it yourself here: {ddg_url}"
    )


def summarize_context(context: list) -> str:
    """
    Summarize the recent conversation context in a natural way.
    """
    if not context:
        return "There's nothing in our conversation yet to summarize."

    messages = []
    for row in context[-12:]:  # look back up to last 12 turns
        user_msg = (row.get("user_message") or "").strip()
        bot_msg  = (row.get("bot_reply") or "").strip()
        if user_msg:
            messages.append(f"You asked: {user_msg}")
        if bot_msg and len(bot_msg) < 400:
            messages.append(f"I answered: {bot_msg}")

    if not messages:
        return "I don't have enough recent context to summarize right now."

    bullet_points = "\n".join(f"• {m}" for m in messages)
    return (
        f"Here's a quick recap of what we've discussed so far:\n\n"
        f"{bullet_points}"
    )


# ─── Source adapters ──────────────────────────────────────────────────────────

def _duckduckgo(query: str) -> str | None:
    try:
        r = requests.get(
            DUCKDUCKGO_API,
            params={"q": query, "format": "json", "no_html": "1",
                    "no_redirect": "1", "skip_disambig": "1"},
            timeout=6,
        )
        r.raise_for_status()
        data = r.json()
    except (requests.RequestException, ValueError):
        return None

    answer   = (data.get("Answer")       or "").strip()
    abstract = (data.get("AbstractText") or "").strip()
    heading  = (data.get("Heading")      or "").strip()
    url      = (data.get("AbstractURL")  or data.get("Redirect") or "").strip()

    if answer:
        return _naturalize(answer, url)
    if abstract:
        text = f"{heading} — {abstract}" if heading else abstract
        return _naturalize(text, url)
    return None


def _wiki_summary_by_title(query: str) -> str | None:
    """Direct Wikipedia REST summary API — fastest for exact article titles."""
    slug = query.strip().replace(" ", "_")
    try:
        r = requests.get(
            f"{WIKIPEDIA_SUMMARY}{quote(slug)}",
            headers={"User-Agent": "COEDIGOAcademicAssistant/1.0"},
            timeout=7,
        )
        if r.status_code == 404:
            return None
        r.raise_for_status()
        data = r.json()
    except (requests.RequestException, ValueError):
        return None

    extract = (data.get("extract") or "").strip()
    title   = (data.get("title")   or "").strip()
    url     = (
        data.get("content_urls", {}).get("desktop", {}).get("page", "")
        or f"https://en.wikipedia.org/wiki/{quote(slug)}"
    )

    if not extract or len(extract) < 30:
        return None

    # Keep first 3 sentences for conciseness
    sentences = re.split(r"(?<=[.!?])\s+", extract)
    summary = " ".join(sentences[:3]).strip()

    # Remove redundant "Title: Title is a..." pattern that Wikipedia often does
    if summary.lower().startswith(title.lower() + ":"):
        summary = summary[len(title) + 1:].strip()

    return _naturalize(summary, url)


def _wiki_fulltext_search(query: str) -> str | None:
    """
    Full-text Wikipedia search — finds articles even when the query phrase
    isn't a page title. E.g. 'who is the father of accounting' → 'Luca Pacioli'.
    """
    try:
        r = requests.get(
            WIKIPEDIA_API,
            params={"action": "query", "list": "search",
                    "srsearch": query, "srlimit": "5", "format": "json"},
            headers={"User-Agent": "COEDIGOAcademicAssistant/1.0"},
            timeout=8,
        )
        r.raise_for_status()
        data = r.json()
    except (requests.RequestException, ValueError):
        return None

    results = data.get("query", {}).get("search", [])
    for result in results[:5]:
        title = result.get("title", "")
        if title:
            summary = _wiki_summary_by_title(title)
            if summary:
                return summary

    return None


def _tavily_search(query: str, api_key: str) -> str | None:
    try:
        r = requests.post(
            TAVILY_API,
            json={"api_key": api_key, "query": query,
                  "search_depth": "basic", "max_results": 3},
            timeout=8,
        )
        r.raise_for_status()
        data = r.json()
    except (requests.RequestException, ValueError):
        return None

    results = data.get("results", [])
    if not results:
        return None

    # Synthesize the top 2 results into a single natural answer
    best = results[0]
    content = (best.get("content") or "")[:300].strip()
    title   = (best.get("title")   or "").strip()
    url     = (best.get("url")     or "").strip()

    if not content:
        return None

    text = f"{title} — {content}" if title else content
    return _naturalize(text, url)


# ─── Formatting helpers ───────────────────────────────────────────────────────

def _naturalize(text: str, source_url: str = "") -> str:
    """
    Format a raw knowledge snippet as a natural, first-person AI response.
    No 'Web lookup result for X:' prefix — just a clean conversational answer.
    """
    # Strip any leading "Title: " repetition (Wikipedia artefact)
    text = re.sub(r"^[A-Z][^\n:]{1,60}:\s*", "", text, count=1) if ": " in text[:80] else text
    text = text.strip()

    opener = _opener()
    reply = f"{opener}{text}"

    if source_url:
        reply += f"\n\n*Source: {source_url}*"

    return reply


def _clean_query(query: str) -> str:
    value = (query or "").strip().strip('"').strip("'")
    lowered = value.lower()

    # Strip command prefixes longest-first
    prefixes = sorted([
        "search on the web for", "search on the web",
        "search through the internet for", "search through the internet",
        "search throught internet for", "search throught internet",
        "search through internet for", "search through internet",
        "search the internet for", "search the internet",
        "search the web for", "search the web",
        "search online for", "search online",
        "internet search for", "internet search",
        "web search for", "web search",
        "find online", "look up online", "look up",
        "define", "tell me", "can you search",
        "can you find", "can you look up",
        "i want to know", "google",
    ], key=len, reverse=True)

    for prefix in prefixes:
        if lowered.startswith(prefix):
            value = value[len(prefix):].strip(" :,-")
            break

    return value[:200].strip('"').strip("'")


def _simplify(query: str) -> str:
    """Extract the core noun phrase from a question."""
    lowered = query.lower().rstrip("?").strip()
    patterns = [
        r"^(?:who|what|where|when|why|how)\s+(?:is|are|was|were)\s+(?:the\s+)?(.+)$",
        r"^(?:who|what)\s+(?:is|was)\s+(.+)$",
        r"^tell me (?:about\s+)?(.+)$",
        r"^(?:explain|describe)\s+(.+)$",
        r"^the\s+(.+)$",
    ]
    for pattern in patterns:
        m = re.match(pattern, lowered)
        if m:
            return m.group(1).strip()
    return query


def _is_private_academic_query(query: str) -> bool:
    lowered = query.lower()
    private = [
        "student grade", "student attendance", "student risk",
        "class list", "student list", "student record",
        "academic record", "my grade", "my attendance", "class roster",
    ]
    return any(kw in lowered for kw in private)
