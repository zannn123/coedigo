-- ============================================================
-- C.O.E.D.I.G.O. Academic Assistant Chat History
-- Stores role-scoped chatbot turns for continuity and future AI context.
-- ============================================================

USE coedigo_db;

CREATE TABLE IF NOT EXISTS chatbot_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    role ENUM('admin', 'faculty', 'student', 'dean', 'program_chair') NOT NULL,
    message_role ENUM('user', 'assistant') NOT NULL,
    content TEXT NOT NULL,
    intent VARCHAR(80) DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_chatbot_messages_user_created (user_id, role, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
