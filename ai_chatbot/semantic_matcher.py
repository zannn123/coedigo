import math
import re
from collections import Counter
from dataclasses import dataclass
from difflib import SequenceMatcher


@dataclass(frozen=True)
class SemanticMatch:
    intent: str
    score: float
    example: str = ""


STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "can",
    "could",
    "do",
    "does",
    "for",
    "give",
    "i",
    "in",
    "is",
    "it",
    "me",
    "my",
    "of",
    "on",
    "please",
    "show",
    "tell",
    "the",
    "to",
    "want",
    "what",
    "who",
    "with",
    "you",
}

TOKEN_SYNONYMS = {
    "academic": "academics",
    "absences": "attendance",
    "absent": "attendance",
    "advice": "improve",
    "always": "frequent",
    "at": "risk",
    "concern": "attention",
    "concerns": "attention",
    "consultation": "attention",
    "danger": "risk",
    "details": "detail",
    "doing": "performance",
    "failing": "risk",
    "failed": "risk",
    "grade": "score",
    "grades": "score",
    "help": "attention",
    "incomplete": "missing",
    "intervention": "attention",
    "low": "risk",
    "monitor": "attention",
    "pending": "missing",
    "problem": "attention",
    "problems": "attention",
    "report": "summary",
    "standing": "performance",
    "struggling": "attention",
    "support": "attention",
    "weak": "attention",
}

PHRASE_NORMALIZATIONS = [
    ("high-risk", "high risk"),
    ("at-risk", "at risk"),
    ("class standing", "class performance"),
    ("performance report", "performance summary"),
    ("academic concern", "academic attention"),
    ("needs consultation", "needs attention"),
    ("need consultation", "need attention"),
    ("poor attendance", "attendance problem"),
    ("low attendance", "attendance problem"),
    ("missing requirements", "missing activities"),
    ("incomplete requirements", "missing activities"),
    ("incomplete submissions", "missing activities"),
    ("not submitted", "missing activities"),
    ("marks of", "grade of"),
    ("scores of", "grade of"),
    ("student standing", "student grade"),
]


def normalize_text(text):
    value = (text or "").lower()
    for source, target in PHRASE_NORMALIZATIONS:
        value = value.replace(source, target)
    value = re.sub(r"[^a-z0-9\s]", " ", value)
    return " ".join(value.split())


def tokenize(text):
    normalized = normalize_text(text)
    tokens = []
    for token in normalized.split():
        token = TOKEN_SYNONYMS.get(token, token)
        if token and token not in STOPWORDS:
            tokens.append(token)
    return tokens


def match_intent(message, role=None, candidate_intents=None):
    text = normalize_text(message)
    if not text:
        return SemanticMatch("unknown", 0.0)

    candidates = set(candidate_intents or INTENT_EXAMPLES)
    best = SemanticMatch("unknown", 0.0)
    message_tokens = tokenize(text)

    if not message_tokens and len(text) < 4:
        return best

    for intent, examples in INTENT_EXAMPLES.items():
        if intent not in candidates:
            continue

        for example in examples:
            score = _similarity(text, message_tokens, example)
            if score > best.score:
                best = SemanticMatch(intent, score, example)

    return best


def _similarity(text, message_tokens, example):
    example_text = normalize_text(example)
    example_tokens = tokenize(example_text)
    token_overlap = _token_overlap(message_tokens, example_tokens)
    word_cosine = _cosine(message_tokens, example_tokens)
    char_cosine = _cosine(_char_ngrams(text), _char_ngrams(example_text))
    sequence = SequenceMatcher(None, text, example_text).ratio()

    # Short academic commands rely more on token overlap; long paraphrases
    # benefit from character n-grams and sequence similarity.
    if len(message_tokens) <= 2:
        return (token_overlap * 0.58) + (word_cosine * 0.32) + (sequence * 0.10)

    return (word_cosine * 0.46) + (token_overlap * 0.26) + (char_cosine * 0.18) + (sequence * 0.10)


def _token_overlap(left, right):
    if not left or not right:
        return 0.0
    left_set = set(left)
    right_set = set(right)
    return len(left_set & right_set) / max(1, min(len(left_set), len(right_set)))


def _cosine(left, right):
    if not left or not right:
        return 0.0

    left_counts = Counter(left)
    right_counts = Counter(right)
    terms = set(left_counts) | set(right_counts)
    dot = sum(left_counts[term] * right_counts[term] for term in terms)
    left_norm = math.sqrt(sum(value * value for value in left_counts.values()))
    right_norm = math.sqrt(sum(value * value for value in right_counts.values()))
    if not left_norm or not right_norm:
        return 0.0
    return dot / (left_norm * right_norm)


