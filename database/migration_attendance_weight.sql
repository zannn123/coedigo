-- Migration: Add attendance_weight to class_records
-- This allows faculty to customize how much attendance contributes to performance tasks

ALTER TABLE class_records
ADD COLUMN attendance_weight DECIMAL(5,2) DEFAULT 100.00
COMMENT 'Percentage of attendance contribution to performance tasks (0-100)'
AFTER grade_status;

-- Update existing records to have 100% attendance weight (current behavior)
UPDATE class_records SET attendance_weight = 100.00 WHERE attendance_weight IS NULL;

-- Persist class-level assessment definitions even before scores are entered.
CREATE TABLE IF NOT EXISTS grade_assessments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_record_id INT NOT NULL,
    category ENUM('major_exam', 'quiz', 'project') NOT NULL,
    component_name VARCHAR(100) NOT NULL,
    max_score DECIMAL(6,2) NOT NULL,
    created_by INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (class_record_id) REFERENCES class_records(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    UNIQUE KEY uk_class_assessment (class_record_id, category, component_name),
    INDEX idx_class_assessment_class (class_record_id)
) ENGINE=InnoDB;
