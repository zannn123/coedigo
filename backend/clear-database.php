<?php
/**
 * Clear All Database Data
 * Run this script once to reset the database
 */

require_once __DIR__ . '/config/database.php';

try {
    $database = new Database();
    $db = $database->getConnection();
    
    echo "Starting database cleanup...\n\n";
    
    // Disable foreign key checks
    $db->exec("SET FOREIGN_KEY_CHECKS = 0");
    echo "✓ Foreign key checks disabled\n";
    
    // Clear all tables
    $tables = [
        'audit_logs',
        'notifications',
        'account_update_requests',
        'grades',
        'grade_components',
        'attendance_records',
        'enrollments',
        'grade_assessments',
        'class_records',
        'subjects',
        'users',
        'system_settings'
    ];
    
    foreach ($tables as $table) {
        $db->exec("TRUNCATE TABLE $table");
        echo "✓ Cleared table: $table\n";
    }
    
    // Re-enable foreign key checks
    $db->exec("SET FOREIGN_KEY_CHECKS = 1");
    echo "✓ Foreign key checks enabled\n\n";
    
    // Restore default admin
    $stmt = $db->prepare("
        INSERT INTO users (employee_id, first_name, last_name, email, password_hash, role, department, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([
        'ADM-0001',
        'System',
        'Administrator',
        'admin@jrmsu.edu.ph',
        '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
        'admin',
        'College of Engineering',
        1
    ]);
    echo "✓ Default admin account restored\n";
    
    // Restore system settings
    $settings = [
        ['institution_name', 'Jose Rizal Memorial State University', 'Full institution name'],
        ['college_name', 'College of Engineering', 'College name'],
        ['system_name', 'C.O.E.D.I.G.O.', 'System acronym'],
        ['system_full_name', 'College of Engineering Digital Interface for Grading and Operations', 'Full system name'],
        ['current_academic_year', '2025-2026', 'Current academic year'],
        ['current_semester', '2nd', 'Current semester'],
        ['major_exam_weight', '30', 'Weight percentage for major exams'],
        ['quiz_weight', '30', 'Weight percentage for quizzes'],
        ['project_weight', '40', 'Weight percentage for projects/assignments/attendance'],
        ['passing_grade', '3.00', 'Maximum passing grade value'],
        ['grade_scale', '1.0,1.1,1.2,1.3,1.4,1.5,1.6,1.7,1.8,1.9,2.0,2.1,2.2,2.3,2.4,2.5,2.6,2.7,2.8,2.9,3.0,5.0', 'Available grade values'],
        ['smtp_host', 'smtp.gmail.com', 'SMTP host for Gmail or another mail provider'],
        ['smtp_port', '465', 'SMTP port'],
        ['smtp_username', '', 'SMTP username or Gmail address'],
        ['smtp_password', '', 'SMTP password or Gmail app password'],
        ['smtp_encryption', 'ssl', 'SMTP encryption: ssl, tls, or none'],
        ['mail_from_address', '', 'Sender email address; leave blank to use the SMTP username'],
        ['mail_from_name', 'COEDIGO', 'Display name for outgoing emails'],
        ['mail_reply_to', '', 'Reply-to address for outgoing emails']
    ];
    
    $stmt = $db->prepare("INSERT INTO system_settings (setting_key, setting_value, description) VALUES (?, ?, ?)");
    foreach ($settings as $setting) {
        $stmt->execute($setting);
    }
    echo "✓ System settings restored\n\n";
    
    echo "========================================\n";
    echo "DATABASE CLEARED SUCCESSFULLY!\n";
    echo "========================================\n\n";
    echo "Default Login:\n";
    echo "Email: admin@jrmsu.edu.ph\n";
    echo "Password: admin123\n\n";
    
} catch (Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
