-- ============================================================
-- C.O.E.D.I.G.O. Smart Academic Assistant Tables
-- Additive migration for sessions, grounded chat history,
-- safe user memory, feedback, and reviewed training examples.
-- ============================================================

USE coedigo_db;

CREATE TABLE IF NOT EXISTS chatbot_sessions (
    id VARCHAR(64) PRIMARY KEY,
    user_id INT NOT NULL,
    role ENUM('admin', 'faculty', 'student', 'dean', 'program_chair') NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME DEFAULT NULL,
    last_intent VARCHAR(80) DEFAULT NULL,
    last_result_type VARCHAR(80) DEFAULT NULL,
    pending_clarification VARCHAR(80) DEFAULT NULL,
    summary TEXT DEFAULT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_chatbot_sessions_user_started (user_id, role, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chatbot_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    role ENUM('admin', 'faculty', 'student', 'dean', 'program_chair') NOT NULL,
    session_id VARCHAR(64) DEFAULT NULL,
    user_message TEXT NOT NULL,
    detected_intent VARCHAR(80) DEFAULT NULL,
    confidence_score DECIMAL(4,3) DEFAULT 0.000,
    bot_response TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES chatbot_sessions(id) ON DELETE SET NULL,
    INDEX idx_chatbot_messages_user_created (user_id, role, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chatbot_feedback (
    id INT AUTO_INCREMENT PRIMARY KEY,
    message_id INT NOT NULL,
    user_id INT NOT NULL,
    rating ENUM('helpful', 'not_helpful') NOT NULL,
    feedback_text TEXT DEFAULT NULL,
    corrected_intent VARCHAR(80) DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES chatbot_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_chatbot_feedback_message (message_id),
    INDEX idx_chatbot_feedback_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chatbot_user_memory (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    role ENUM('admin', 'faculty', 'student', 'dean', 'program_chair') NOT NULL,
    preferred_response_style VARCHAR(40) DEFAULT 'concise',
    frequent_intents TEXT DEFAULT NULL,
    last_topics TEXT DEFAULT NULL,
    profile_memory TEXT DEFAULT NULL,
    memory_summary TEXT DEFAULT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_chatbot_user_memory (user_id, role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chatbot_training_examples (
    id INT AUTO_INCREMENT PRIMARY KEY,
    text TEXT NOT NULL,
    original_intent VARCHAR(80) DEFAULT NULL,
    corrected_intent VARCHAR(80) DEFAULT NULL,
    source ENUM('user_feedback', 'admin_added', 'system_suggested') DEFAULT 'system_suggested',
    reviewed TINYINT(1) DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_chatbot_training_reviewed (reviewed, corrected_intent)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
