-- ============================================================
-- Subject Approval Workflow Migration
-- Adds approval system for faculty-created subjects
-- ============================================================

USE coedigo_db;

-- Add approval fields to subjects table
ALTER TABLE subjects
ADD COLUMN approval_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending' COMMENT 'Approval status for faculty-created subjects',
ADD COLUMN approved_by INT DEFAULT NULL COMMENT 'Program Chair or Admin who approved',
ADD COLUMN approved_at DATETIME DEFAULT NULL COMMENT 'When the subject was approved',
ADD COLUMN rejection_reason TEXT DEFAULT NULL COMMENT 'Reason if rejected',
ADD INDEX idx_approval_status (approval_status),
ADD FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL;

-- Update existing subjects to be approved (backward compatibility)
UPDATE subjects SET approval_status = 'approved', approved_at = created_at WHERE approval_status = 'pending';

-- ============================================================
-- Notes:
-- - Faculty-created subjects start as 'pending'
-- - Program Chairs can approve/reject subjects for their program
-- - Admin can approve/reject any subject
-- - Only 'approved' subjects are visible when creating classes
-- ============================================================
