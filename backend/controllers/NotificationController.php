<?php
/**
 * C.O.E.D.I.G.O. - Notification Controller
 */
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';
require_once __DIR__ . '/../utils/Response.php';

class NotificationController {
    private $db;
    public function __construct() {
        $this->db = (new Database())->getConnection();
        $this->ensureAccountUpdateRequestTable();
    }

    public function index() {
        $auth = AuthMiddleware::authenticate();
        $limit = min(50, (int)($_GET['limit'] ?? 20));
        $stmt = $this->db->prepare("
            SELECT
                n.*,
                aur.id AS request_id,
                aur.request_type,
                aur.current_email,
                aur.current_contact_number,
                aur.requested_email,
                aur.requested_contact_number,
                aur.note AS request_note,
                aur.status AS request_status,
                aur.admin_note,
                aur.resolved_at,
                aur.requester_user_id,
                requester.first_name AS requester_first_name,
                requester.middle_name AS requester_middle_name,
                requester.last_name AS requester_last_name,
                requester.suffix AS requester_suffix,
                requester.role AS requester_role,
                requester.program AS requester_program,
                requester.student_id AS requester_student_id,
                requester.employee_id AS requester_employee_id,
                resolver.first_name AS resolver_first_name,
                resolver.last_name AS resolver_last_name
            FROM notifications n
            LEFT JOIN account_update_requests aur
                ON n.reference_type = 'account_update_request'
                AND n.reference_id = aur.id
            LEFT JOIN users requester
                ON aur.requester_user_id = requester.id
            LEFT JOIN users resolver
                ON aur.resolved_by = resolver.id
            WHERE n.user_id = ?
            ORDER BY n.created_at DESC
            LIMIT $limit
        ");
        $stmt->execute([$auth['sub']]);
        $rows = $stmt->fetchAll();

        foreach ($rows as &$row) {
            $row = $this->decorateNotificationRow($row);
        }

        Response::success($rows);
    }

    public function unreadCount() {
        $auth = AuthMiddleware::authenticate();
        $stmt = $this->db->prepare("SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0");
        $stmt->execute([$auth['sub']]);
        Response::success(['count' => (int)$stmt->fetchColumn()]);
    }

    public function markRead($id) {
        $auth = AuthMiddleware::authenticate();
        $this->db->prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?")->execute([$id, $auth['sub']]);
        Response::success(null, 'Marked as read.');
    }

    public function markAllRead() {
        $auth = AuthMiddleware::authenticate();
        $this->db->prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0")->execute([$auth['sub']]);
        Response::success(null, 'All notifications marked as read.');
    }

    public function updateRequestStatus($notificationId) {
        $auth = AuthMiddleware::authorize(['admin']);
        $data = json_decode(file_get_contents('php://input'), true);

        if (!is_array($data)) {
            Response::error('Invalid request payload.', 400);
        }

        $status = trim((string)($data['status'] ?? ''));
        $adminNote = trim((string)($data['admin_note'] ?? ''));

        if (!in_array($status, ['done', 'cancelled'], true)) {
            Response::error('Invalid request status.', 422);
        }

        if ($status === 'cancelled' && mb_strlen($adminNote) < 10) {
            Response::error('Please add a cancellation description with at least 10 characters.', 422);
        }

        $notificationStmt = $this->db->prepare("
            SELECT id, user_id, reference_type, reference_id
            FROM notifications
            WHERE id = ? AND user_id = ?
        ");
        $notificationStmt->execute([$notificationId, $auth['sub']]);
        $notification = $notificationStmt->fetch();

        if (!$notification || $notification['reference_type'] !== 'account_update_request' || empty($notification['reference_id'])) {
            Response::error('Request notification not found.', 404);
        }

        $this->db->beginTransaction();
        try {
            $requestStmt = $this->db->prepare("
                SELECT aur.*, requester.first_name, requester.last_name
                FROM account_update_requests aur
                INNER JOIN users requester ON aur.requester_user_id = requester.id
                WHERE aur.id = ?
                FOR UPDATE
            ");
            $requestStmt->execute([(int)$notification['reference_id']]);
            $request = $requestStmt->fetch();

            if (!$request) {
                throw new RuntimeException('Account update request not found.', 404);
            }

            if (($request['status'] ?? 'pending') !== 'pending') {
                throw new RuntimeException('This request has already been resolved.', 409);
            }

            $updateRequest = $this->db->prepare("
                UPDATE account_update_requests
                SET status = ?, admin_note = ?, resolved_by = ?, resolved_at = NOW()
                WHERE id = ?
            ");
            $updateRequest->execute([
                $status,
                $adminNote !== '' ? $adminNote : null,
                $auth['sub'],
                (int)$request['id'],
            ]);

            $this->db->prepare("
                UPDATE notifications
                SET is_read = 1
                WHERE reference_type = 'account_update_request' AND reference_id = ?
            ")->execute([(int)$request['id']]);

            $requestLabel = $this->formatRequestType($request['request_type'] ?? '');
            $requesterMessage = $status === 'done'
                ? "Your {$requestLabel} request was marked done by admin."
                : "Your {$requestLabel} request was cancelled by admin.\nReason: {$adminNote}";

            $requesterTitle = $status === 'done' ? 'Account Update Request Completed' : 'Account Update Request Cancelled';
            $this->db->prepare("
                INSERT INTO notifications (user_id, title, message, type, reference_type, reference_id)
                VALUES (?, ?, ?, 'system', 'account_update_request', ?)
            ")->execute([
                (int)$request['requester_user_id'],
                $requesterTitle,
                $requesterMessage,
                (int)$request['id'],
            ]);

            $this->logAudit(
                $auth['sub'],
                $status === 'done' ? 'ACCOUNT_UPDATE_REQUEST_DONE' : 'ACCOUNT_UPDATE_REQUEST_CANCELLED',
                'account_update_request',
                (int)$request['id'],
                ['status' => $request['status']],
                ['status' => $status, 'admin_note' => $adminNote !== '' ? $adminNote : null]
            );

            $resolvedNotification = $this->fetchNotificationForUser((int)$notification['id'], (int)$auth['sub']);
            $this->db->commit();

            Response::success([
                'notification' => $resolvedNotification,
            ], $status === 'done' ? 'Request marked done.' : 'Request cancelled.');
        } catch (Exception $e) {
            if ($this->db->inTransaction()) {
                $this->db->rollBack();
            }

            $statusCode = (int)$e->getCode();
            if ($statusCode < 400 || $statusCode > 599) {
                $statusCode = 500;
            }

            Response::error($statusCode === 500 ? 'Unable to update request status.' : $e->getMessage(), $statusCode);
        }
    }

    private function fetchNotificationForUser($notificationId, $userId) {
        $stmt = $this->db->prepare("
            SELECT
                n.*,
                aur.id AS request_id,
                aur.request_type,
                aur.current_email,
                aur.current_contact_number,
                aur.requested_email,
                aur.requested_contact_number,
                aur.note AS request_note,
                aur.status AS request_status,
                aur.admin_note,
                aur.resolved_at,
                aur.requester_user_id,
                requester.first_name AS requester_first_name,
                requester.middle_name AS requester_middle_name,
                requester.last_name AS requester_last_name,
                requester.suffix AS requester_suffix,
                requester.role AS requester_role,
                requester.program AS requester_program,
                requester.student_id AS requester_student_id,
                requester.employee_id AS requester_employee_id,
                resolver.first_name AS resolver_first_name,
                resolver.last_name AS resolver_last_name
            FROM notifications n
            LEFT JOIN account_update_requests aur
                ON n.reference_type = 'account_update_request'
                AND n.reference_id = aur.id
            LEFT JOIN users requester
                ON aur.requester_user_id = requester.id
            LEFT JOIN users resolver
                ON aur.resolved_by = resolver.id
            WHERE n.id = ? AND n.user_id = ?
            LIMIT 1
        ");
        $stmt->execute([$notificationId, $userId]);
        $row = $stmt->fetch();

        return $row ? $this->decorateNotificationRow($row) : null;
    }

    private function decorateNotificationRow(array $row) {
        if (($row['reference_type'] ?? '') === 'account_update_request' && !empty($row['request_id'])) {
            $requesterName = trim(implode(' ', array_filter([
                $row['requester_first_name'] ?? '',
                $row['requester_middle_name'] ?? '',
                $row['requester_last_name'] ?? '',
                $row['requester_suffix'] ?? '',
            ])));

            $resolverName = trim(implode(' ', array_filter([
                $row['resolver_first_name'] ?? '',
                $row['resolver_last_name'] ?? '',
            ])));

            $row['request'] = [
                'id' => (int)$row['request_id'],
                'request_type' => $row['request_type'],
                'request_type_label' => $this->formatRequestType($row['request_type'] ?? ''),
                'status' => $row['request_status'] ?? 'pending',
                'requester' => [
                    'id' => isset($row['requester_user_id']) ? (int)$row['requester_user_id'] : null,
                    'name' => $requesterName,
                    'role' => $row['requester_role'] ?? null,
                    'program' => $row['requester_program'] ?? null,
                    'student_id' => $row['requester_student_id'] ?? null,
                    'employee_id' => $row['requester_employee_id'] ?? null,
                ],
                'current_email' => $row['current_email'] ?? null,
                'current_contact_number' => $row['current_contact_number'] ?? null,
                'requested_email' => $row['requested_email'] ?? null,
                'requested_contact_number' => $row['requested_contact_number'] ?? null,
                'note' => $row['request_note'] ?? '',
                'admin_note' => $row['admin_note'] ?? null,
                'resolved_at' => $row['resolved_at'] ?? null,
                'resolved_by_name' => $resolverName !== '' ? $resolverName : null,
            ];
        } else {
            $row['request'] = null;
        }

        unset(
            $row['request_id'],
            $row['request_type'],
            $row['current_email'],
            $row['current_contact_number'],
            $row['requested_email'],
            $row['requested_contact_number'],
            $row['request_note'],
            $row['request_status'],
            $row['admin_note'],
            $row['resolved_at'],
            $row['requester_user_id'],
            $row['requester_first_name'],
            $row['requester_middle_name'],
            $row['requester_last_name'],
            $row['requester_suffix'],
            $row['requester_role'],
            $row['requester_program'],
            $row['requester_student_id'],
            $row['requester_employee_id'],
            $row['resolver_first_name'],
            $row['resolver_last_name']
        );

        return $row;
    }

    private function formatRequestType($requestType) {
        $labels = [
            'profile_update' => 'Profile update',
            'email_change' => 'Email change',
            'contact_change' => 'Contact number change',
            'student_record' => 'Student record correction',
            'employee_record' => 'Employee record correction',
            'other' => 'Other',
        ];

        return $labels[$requestType] ?? ucwords(str_replace('_', ' ', (string)$requestType));
    }

    private function ensureAccountUpdateRequestTable() {
        $this->db->exec("
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
            ) ENGINE=InnoDB
        ");
    }

    private function logAudit($userId, $action, $entityType = null, $entityId = null, $oldValues = null, $newValues = null) {
        try {
            $stmt = $this->db->prepare("INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([
                $userId,
                $action,
                $entityType,
                $entityId,
                $oldValues ? json_encode($oldValues) : null,
                $newValues ? json_encode($newValues) : null,
                $_SERVER['REMOTE_ADDR'] ?? null,
                $_SERVER['HTTP_USER_AGENT'] ?? null,
            ]);
        } catch (Exception $e) {}
    }
}
