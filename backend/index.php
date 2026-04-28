<?php
/**
 * C.O.E.D.I.G.O. - API Router
 * College of Engineering Digital Interface for Grading and Operations
 * Jose Rizal Memorial State University
 */

// Buffer output so PHP warnings don't corrupt JSON responses
ob_start();

// CORS Headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Get request path
$requestUri = $_SERVER['REQUEST_URI'];
$basePath = '/api';
$path = parse_url($requestUri, PHP_URL_PATH);

// Remove base path prefix if behind a subdirectory
$path = preg_replace('#^.*/api#', '/api', $path);

// Normalize path to handle trailing slashes robustly
if ($path !== '/' && $path !== '/api') {
    $path = rtrim($path, '/');
}

$method = $_SERVER['REQUEST_METHOD'];

// Root health check endpoint to prevent "Endpoint not found" on base URL
if (($path === '/' || $path === '/api') && $method === 'GET') {
    require_once __DIR__ . '/utils/Response.php';
    Response::success([
        'name' => 'C.O.E.D.I.G.O. API',
        'version' => '1.0.0',
        'status' => 'operational'
    ], 'API is running successfully.');
    exit;
}

// Simple router
$routes = [];

// Helper to match route patterns
function matchRoute($pattern, $path) {
    $pattern = preg_replace('/\{(\w+)\}/', '(?P<$1>[^/]+)', $pattern);
    $pattern = "#^{$pattern}$#";
    if (preg_match($pattern, $path, $matches)) {
        return array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);
    }
    return false;
}

// --- AUTH ROUTES ---
if ($path === '/api/auth/login' && $method === 'POST') {
    require_once __DIR__ . '/controllers/AuthController.php';
    (new AuthController())->login();
}
elseif ($path === '/api/auth/me' && $method === 'GET') {
    require_once __DIR__ . '/controllers/AuthController.php';
    (new AuthController())->me();
}
elseif ($path === '/api/auth/password' && $method === 'PUT') {
    require_once __DIR__ . '/controllers/AuthController.php';
    (new AuthController())->changePassword();
}
elseif ($path === '/api/auth/credential-request' && $method === 'POST') {
    require_once __DIR__ . '/controllers/AuthController.php';
    (new AuthController())->requestCredentialUpdate();
}

// --- USER ROUTES ---
elseif ($path === '/api/users' && $method === 'GET') {
    require_once __DIR__ . '/controllers/UserController.php';
    (new UserController())->index();
}
elseif ($path === '/api/users/stats' && $method === 'GET') {
    require_once __DIR__ . '/controllers/UserController.php';
    (new UserController())->stats();
}
elseif ($path === '/api/users' && $method === 'POST') {
    require_once __DIR__ . '/controllers/UserController.php';
    (new UserController())->create();
}
elseif (preg_match('#^/api/users/(\d+)/status$#', $path, $m) && $method === 'PUT') {
    require_once __DIR__ . '/controllers/UserController.php';
    (new UserController())->updateStatus($m[1]);
}
elseif (preg_match('#^/api/users/(\d+)$#', $path, $m) && $method === 'GET') {
    require_once __DIR__ . '/controllers/UserController.php';
    (new UserController())->show($m[1]);
}
elseif (preg_match('#^/api/users/(\d+)$#', $path, $m) && $method === 'PUT') {
    require_once __DIR__ . '/controllers/UserController.php';
    (new UserController())->update($m[1]);
}
elseif (preg_match('#^/api/users/(\d+)$#', $path, $m) && $method === 'DELETE') {
    require_once __DIR__ . '/controllers/UserController.php';
    (new UserController())->delete($m[1]);
}

// --- SUBJECT ROUTES ---
elseif ($path === '/api/subjects' && $method === 'GET') {
    require_once __DIR__ . '/controllers/SubjectController.php';
    (new SubjectController())->index();
}
elseif ($path === '/api/subjects' && $method === 'POST') {
    require_once __DIR__ . '/controllers/SubjectController.php';
    (new SubjectController())->create();
}
elseif (preg_match('#^/api/subjects/(\d+)$#', $path, $m) && $method === 'PUT') {
    require_once __DIR__ . '/controllers/SubjectController.php';
    (new SubjectController())->update($m[1]);
}
elseif (preg_match('#^/api/subjects/(\d+)$#', $path, $m) && $method === 'DELETE') {
    require_once __DIR__ . '/controllers/SubjectController.php';
    (new SubjectController())->delete($m[1]);
}

