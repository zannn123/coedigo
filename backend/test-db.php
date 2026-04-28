<?php
/**
 * Database Connection Test Script
 * Run this to verify PHP MySQL drivers are installed
 */

echo "===========================================\n";
echo "COEDIGO Database Connection Test\n";
echo "===========================================\n\n";

// Check PHP version
echo "1. Checking PHP version...\n";
$phpVersion = phpversion();
echo "   PHP Version: $phpVersion\n";
if (version_compare($phpVersion, '8.0.0', '<')) {
    echo "   ⚠️  WARNING: PHP 8.0+ recommended\n";
} else {
    echo "   ✓ PHP version OK\n";
}
echo "\n";

// Check PDO extension
echo "2. Checking PDO extension...\n";
if (extension_loaded('PDO')) {
    echo "   ✓ PDO extension is loaded\n";
} else {
    echo "   ❌ ERROR: PDO extension not found!\n";
    echo "   Fix: Enable 'extension=pdo' in php.ini\n";
    exit(1);
}
echo "\n";

// Check PDO MySQL driver
echo "3. Checking PDO MySQL driver...\n";
if (extension_loaded('pdo_mysql')) {
    echo "   ✓ PDO MySQL driver is loaded\n";
} else {
    echo "   ❌ ERROR: PDO MySQL driver not found!\n";
    echo "\n";
    echo "   Fix for Windows (XAMPP/WAMP):\n";
    echo "   1. Open php.ini file\n";
    echo "   2. Find line: ;extension=pdo_mysql\n";
    echo "   3. Remove semicolon: extension=pdo_mysql\n";
    echo "   4. Restart Apache\n";
    echo "\n";
    echo "   Fix for Linux:\n";
    echo "   sudo apt install php-mysql php-pdo\n";
    echo "   sudo systemctl restart apache2\n";
    echo "\n";
    echo "   Fix for macOS:\n";
    echo "   brew install php\n";
    echo "   brew services restart php\n";
    exit(1);
}
echo "\n";

// Check available PDO drivers
echo "4. Available PDO drivers:\n";
$drivers = PDO::getAvailableDrivers();
foreach ($drivers as $driver) {
    echo "   - $driver\n";
}
if (!in_array('mysql', $drivers)) {
    echo "   ❌ ERROR: MySQL driver not in available drivers list!\n";
    exit(1);
}
echo "\n";

// Test database connection
echo "5. Testing database connection...\n";
require_once __DIR__ . '/config/database.php';

try {
    $database = new Database();
    $db = $database->getConnection();
    
    if ($db) {
        echo "   ✓ Database connection successful\n";
        echo "\n";
        
        // Test query
        echo "6. Testing database query...\n";
        $stmt = $db->query("SELECT COUNT(*) as count FROM users");
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        echo "   ✓ Found {$result['count']} users in database\n";
        echo "\n";
        
        // Check for attendance_weight column
        echo "7. Checking database schema...\n";
        try {
            $stmt = $db->query("SHOW COLUMNS FROM class_records LIKE 'attendance_weight'");
            $column = $stmt->fetch();
            if ($column) {
                echo "   ✓ attendance_weight column exists\n";
            } else {
                echo "   ⚠️  WARNING: attendance_weight column missing\n";
                echo "   Run: mysql -u root -p coedigo_db < database/migration_attendance_weight.sql\n";
            }
        } catch (Exception $e) {
            echo "   ⚠️  Could not check schema: " . $e->getMessage() . "\n";
        }
        echo "\n";
        
        echo "===========================================\n";
        echo "✅ ALL TESTS PASSED!\n";
        echo "===========================================\n";
        echo "Your system is ready to run COEDIGO.\n";
        echo "\n";
        echo "Next steps:\n";
        echo "1. Start backend: php -S localhost:8000\n";
        echo "2. Start frontend: cd frontend && npm run dev\n";
        echo "3. Access: http://localhost:5173\n";
        echo "\n";
    }
} catch (PDOException $e) {
    echo "   ❌ ERROR: " . $e->getMessage() . "\n";
    echo "\n";
    echo "Common fixes:\n";
    echo "1. Check MySQL is running\n";
    echo "2. Verify database credentials in backend/config/database.php\n";
    echo "3. Create database: CREATE DATABASE coedigo_db;\n";
    echo "4. Import schema: mysql -u root -p coedigo_db < database/coedigo.sql\n";
    exit(1);
} catch (Exception $e) {
    echo "   ❌ ERROR: " . $e->getMessage() . "\n";
    exit(1);
}
