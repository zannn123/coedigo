-- ============================================================
-- C.O.E.D.I.G.O. Database Schema
-- College of Engineering Digital Interface for Grading and Operations
-- Jose Rizal Memorial State University – College of Engineering
-- ============================================================

CREATE DATABASE IF NOT EXISTS coedigo_db
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE coedigo_db;

-- ============================================================
-- USERS TABLE
-- Stores all system users across roles
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id VARCHAR(50) UNIQUE DEFAULT NULL COMMENT 'For faculty/admin/dean',
    student_id VARCHAR(50) UNIQUE DEFAULT NULL COMMENT 'For students',
    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100) DEFAULT NULL,
    last_name VARCHAR(100) NOT NULL,
    suffix VARCHAR(20) DEFAULT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'faculty', 'student', 'dean', 'program_chair') NOT NULL,
    department VARCHAR(100) DEFAULT NULL,
    program VARCHAR(150) DEFAULT NULL COMMENT 'e.g., BSCE, BSEE, BSCpE',
    year_level TINYINT DEFAULT NULL COMMENT 'For students: 1-5',
    contact_number VARCHAR(20) DEFAULT NULL,
    profile_image VARCHAR(255) DEFAULT NULL,
    is_active TINYINT(1) DEFAULT 1,
    last_login DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_role (role),
    INDEX idx_department (department),
    INDEX idx_program (program),
    INDEX idx_active (is_active)
) ENGINE=InnoDB;

-- ============================================================
-- SUBJECTS TABLE
-- Academic subject catalog
-- ============================================================
CREATE TABLE IF NOT EXISTS subjects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE COMMENT 'e.g., CE 301',
    name VARCHAR(200) NOT NULL,
    description TEXT DEFAULT NULL,
    units DECIMAL(3,1) NOT NULL DEFAULT 3.0,
    department VARCHAR(100) DEFAULT NULL,
    program VARCHAR(150) DEFAULT NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_by INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_code (code),
    INDEX idx_department (department)
) ENGINE=InnoDB;

-- ============================================================
-- CLASS RECORDS TABLE
-- Instances of subjects per semester/year
-- ============================================================
CREATE TABLE IF NOT EXISTS class_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subject_id INT NOT NULL,
    faculty_id INT NOT NULL,
    section VARCHAR(20) NOT NULL COMMENT 'e.g., A, B, CE-3A',
    academic_year VARCHAR(20) NOT NULL COMMENT 'e.g., 2025-2026',
    semester ENUM('1st', '2nd', 'Summer') NOT NULL,
    schedule VARCHAR(200) DEFAULT NULL COMMENT 'e.g., MWF 9:00-10:00 AM',
    room VARCHAR(50) DEFAULT NULL,
    max_students INT DEFAULT 50,
    grade_status ENUM('draft', 'faculty_verified', 'officially_released') DEFAULT 'draft',
    verified_at DATETIME DEFAULT NULL,
    released_at DATETIME DEFAULT NULL,
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
    FOREIGN KEY (faculty_id) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_faculty (faculty_id),
    INDEX idx_semester (academic_year, semester),
    INDEX idx_status (grade_status)
) ENGINE=InnoDB;

-- ============================================================
-- ENROLLMENTS TABLE
-- Student-class assignments
-- ============================================================
CREATE TABLE IF NOT EXISTS enrollments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    class_record_id INT NOT NULL,
    student_id INT NOT NULL,
    enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active TINYINT(1) DEFAULT 1,
    FOREIGN KEY (class_record_id) REFERENCES class_records(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_enrollment (class_record_id, student_id),
    INDEX idx_student (student_id)
) ENGINE=InnoDB;

-- ============================================================
-- ATTENDANCE RECORDS TABLE
-- Dated attendance entries per enrolled student
-- Each present mark earns 1 point toward attendance
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance_records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    enrollment_id INT NOT NULL,
    attendance_date DATE NOT NULL,
    status ENUM('present', 'absent') NOT NULL DEFAULT 'absent',
    points DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT 'Present = 1 point, absent = 0',
    encoded_by INT NOT NULL,
    encoded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE,
    FOREIGN KEY (encoded_by) REFERENCES users(id) ON DELETE RESTRICT,
    UNIQUE KEY uk_attendance_entry (enrollment_id, attendance_date),
    INDEX idx_attendance_enrollment (enrollment_id),
    INDEX idx_attendance_date (attendance_date)
) ENGINE=InnoDB;

-- ============================================================
-- GRADE COMPONENTS TABLE
-- Individual score entries per student per class
-- ============================================================
CREATE TABLE IF NOT EXISTS grade_components (
    id INT AUTO_INCREMENT PRIMARY KEY,
    enrollment_id INT NOT NULL,
    category ENUM('major_exam', 'quiz', 'project') NOT NULL,
    component_name VARCHAR(100) NOT NULL COMMENT 'e.g., Midterm Exam, Quiz 1, Project 1',
    max_score DECIMAL(6,2) NOT NULL,
    score DECIMAL(6,2) DEFAULT NULL,
    encoded_by INT NOT NULL,
    encoded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE,
    FOREIGN KEY (encoded_by) REFERENCES users(id) ON DELETE RESTRICT,
    INDEX idx_enrollment (enrollment_id),
    INDEX idx_category (category)
) ENGINE=InnoDB;