// --- CLASS RECORD ROUTES ---
elseif ($path === '/api/classes' && $method === 'GET') {
    require_once __DIR__ . '/controllers/ClassController.php';
    (new ClassController())->index();
}
elseif ($path === '/api/classes' && $method === 'POST') {
    require_once __DIR__ . '/controllers/ClassController.php';
    (new ClassController())->create();
}
elseif (preg_match('#^/api/classes/(\d+)$#', $path, $m) && $method === 'GET') {
    require_once __DIR__ . '/controllers/ClassController.php';
    (new ClassController())->show($m[1]);
}
elseif (preg_match('#^/api/classes/(\d+)$#', $path, $m) && $method === 'PUT') {
    require_once __DIR__ . '/controllers/ClassController.php';
    (new ClassController())->update($m[1]);
}
elseif (preg_match('#^/api/classes/(\d+)/enroll$#', $path, $m) && $method === 'POST') {
    require_once __DIR__ . '/controllers/ClassController.php';
    (new ClassController())->enrollStudents($m[1]);
}
elseif (preg_match('#^/api/classes/(\d+)/remove/(\d+)$#', $path, $m) && $method === 'DELETE') {
    require_once __DIR__ . '/controllers/ClassController.php';
    (new ClassController())->removeStudent($m[1], $m[2]);
}
elseif (preg_match('#^/api/classes/(\d+)/status$#', $path, $m) && $method === 'PUT') {
    require_once __DIR__ . '/controllers/ClassController.php';
    (new ClassController())->updateStatus($m[1]);
}

// --- GRADE ROUTES ---
elseif (preg_match('#^/api/grades/class/(\d+)$#', $path, $m) && $method === 'GET') {
    require_once __DIR__ . '/controllers/GradeController.php';
    (new GradeController())->getClassGrades($m[1]);
}
elseif ($path === '/api/grades/encode' && $method === 'POST') {
    require_once __DIR__ . '/controllers/GradeController.php';
    (new GradeController())->encodeScores();
}
elseif ($path === '/api/grades/attendance' && $method === 'POST') {
    require_once __DIR__ . '/controllers/GradeController.php';
    (new GradeController())->saveAttendance();
}
elseif (preg_match('#^/api/grades/compute/(\d+)$#', $path, $m) && $method === 'POST') {
    require_once __DIR__ . '/controllers/GradeController.php';
    (new GradeController())->computeGrade($m[1]);
}
elseif (preg_match('#^/api/grades/compute-class/(\d+)$#', $path, $m) && $method === 'POST') {
    require_once __DIR__ . '/controllers/GradeController.php';
    (new GradeController())->computeClassGrades($m[1]);
}
elseif ($path === '/api/grades/student' && $method === 'GET') {
    require_once __DIR__ . '/controllers/GradeController.php';
    (new GradeController())->studentGrades();
}
elseif (preg_match('#^/api/grades/component/(\d+)$#', $path, $m) && $method === 'DELETE') {
    require_once __DIR__ . '/controllers/GradeController.php';
    (new GradeController())->deleteComponent($m[1]);
}

// --- REPORT ROUTES ---
elseif (preg_match('#^/api/reports/class/(\d+)/xlsx$#', $path, $m) && $method === 'GET') {
    require_once __DIR__ . '/controllers/ReportController.php';
    (new ReportController())->classRecordXlsx($m[1]);
}
elseif (preg_match('#^/api/reports/class/(\d+)$#', $path, $m) && $method === 'GET') {
    require_once __DIR__ . '/controllers/ReportController.php';
    (new ReportController())->classReport($m[1]);
}
elseif ($path === '/api/reports/dashboard' && $method === 'GET') {
    require_once __DIR__ . '/controllers/ReportController.php';
    (new ReportController())->monitoringDashboard();
}
elseif ($path === '/api/reports/students' && $method === 'GET') {
    require_once __DIR__ . '/controllers/ReportController.php';
    (new ReportController())->studentRoster();
}
elseif (preg_match('#^/api/reports/student/(\d+)$#', $path, $m) && $method === 'GET') {
    require_once __DIR__ . '/controllers/ReportController.php';
    (new ReportController())->studentReport($m[1]);
}

