<?php
/**
 * C.O.E.D.I.G.O. - Authentication Middleware
 * JWT-based authentication and role-based access control
 */

class AuthMiddleware {
    private static $secretKey = 'coedigo_jrmsu_2025_secret_key_change_in_production';
    private static $algorithm = 'HS256';
    private static $expiry = 86400; // 24 hours

    /**
     * Generate a JWT token
     */
    public static function generateToken($userId, $role, $email) {
        $header = self::base64UrlEncode(json_encode([
            'typ' => 'JWT',
            'alg' => self::$algorithm
        ]));

        $payload = self::base64UrlEncode(json_encode([
            'iss' => 'coedigo',
            'sub' => $userId,
            'role' => $role,
            'email' => $email,
            'iat' => time(),
            'exp' => time() + self::$expiry
        ]));

        $signature = self::base64UrlEncode(
            hash_hmac('sha256', "$header.$payload", self::$secretKey, true)
        );

        return "$header.$payload.$signature";
    }

    /**
     * Validate and decode JWT token
     */
    public static function validateToken($token) {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        list($header, $payload, $signature) = $parts;

        $validSignature = self::base64UrlEncode(
            hash_hmac('sha256', "$header.$payload", self::$secretKey, true)
        );

        if (!hash_equals($validSignature, $signature)) {
            return null;
        }

        $decoded = json_decode(self::base64UrlDecode($payload), true);

        if (!$decoded || !isset($decoded['exp']) || $decoded['exp'] < time()) {
            return null;
        }

        return $decoded;
    }

    /**
     * Authenticate request - extracts and validates token
     */
    public static function authenticate() {
        $token = self::getBearerToken();
        if (!$token) {
            require_once __DIR__ . '/../utils/Response.php';
            Response::error('Authentication required. Please provide a valid token.', 401);
        }

        $decoded = self::validateToken($token);
        if (!$decoded) {
            require_once __DIR__ . '/../utils/Response.php';
            Response::error('Invalid or expired token. Please login again.', 401);
        }

        require_once __DIR__ . '/../config/database.php';
        require_once __DIR__ . '/../utils/Response.php';

        try {
            $db = (new Database())->getConnection();
            $stmt = $db->prepare("SELECT is_active FROM users WHERE id = ?");
            $stmt->execute([$decoded['sub']]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);

            if (!$user || (int)$user['is_active'] !== 1) {
                Response::error('Account disabled. Please contact your program chair or the College of Engineering faculty office.', 401);
            }
        } catch (Exception $e) {
            Response::error('Authentication check failed. Please login again.', 401);
        }

        return $decoded;
    }

    /**
     * Authorize by role(s)
     */
    public static function authorize($allowedRoles) {
        $user = self::authenticate();
        if (!in_array($user['role'], $allowedRoles)) {
            require_once __DIR__ . '/../utils/Response.php';
            Response::error('Access denied. Insufficient permissions.', 403);
        }
        return $user;
    }

    /**
     * Extract Bearer token from Authorization header
     */
    private static function getBearerToken() {
        $headers = null;

        if (isset($_SERVER['Authorization'])) {
            $headers = trim($_SERVER['Authorization']);
        } elseif (isset($_SERVER['HTTP_AUTHORIZATION'])) {
            $headers = trim($_SERVER['HTTP_AUTHORIZATION']);
        } elseif (function_exists('apache_request_headers')) {
            $requestHeaders = apache_request_headers();
            $requestHeaders = array_combine(
                array_map('ucwords', array_keys($requestHeaders)),
                array_values($requestHeaders)
            );
            if (isset($requestHeaders['Authorization'])) {
                $headers = trim($requestHeaders['Authorization']);
            }
        }

        if ($headers && preg_match('/Bearer\s(\S+)/', $headers, $matches)) {
            return $matches[1];
        }

        // Fallback: token in query string (for image/file endpoints)
        if (isset($_GET['token']) && $_GET['token'] !== '') {
            return $_GET['token'];
        }

        return null;
    }

    private static function base64UrlEncode($data) {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function base64UrlDecode($data) {
        return base64_decode(str_pad(strtr($data, '-_', '+/'), strlen($data) % 4, '=', STR_PAD_RIGHT));
    }
}
