<?php
/**
 * C.O.E.D.I.G.O. - Subject Controller
 */
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../middleware/AuthMiddleware.php';
require_once __DIR__ . '/../utils/Response.php';
require_once __DIR__ . '/../utils/Validator.php';

class SubjectController {
    private $db;

    public function __construct() {
        $database = new Database();
        $this->db = $database->getConnection();
    }

    public function index() {
        AuthMiddleware::authenticate();
        $search = $_GET['search'] ?? null;
        $where = ["s.is_active = 1"];
        $params = [];
        if ($search) {
            $where[] = "(s.code LIKE ? OR s.name LIKE ?)";
            $params[] = "%$search%";
            $params[] = "%$search%";
        }
        $whereClause = 'WHERE ' . implode(' AND ', $where);
        $stmt = $this->db->prepare("SELECT s.*, CONCAT(u.first_name, ' ', u.last_name) as created_by_name FROM subjects s LEFT JOIN users u ON s.created_by = u.id $whereClause ORDER BY s.code");
        $stmt->execute($params);
        Response::success($stmt->fetchAll());
    }

    public function create() {
        $auth = AuthMiddleware::authorize(['admin', 'faculty']);
        $data = json_decode(file_get_contents('php://input'), true);
        $validator = new Validator();
        $validator->required('code', $data['code'] ?? '')->required('name', $data['name'] ?? '')->required('units', $data['units'] ?? '');
        if (!$validator->isValid()) Response::error('Validation failed.', 422, $validator->getErrors());

        $check = $this->db->prepare("SELECT id FROM subjects WHERE code = ?");
        $check->execute([$data['code']]);
        if ($check->fetch()) Response::error('Subject code already exists.', 409);

        $stmt = $this->db->prepare("INSERT INTO subjects (code, name, description, units, department, program, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([strtoupper($data['code']), $data['name'], $data['description'] ?? null, $data['units'], $data['department'] ?? null, $data['program'] ?? null, $auth['sub']]);
        Response::success(['id' => (int)$this->db->lastInsertId()], 'Subject created.', 201);
    }

    public function update($id) {
        AuthMiddleware::authorize(['admin', 'faculty']);
        $data = json_decode(file_get_contents('php://input'), true);
        $fields = []; $params = [];
        foreach (['code','name','description','units','department','program'] as $f) {
            if (array_key_exists($f, $data)) { $fields[] = "$f = ?"; $params[] = $data[$f]; }
        }
        if (empty($fields)) Response::error('No fields to update.', 400);
        $params[] = $id;
        $this->db->prepare("UPDATE subjects SET " . implode(', ', $fields) . " WHERE id = ?")->execute($params);
        Response::success(null, 'Subject updated.');
    }

    public function delete($id) {
        AuthMiddleware::authorize(['admin']);
        $this->db->prepare("UPDATE subjects SET is_active = 0 WHERE id = ?")->execute([$id]);
        Response::success(null, 'Subject deactivated.');
    }
}
