import logging
from datetime import datetime

from database_tools import _execute, ensure_smart_chatbot_tables


LOGGER = logging.getLogger(__name__)

SENSITIVE_INTENTS = {
    "current_grade",
    "subject_grade",
    "student_grade_lookup",
    "attendance_status",
    "risk_status",
    "students_needing_attention",
    "high_risk_students",
    "class_summary",
    "college_summary",
    "program_summary",
    "report_graph",
    "student_graph",
    "student_grade_graph",
    "student_attendance_graph",
    "student_risk_graph",
}


def log_action(
    requester_user_id,
    requester_role,
    intent,
    action_type,
    allowed,
    reason=None,
    target_student_id=None,
    target_class_id=None,
    session_id=None,
    ip_address=None,
):
    if intent not in SENSITIVE_INTENTS:
        return
    
    try:
        ensure_smart_chatbot_tables()
        _ensure_audit_table()
        
        _execute(
            """
            INSERT INTO chatbot_audit_log (
                requester_user_id,
                requester_role,
                intent,
                action_type,
                allowed,
                reason,
                target_student_id,
                target_class_id,
                session_id,
                ip_address,
                created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                int(requester_user_id),
                requester_role,
                intent,
                action_type,
                1 if allowed else 0,
                reason,
                int(target_student_id) if target_student_id else None,
                int(target_class_id) if target_class_id else None,
                session_id,
                ip_address,
                datetime.now(),
            ),
        )
    except Exception as e:
        LOGGER.error(f"Failed to log audit action: {e}")


def _ensure_audit_table():
    try:
        _execute(
            """
            CREATE TABLE IF NOT EXISTS chatbot_audit_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                requester_user_id INT NOT NULL,
                requester_role ENUM('admin', 'faculty', 'student', 'dean', 'program_chair') NOT NULL,
                intent VARCHAR(80) NOT NULL,
                action_type VARCHAR(80) NOT NULL,
                allowed TINYINT(1) NOT NULL DEFAULT 1,
                reason TEXT DEFAULT NULL,
                target_student_id INT DEFAULT NULL,
                target_class_id INT DEFAULT NULL,
                session_id VARCHAR(64) DEFAULT NULL,
                ip_address VARCHAR(45) DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_audit_requester (requester_user_id, created_at),
                INDEX idx_audit_intent (intent, created_at),
                INDEX idx_audit_target_student (target_student_id, created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            """
        )
    except Exception as e:
        LOGGER.error(f"Failed to create audit table: {e}")