-- ============================================================
-- GRADES TABLE
-- Computed final grades per student per class
-- ============================================================
CREATE TABLE IF NOT EXISTS grades (
    id INT AUTO_INCREMENT PRIMARY KEY,
    enrollment_id INT NOT NULL UNIQUE,
    major_exam_avg DECIMAL(5,2) DEFAULT NULL COMMENT 'Average % for major exams',
    quiz_avg DECIMAL(5,2) DEFAULT NULL COMMENT 'Average % for quizzes',
    project_avg DECIMAL(5,2) DEFAULT NULL COMMENT 'Average % for projects/outputs',
    weighted_score DECIMAL(5,2) DEFAULT NULL COMMENT 'Final weighted percentage',
    final_grade DECIMAL(3,2) DEFAULT NULL COMMENT 'e.g., 1.00, 1.25, ..., 5.00',
    remarks ENUM('Passed', 'Failed', 'Incomplete', 'Dropped', 'No Grade') DEFAULT 'No Grade',
    computed_at DATETIME DEFAULT NULL,
    verified_by INT DEFAULT NULL,
    verified_at DATETIME DEFAULT NULL,
    FOREIGN KEY (enrollment_id) REFERENCES enrollments(id) ON DELETE CASCADE,
    FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_remarks (remarks)
) ENGINE=InnoDB;

-- ============================================================
-- NOTIFICATIONS TABLE
-- System notifications for users
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('grade_released', 'grade_updated', 'system', 'announcement') DEFAULT 'system',
    is_read TINYINT(1) DEFAULT 0,
    reference_type VARCHAR(50) DEFAULT NULL COMMENT 'e.g., class_record, grade',
    reference_id INT DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_read (user_id, is_read),
    INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- ============================================================
-- ACCOUNT UPDATE REQUESTS TABLE
-- Admin-reviewed requests for locked account field changes
-- ============================================================
CREATE TABLE IF NOT EXISTS account_update_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    requester_user_id INT NOT NULL,
    request_type VARCHAR(50) NOT NULL,
    current_email VARCHAR(255) DEFAULT NULL,
    current_contact_number VARCHAR(20) DEFAULT NULL,
    requested_email VARCHAR(255) DEFAULT NULL,
    requested_contact_number VARCHAR(20) DEFAULT NULL,
    note TEXT NOT NULL,
    status ENUM('pending', 'done', 'cancelled') NOT NULL DEFAULT 'pending',
    admin_note TEXT DEFAULT NULL,
    resolved_by INT DEFAULT NULL,
    resolved_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_requester_status (requester_user_id, status),
    INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- ============================================================
-- AUDIT LOGS TABLE
-- Activity tracking for accountability
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT DEFAULT NULL,
    action VARCHAR(100) NOT NULL COMMENT 'e.g., LOGIN, CREATE_USER, ENCODE_GRADE',
    entity_type VARCHAR(50) DEFAULT NULL COMMENT 'e.g., user, class_record, grade',
    entity_id INT DEFAULT NULL,
    old_values JSON DEFAULT NULL,
    new_values JSON DEFAULT NULL,
    ip_address VARCHAR(45) DEFAULT NULL,
    user_agent VARCHAR(500) DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user (user_id),
    INDEX idx_action (action),
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_created (created_at)
) ENGINE=InnoDB;

-- ============================================================
-- SYSTEM SETTINGS TABLE
-- Configurable system parameters
-- ============================================================
CREATE TABLE IF NOT EXISTS system_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT NOT NULL,
    description VARCHAR(255) DEFAULT NULL,
    updated_by INT DEFAULT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================
-- SEED DATA
-- Default admin account and system settings
-- ============================================================

-- Default admin (password: admin123 - must be changed on first login)
INSERT INTO users (employee_id, first_name, last_name, email, password_hash, role, department, is_active)
VALUES (
    'ADM-0001',
    'System',
    'Administrator',
    'admin@jrmsu.edu.ph',
    '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    'admin',
    'College of Engineering',
    1
);

-- Default system settings
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
('institution_name', 'Jose Rizal Memorial State University', 'Full institution name'),
('college_name', 'College of Engineering', 'College name'),
('system_name', 'C.O.E.D.I.G.O.', 'System acronym'),
('system_full_name', 'College of Engineering Digital Interface for Grading and Operations', 'Full system name'),
('current_academic_year', '2025-2026', 'Current academic year'),
('current_semester', '2nd', 'Current semester'),
('major_exam_weight', '40', 'Weight percentage for major exams'),
('quiz_weight', '30', 'Weight percentage for quizzes'),
('project_weight', '30', 'Weight percentage for projects/assignments/attendance'),
('passing_grade', '3.00', 'Maximum passing grade value'),
('grade_scale', '1.00,1.25,1.50,1.75,2.00,2.25,2.50,2.75,3.00,5.00', 'Available grade values'),
('smtp_host', 'smtp.gmail.com', 'SMTP host for Gmail or another mail provider'),
('smtp_port', '465', 'SMTP port'),
('smtp_username', '', 'SMTP username or Gmail address'),
('smtp_password', '', 'SMTP password or Gmail app password'),
('smtp_encryption', 'ssl', 'SMTP encryption: ssl, tls, or none'),
('mail_from_address', '', 'Sender email address; leave blank to use the SMTP username'),
('mail_from_name', 'COEDIGO', 'Display name for outgoing emails'),
('mail_reply_to', '', 'Reply-to address for outgoing emails');
