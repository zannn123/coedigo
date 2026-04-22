<?php
/**
 * C.O.E.D.I.G.O. - Audit Log Controller
 */
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';
require_once __DIR__ . '/../utils/Response.php';

class AuditController {
    private $db;
    public function __construct() { $this->db = (new Database())->getConnection(); }

    public function index() {
        AuthMiddleware::authorize(['admin']);
        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = min(100, max(1, (int)($_GET['limit'] ?? 30)));
        $offset = ($page - 1) * $limit;
        $action = $_GET['action'] ?? null;
        $userId = $_GET['user_id'] ?? null;

        $where = [];
        $params = [];
        if ($action) { $where[] = "a.action LIKE ?"; $params[] = "%$action%"; }
        if ($userId) { $where[] = "a.user_id = ?"; $params[] = $userId; }

        $whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';

        $countStmt = $this->db->prepare("SELECT COUNT(*) FROM audit_logs a $whereClause");
        $countStmt->execute($params);
        $total = $countStmt->fetchColumn();

        $stmt = $this->db->prepare("SELECT a.*, CONCAT(u.first_name, ' ', u.last_name) as user_name, u.role as user_role FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id $whereClause ORDER BY a.created_at DESC LIMIT $limit OFFSET $offset");
        $stmt->execute($params);

        Response::paginated($stmt->fetchAll(), $total, $page, $limit);
    }
}
