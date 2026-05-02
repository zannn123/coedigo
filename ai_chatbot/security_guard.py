import re


BLOCKED_PATTERNS = [
    r"\bselect\s+\*\s+from\b",
    r"\bdrop\s+table\b",
    r"\bdelete\s+from\b",
    r"\binsert\s+into\b",
    r"\bupdate\s+\w+\s+set\b",
    r"\bexec\b.*\(",
    r"\beval\b.*\(",
    r"\b__import__\b",
    r"\bpassword\b.*=",
    r"\bapi[_-]?key\b",
    r"\btoken\b.*=",
    r"\bcredential",
    r"\bsecret[_-]?key\b",
    r"\bignore\s+(previous|all|your)\s+(instruction|rule|prompt)",
    r"\bshow\s+(system|hidden)\s+prompt",
    r"\breveal\s+(your|the)\s+(prompt|instruction)",
    r"\bact\s+as\s+(admin|dean|faculty)",
    r"\bi\s+am\s+(now\s+)?(admin|dean|faculty|program.?chair)",
    r"\bpretend\s+(you|i)\s+(are|am)",
    r"\bdatabase\s+dump",
    r"\ball\s+users\s+(and\s+)?password",
    r"\bshow\s+all\s+(student|user|password|credential)",
    r"\bbypass\s+(role|permission|security)",
    r"\\.\\.\\/",
    r"\\.\\.\\\\",
]


def is_request_safe(message, user_id, role):
    text = (message or "").strip().lower()
    if not text:
        return True, None

    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, text, flags=re.IGNORECASE):
            return False, "I can't help with that request. I can only provide academic information that your account is authorized to access."

    if _is_sql_injection_attempt(text):
        return False, "I can't help with that request. I can only provide academic information that your account is authorized to access."

    if _is_unauthorized_data_request(text, role):
        return False, "I can't help with that request. I can only provide academic information that your account is authorized to access."

    return True, None


def _is_sql_injection_attempt(text):
    sql_keywords = ["select", "insert", "update", "delete", "drop", "create", "alter", "exec", "union"]
    sql_operators = ["--", "/*", "*/", "';", "\";", "or 1=1", "or '1'='1"]
    
    keyword_count = sum(1 for keyword in sql_keywords if f" {keyword} " in f" {text} ")
    operator_count = sum(1 for op in sql_operators if op in text)
    
    return keyword_count >= 2 or (keyword_count >= 1 and operator_count >= 1)


def _is_unauthorized_data_request(text, role):
    if role == "student":
        if re.search(r"\b(all|every|list)\s+(student|user|grade|password)", text):
            return True
        if re.search(r"\bother\s+student", text) and "grade" in text:
            return True
    
    if re.search(r"\b(dump|export|download)\s+(database|all\s+data|everything)", text):
        return True
    
    return False
