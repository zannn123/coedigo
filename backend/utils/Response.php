<?php
/**
 * C.O.E.D.I.G.O. - Response Utility
 */

class Response {
    public static function json($data, $statusCode = 200) {
        // Discard any buffered PHP warnings/notices that would corrupt JSON output
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        http_response_code($statusCode);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function success($data = null, $message = 'Success', $statusCode = 200) {
        self::json([
            'success' => true,
            'message' => $message,
            'data' => $data
        ], $statusCode);
    }

    public static function error($message = 'Error', $statusCode = 400, $errors = null) {
        $response = [
            'success' => false,
            'message' => $message
        ];
        if ($errors) {
            $response['errors'] = $errors;
        }
        self::json($response, $statusCode);
    }

    public static function paginated($data, $total, $page, $limit) {
        self::json([
            'success' => true,
            'data' => $data,
            'pagination' => [
                'total' => (int)$total,
                'page' => (int)$page,
                'limit' => (int)$limit,
                'total_pages' => ceil($total / $limit)
            ]
        ]);
    }
}
