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

            $payload = [
                'time' => $timestamp,
                'level' => $level,
                'event' => $event,
                'context' => self::sanitize($context),
            ];

            file_put_contents(
                $filePath,
                json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . PHP_EOL,
                FILE_APPEND | LOCK_EX
            );
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
