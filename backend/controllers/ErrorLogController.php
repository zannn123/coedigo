<?php
/**
 * C.O.E.D.I.G.O. - Error Log Controller
 * Handles saving and retrieving system errors
 */

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';
require_once __DIR__ . '/../utils/Response.php';

class ErrorLogController {
    private $db;

    public function __construct() {
        $database = new Database();
        $this->db = $database->getConnection();
        $this->ensureTableExists();
    }

    private function ensureTableExists() {
        $this->db->exec("
            CREATE TABLE IF NOT EXISTS system_errors (
                id INT AUTO_INCREMENT PRIMARY KEY,
                source ENUM('frontend', 'backend') NOT NULL,
                message TEXT NOT NULL,
                context JSON DEFAULT NULL,
                user_id INT DEFAULT NULL,
                url VARCHAR(255) DEFAULT NULL,
                user_agent VARCHAR(255) DEFAULT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_source (source),
                INDEX idx_created (created_at),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            ) ENGINE=InnoDB
        ");
    }

    /**
     * GET /api/error-logs
     */
    public function index() {
        AuthMiddleware::authorize(['admin']);
        
        $page = max(1, (int)($_GET['page'] ?? 1));
        $limit = min(100, max(1, (int)($_GET['limit'] ?? 50)));
        $offset = ($page - 1) * $limit;
        
        $source = $_GET['source'] ?? null;
        
        $where = [];
        $params = [];
        if ($source) {
            $where[] = "e.source = ?";
            $params[] = $source;
        }
        
        $whereClause = $where ? 'WHERE ' . implode(' AND ', $where) : '';
        
        $countStmt = $this->db->prepare("SELECT COUNT(*) FROM system_errors e $whereClause");
        $countStmt->execute($params);
        $total = $countStmt->fetchColumn();
        
        $stmt = $this->db->prepare("
            SELECT e.*, CONCAT(u.first_name, ' ', u.last_name) as user_name 
            FROM system_errors e 
            LEFT JOIN users u ON e.user_id = u.id 
            $whereClause 
            ORDER BY e.created_at DESC 
            LIMIT $limit OFFSET $offset
        ");
        $stmt->execute($params);
        
        Response::paginated($stmt->fetchAll(), $total, $page, $limit);
    }

    /**
     * POST /api/error-logs
     * Save an error from the frontend
     */
    public function store() {
        // No strict auth required since frontend might crash before login
        $auth = null;
        try {
            $auth = AuthMiddleware::authenticate();
        } catch (Exception $e) {}

        $data = json_decode(file_get_contents('php://input'), true);
        if (!$data || empty($data['message'])) {
            Response::error('Invalid payload', 400);
        }

        $stmt = $this->db->prepare("
            INSERT INTO system_errors (source, message, context, user_id, url, user_agent)
            VALUES ('frontend', ?, ?, ?, ?, ?)
        ");
        
        $stmt->execute([
            $data['message'],
            !empty($data['context']) ? json_encode($data['context']) : null,
            $auth ? $auth['sub'] : null,
            $data['url'] ?? $_SERVER['HTTP_REFERER'] ?? null,
            $_SERVER['HTTP_USER_AGENT'] ?? null
        ]);

        Response::success(null, 'Error logged successfully', 201);
    }
}