def _char_ngrams(text, size=3):
    compact = re.sub(r"\s+", " ", normalize_text(text))
    if len(compact) <= size:
        return [compact] if compact else []
    return [compact[index:index + size] for index in range(len(compact) - size + 1)]


def _expand(base_phrases, prefixes=None, suffixes=None):
    prefixes = prefixes or ["", "show ", "check ", "give me ", "can you show ", "i need "]
    suffixes = suffixes or ["", " please", " now", " summary", " report"]
    examples = set(base_phrases)
    for phrase in base_phrases:
        for prefix in prefixes:
            examples.add(f"{prefix}{phrase}".strip())
        for suffix in suffixes:
            examples.add(f"{phrase}{suffix}".strip())
    return sorted(examples)


INTENT_EXAMPLES = {
    "schedule_clarification": _expand([
        "class schedule",
        "my schedule",
        "schedule",
        "classes",
        "when are my classes",
        "school schedule",
    ], suffixes=["", " please"]),
    "schedule_today": _expand([
        "schedule today",
        "class today",
        "classes today",
        "today schedule",
        "for today",
        "today",
        "what are my classes today",
        "what is my class schedule today",
    ]),
    "schedule_tomorrow": _expand([
        "schedule tomorrow",
        "class tomorrow",
        "classes tomorrow",
        "tomorrow schedule",
        "for tomorrow",
        "tomorrow",
        "what are my classes tomorrow",
    ]),
    "schedule_week": _expand([
        "weekly schedule",
        "schedule this week",
        "classes this week",
        "this week",
        "week schedule",
        "my weekly class schedule",
    ]),
    "next_class": _expand([
        "next class",
        "my next class",
        "upcoming class",
        "what is my next class",
        "what class is next",
        "next schedule",
    ]),
    "enrolled_subjects": _expand([
        "my subjects",
        "enrolled subjects",
        "subjects this semester",
        "what subjects am i enrolled in",
        "subject list",
        "my current subjects",
    ]),
    "current_grade": _expand([
        "current grade",
        "my grade",
        "show my grades",
        "grades this semester",
        "grade summary",
        "lowest grade",
        "lowest subject",
    ]),
    "subject_grade": _expand([
        "grade in calculus",
        "grade for this subject",
        "current grade in a subject",
        "my grade in this subject",
        "what is my grade in",
    ]),
    "attendance_status": _expand([
        "my attendance",
        "attendance status",
        "show my attendance",
        "attendance record",
        "how is my attendance",
    ]),
    "risk_status": _expand([
        "am i at risk",
        "risk status",
        "risk of failing",
        "am i failing",
        "academic risk",
        "my risk level",
    ]),
    "improvement_advice": _expand([
        "what should i improve",
        "what subject should i focus on",
        "how can i improve",
        "what do i need to improve",
        "weak areas",
        "subjects to focus on",
    ]),
    "explain_risk": _expand([
        "why am i high risk",
        "why am i at risk",
        "explain my risk",
        "why is my risk high",
        "why am i failing",
    ]),
    "class_summary": _expand([
        "my class performance",
        "summary of my class performance",
        "how is my class doing",
        "class performance",
        "performance summary",
        "class standing",
        "summarize my students",
        "give me class report",
        "how are my students doing",
        "overall class status",
        "show class performance summary",
        "subject performance summary",
    ]),
    "students_needing_attention": _expand([
        "who needs attention",
        "students needing attention",
        "students who need attention",
        "who needs help",
        "students struggling",
        "who needs consultation",
        "students at risk",
        "who should i monitor",
        "students with problems",
        "students needing support",
        "academic concern students",
    ]),
    "high_risk_students": _expand([
        "high risk students",
        "show high risk students",
        "who is high risk",
        "who is failing",
        "list failing students",
        "students in serious risk",
        "danger students",
        "students below passing",
        "students with high academic risk",
        "high risk",
    ]),
    "low_grade_students": _expand([
        "students with low grades",
        "low grade students",
        "students below passing grade",
        "who has low grade",
        "who is below 75",
        "failing grade students",
    ]),
    "poor_attendance_students": _expand([
        "attendance problem",
        "who has poor attendance",
        "show low attendance",
        "students with attendance concern",
        "who is always absent",
        "attendance issue",
        "specific attendance",
        "what specific attendance",
        "attendance details",
    ]),
    "missing_activity_students": _expand([
        "missing activities",
        "students with missing activities",
        "who has incomplete requirements",
        "pending activities",
        "missing requirements",
        "who has not submitted",
        "incomplete submissions",
        "show only students with missing activities",
    ]),
    "college_summary": _expand([
        "overall performance",
        "overall academic performance",
        "college performance",
        "department performance",
        "summarize college performance",
        "show overall student performance",
        "academic performance overview",
    ]),
    "program_risk_summary": _expand([
        "which program needs attention",
        "programs with high risk students",
        "program risk summary",
        "programs with many at risk students",
        "high risk by program",
    ]),
    "subject_risk_summary": _expand([
        "which subjects have many struggling students",
        "subject risk summary",
        "problematic subjects",
        "subjects with concerns",
        "subjects with high risk students",
    ]),
    "high_risk_overview": _expand([
        "high risk overview",
        "overview of high risk students",
        "all high risk students",
        "high risk students by program",
        "academically at risk overview",
    ]),
    "attendance_overview": _expand([
        "attendance overview",
        "attendance concerns across the college",
        "college attendance concerns",
        "overall attendance concerns",
        "attendance problems overview",
    ]),
    "intervention_summary": _expand([
        "intervention summary",
        "students needing academic intervention",
        "academic intervention",
        "students needing intervention",
        "monitoring action summary",
    ]),
    "faculty_class_monitoring": _expand([
        "which faculty needs attention",
        "which class needs attention",
        "faculty class monitoring",
        "classes needing attention",
        "faculty with class concerns",
    ]),
    "program_summary": _expand([
        "program summary",
        "performance of my program",
        "show performance of my program",
        "program performance",
        "student performance in my program",
    ]),
    "year_level_summary": _expand([
        "year level summary",
        "which year level has many at risk students",
        "student performance by year level",
        "year level performance",
        "year level needs attention",
    ]),
    "section_summary": _expand([
        "section summary",
        "section performance",
        "which section needs attention",
        "student performance by section",
        "section needs attention",
    ]),
    "program_high_risk_students": _expand([
        "high risk students in my program",
        "program high risk students",
        "show high risk students in my program",
        "at risk students in my program",
    ]),
    "program_subject_concerns": _expand([
        "subject concerns",
        "program subject concerns",
        "which subjects are problematic",
        "subjects problematic in my program",
        "subject problems in my program",
    ]),
    "program_attendance_concerns": _expand([
        "program attendance concerns",
        "attendance concerns in my program",
        "program attendance problems",
        "poor attendance in my program",
    ]),
    "program_intervention_summary": _expand([
        "program intervention summary",
        "students needing consultation in my program",
        "program students needing intervention",
        "program monitoring actions",
    ]),
    "student_grade_lookup": _expand([
        "what is the grade of a student",
        "grade of gloryzann aclao",
        "show student grade",
        "check student score",
        "student standing in subject",
        "what is zann grade",
        "display grade for student",
        "student grade in cpe 316",
        "how is this student doing in class",
    ]),
    "small_talk_greeting": _expand([
        "hi",
        "hello",
        "hey",
        "hi i am zann",
        "my name is zann",
        "call me zann",
    ], prefixes=[""], suffixes=[""]),
    "identity_recall": _expand([
        "who am i",
        "who is me",
        "what is my name",
        "do you remember my name",
    ], prefixes=[""], suffixes=[""]),
    "web_search": _expand([
        "search the web",
        "search online",
        "look up online",
        "what is machine learning",
        "define civil engineering",
        "who is alan turing",
    ], prefixes=[""], suffixes=[""]),
    "explain_previous_result": _expand([
        "why",
        "explain",
        "explain that",
        "why is that",
        "why included",
        "why is he high risk",
        "why is she high risk",
    ], prefixes=["", "please "], suffixes=["", " please"]),
    "show_more_details": _expand([
        "tell me more",
        "tell me more about it",
        "more details",
        "explain more",
        "details",
        "more",
    ], prefixes=["", "please "], suffixes=["", " please"]),
    "show_only_high_risk": _expand([
        "show only high risk",
        "filter high risk",
        "only high risk",
        "high risk only",
        "show high risk only",
    ]),
    "show_attendance_details": _expand([
        "what about attendance",
        "how about attendance",
        "what specific attendance",
        "attendance details",
        "specific attendance",
    ]),
    "show_missing_activity_details": _expand([
        "what about missing activities",
        "how about missing activities",
        "missing activity details",
        "show missing activity details",
    ]),
    "clarify_date": _expand([
        "what date",
        "when",
        "what day",
        "which date",
        "for what date",
    ], prefixes=["", "please "], suffixes=["", " please"]),
}
