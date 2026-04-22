<?php
/**
 * C.O.E.D.I.G.O. - Notification Controller
 */
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';
require_once __DIR__ . '/../utils/Response.php';

class NotificationController {
    private $db;
    public function __construct() { $this->db = (new Database())->getConnection(); }

    public function index() {
        $auth = AuthMiddleware::authenticate();
        $limit = min(50, (int)($_GET['limit'] ?? 20));
        $stmt = $this->db->prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT $limit");
        $stmt->execute([$auth['sub']]);
        Response::success($stmt->fetchAll());
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
}