// --- NOTIFICATION ROUTES ---
elseif ($path === '/api/notifications' && $method === 'GET') {
    require_once __DIR__ . '/controllers/NotificationController.php';
    (new NotificationController())->index();
}
elseif ($path === '/api/notifications/unread-count' && $method === 'GET') {
    require_once __DIR__ . '/controllers/NotificationController.php';
    (new NotificationController())->unreadCount();
}
elseif (preg_match('#^/api/notifications/(\d+)/read$#', $path, $m) && $method === 'PUT') {
    require_once __DIR__ . '/controllers/NotificationController.php';
    (new NotificationController())->markRead($m[1]);
}
elseif (preg_match('#^/api/notifications/(\d+)/request-status$#', $path, $m) && $method === 'PUT') {
    require_once __DIR__ . '/controllers/NotificationController.php';
    (new NotificationController())->updateRequestStatus($m[1]);
}
elseif ($path === '/api/notifications/read-all' && $method === 'PUT') {
    require_once __DIR__ . '/controllers/NotificationController.php';
    (new NotificationController())->markAllRead();
}

// --- AUDIT LOG ROUTES ---
elseif ($path === '/api/audit-logs' && $method === 'GET') {
    require_once __DIR__ . '/controllers/AuditController.php';
    (new AuditController())->index();
}

// --- ERROR LOG ROUTES ---
elseif ($path === '/api/error-logs' && $method === 'GET') {
    require_once __DIR__ . '/controllers/ErrorLogController.php';
    (new ErrorLogController())->index();
}
elseif ($path === '/api/error-logs' && $method === 'POST') {
    require_once __DIR__ . '/controllers/ErrorLogController.php';
    (new ErrorLogController())->store();
}

// --- SYSTEM SETTINGS ---
elseif ($path === '/api/settings' && $method === 'GET') {
    require_once __DIR__ . '/config/database.php';
    require_once __DIR__ . '/middleware/AuthMiddleware.php';
    require_once __DIR__ . '/utils/Response.php';
    AuthMiddleware::authenticate();
    $db = (new Database())->getConnection();
    $stmt = $db->query("SELECT setting_key, setting_value, description FROM system_settings");
    Response::success($stmt->fetchAll());
}
elseif ($path === '/api/settings' && $method === 'PUT') {
    require_once __DIR__ . '/config/database.php';
    require_once __DIR__ . '/middleware/AuthMiddleware.php';
    require_once __DIR__ . '/utils/Response.php';
    $auth = AuthMiddleware::authorize(['admin']);
    $data = json_decode(file_get_contents('php://input'), true);
    $db = (new Database())->getConnection();
    foreach ($data as $key => $value) {
        $db->prepare("
            INSERT INTO system_settings (setting_key, setting_value, updated_by)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE
                setting_value = VALUES(setting_value),
                updated_by = VALUES(updated_by)
        ")->execute([$key, $value, $auth['sub']]);
    }
    Response::success(null, 'Settings updated.');
}

// --- ACCOUNT REQUEST ROUTES ---
elseif ($path === '/api/account-requests' && $method === 'POST') {
    require_once __DIR__ . '/controllers/AccountRequestController.php';
    (new AccountRequestController())->store();
}
elseif ($path === '/api/account-requests' && $method === 'GET') {
    require_once __DIR__ . '/controllers/AccountRequestController.php';
    (new AccountRequestController())->index();
}
elseif (preg_match('#^/api/account-requests/(\d+)/photo$#', $path, $m) && $method === 'GET') {
    require_once __DIR__ . '/controllers/AccountRequestController.php';
    (new AccountRequestController())->photo($m[1]);
}
elseif (preg_match('#^/api/account-requests/(\d+)/approve$#', $path, $m) && $method === 'POST') {
    require_once __DIR__ . '/controllers/AccountRequestController.php';
    (new AccountRequestController())->approve($m[1]);
}
elseif (preg_match('#^/api/account-requests/(\d+)/reject$#', $path, $m) && $method === 'POST') {
    require_once __DIR__ . '/controllers/AccountRequestController.php';
    (new AccountRequestController())->reject($m[1]);
}

// --- 404 ---
else {
    require_once __DIR__ . '/utils/Response.php';
    Response::error('Endpoint not found.', 404);
}
