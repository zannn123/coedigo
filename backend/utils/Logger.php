<?php
/**
 * C.O.E.D.I.G.O. - File Logger
 * Writes backend events and failures to daily log files.
 */

class Logger {
    public static function info($event, array $context = []) {
        self::write('INFO', $event, $context);
    }

    public static function error($event, array $context = []) {
        self::write('ERROR', $event, $context);
    }

    private static function write($level, $event, array $context = []) {
        try {
            $logDirectory = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'logs';
            if (!is_dir($logDirectory)) {
                mkdir($logDirectory, 0777, true);
            }

            $timestamp = date('Y-m-d H:i:s');
            $filePath = $logDirectory . DIRECTORY_SEPARATOR . 'app-' . date('Y-m-d') . '.log';
            $sanitizedContext = self::sanitize($context);

            $payload = [
                'time' => $timestamp,
                'level' => $level,
                'event' => $event,
                'context' => $sanitizedContext,
            ];

            file_put_contents(
                $filePath,
                json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL,
                FILE_APPEND | LOCK_EX
            );

            // If it's an error, save to database
            if ($level === 'ERROR') {
                require_once __DIR__ . '/../config/database.php';
                $db = (new Database())->getConnection();
                
                // Ensure table exists
                $db->exec("CREATE TABLE IF NOT EXISTS system_errors (id INT AUTO_INCREMENT PRIMARY KEY, source ENUM('frontend', 'backend') NOT NULL, message TEXT NOT NULL, context JSON DEFAULT NULL, user_id INT DEFAULT NULL, url VARCHAR(255) DEFAULT NULL, user_agent VARCHAR(255) DEFAULT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, INDEX idx_source (source), INDEX idx_created (created_at), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL) ENGINE=InnoDB");
                
                $stmt = $db->prepare("INSERT INTO system_errors (source, message, context, user_id, url, user_agent) VALUES ('backend', ?, ?, ?, ?, ?)");
                $stmt->execute([
                    $event,
                    json_encode($sanitizedContext),
                    $sanitizedContext['admin_id'] ?? $sanitizedContext['user_id'] ?? null,
                    $_SERVER['REQUEST_URI'] ?? null,
                    $_SERVER['HTTP_USER_AGENT'] ?? null
                ]);
            }
        } catch (Throwable $e) {
            error_log('[COEDIGO LOGGER FAILURE] ' . $e->getMessage());
        }
    }

    private static function sanitize(array $context) {
        $sensitiveKeys = [
            'password',
            'temporary_password',
            'plainPassword',
            'password_hash',
            'api_key',
            'authorization',
            'smtp_password',
            'gmail_app_password',
        ];

        foreach ($context as $key => $value) {
            if (in_array((string)$key, $sensitiveKeys, true)) {
                $context[$key] = '[REDACTED]';
                continue;
            }

            if (is_array($value)) {
                $context[$key] = self::sanitize($value);
            }
        }

        return $context;
    }
}
