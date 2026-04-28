# Database Errors - Troubleshooting Guide

Common database connection and driver issues.

---

## 🔴 "Cannot Find Driver" Error

### Error Message
```
PDOException: could not find driver
SQLSTATE[HY000]: could not find driver
```

### Cause
PHP PDO MySQL driver is not installed or not enabled.

---

## 🔧 Solutions by Platform

### Windows (XAMPP)

**Step 1: Locate php.ini**
```
C:\xampp\php\php.ini
```

**Step 2: Edit php.ini**
Find these lines:
```ini
;extension=pdo_mysql
;extension=mysqli
```

Remove the semicolons:
```ini
extension=pdo_mysql
extension=mysqli
```

**Step 3: Restart Apache**
- Open XAMPP Control Panel
- Stop Apache
- Start Apache

**Step 4: Verify**
```bash
php -m | findstr pdo_mysql
```

### Windows (WAMP)

**Step 1: Use WAMP Menu**
- Left-click WAMP icon in system tray
- PHP → PHP Extensions
- Check: `php_pdo_mysql` and `php_mysqli`

**Step 2: Restart Services**
- Left-click WAMP icon
- Restart All Services

**Step 3: Verify**
```bash
php -m | findstr pdo_mysql
```

### Linux (Ubuntu/Debian)

**Step 1: Install Extensions**
```bash
sudo apt update
sudo apt install php-mysql php-pdo
```

**For specific PHP version:**
```bash
sudo apt install php8.2-mysql
```

**Step 2: Restart Web Server**
```bash
# Apache
sudo systemctl restart apache2

# Nginx + PHP-FPM
sudo systemctl restart php8.2-fpm
sudo systemctl restart nginx
```

**Step 3: Verify**
```bash
php -m | grep pdo_mysql
```

### Linux (CentOS/RHEL/Fedora)

**Step 1: Install Extensions**
```bash
# CentOS/RHEL 7
sudo yum install php-mysqlnd php-pdo

# CentOS/RHEL 8+ / Fedora
sudo dnf install php-mysqlnd php-pdo
```

**Step 2: Restart Apache**
```bash
sudo systemctl restart httpd
```

**Step 3: Verify**
```bash
php -m | grep pdo_mysql
```

### macOS (Homebrew)

**Step 1: Install/Reinstall PHP**
```bash
brew install php@8.2
brew link php@8.2 --force
```

**Step 2: Restart Services**
```bash
brew services restart php@8.2

# If using Apache
brew services restart httpd
```

**Step 3: Verify**
```bash
php -m | grep pdo_mysql
```

---

## 🔴 "Access Denied" Error

### Error Message
```
SQLSTATE[HY000] [1045] Access denied for user 'root'@'localhost'
```

### Solutions

**Solution 1: Check Credentials**

Edit `backend/config/database.php`:
```php
private $username = "root";
private $password = "your_actual_password"; // Update this
```

**Solution 2: Reset MySQL Password**

```bash
# Stop MySQL
sudo systemctl stop mysql

# Start in safe mode
sudo mysqld_safe --skip-grant-tables &

# Connect without password
mysql -u root

# Reset password
ALTER USER 'root'@'localhost' IDENTIFIED BY 'new_password';
FLUSH PRIVILEGES;
EXIT;

# Restart MySQL normally
sudo systemctl restart mysql
```

**Solution 3: Create New User**

```sql
CREATE USER 'coedigo_user'@'localhost' IDENTIFIED BY 'secure_password';
GRANT ALL PRIVILEGES ON coedigo_db.* TO 'coedigo_user'@'localhost';
FLUSH PRIVILEGES;
```

Update `backend/config/database.php`:
```php
private $username = "coedigo_user";
private $password = "secure_password";
```

---

## 🔴 "Unknown Database" Error

### Error Message
```
SQLSTATE[HY000] [1049] Unknown database 'coedigo_db'
```

### Solution

**Step 1: Create Database**
```bash
mysql -u root -p
```

```sql
CREATE DATABASE coedigo_db 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;
EXIT;
```

**Step 2: Import Schema**
```bash
mysql -u root -p coedigo_db < database/coedigo.sql
```

**Step 3: Run Migrations**
```bash
mysql -u root -p coedigo_db < database/migration_attendance_weight.sql
```

---

## 🔴 "Connection Refused" Error

### Error Message
```
SQLSTATE[HY000] [2002] Connection refused
```

### Solutions

**Solution 1: Check MySQL is Running**

```bash
# Linux
sudo systemctl status mysql
sudo systemctl start mysql

# macOS
brew services list
brew services start mysql

# Windows (XAMPP)
# Start MySQL from XAMPP Control Panel
```

**Solution 2: Check Port**

Default MySQL port: 3306

Verify in `backend/config/database.php`:
```php
private $host = "localhost"; // or "127.0.0.1"
```

**Solution 3: Check Firewall**

```bash
# Linux - Allow MySQL port
sudo ufw allow 3306

# Check if MySQL is listening
sudo netstat -tlnp | grep 3306
```

---

## 🔴 "Too Many Connections" Error

### Error Message
```
SQLSTATE[HY000] [1040] Too many connections
```

### Solutions

**Solution 1: Increase Max Connections**

Edit MySQL config (`/etc/mysql/my.cnf` or `my.ini`):
```ini
[mysqld]
max_connections = 200
```

Restart MySQL:
```bash
sudo systemctl restart mysql
```

**Solution 2: Close Idle Connections**

```sql
SHOW PROCESSLIST;
KILL <process_id>;
```

**Solution 3: Optimize Code**

Ensure connections are properly closed in PHP:
```php
$db = null; // Close connection
```

---

## 🔴 "Column Not Found" Error

### Error Message
```
SQLSTATE[42S22]: Column not found: 1054 Unknown column 'attendance_weight'
```

### Solution

Run the migration:
```bash
mysql -u root -p coedigo_db < database/migration_attendance_weight.sql
```

Verify column exists:
```sql
SHOW COLUMNS FROM class_records LIKE 'attendance_weight';
```

---

## 🧪 Diagnostic Tools

### Test Script

Run the built-in test:
```bash
php backend/test-db.php
```

Expected output:
```
✅ ALL TESTS PASSED!
```

### Manual Tests

**Test 1: Check PHP Extensions**
```bash
php -m | grep -i pdo
php -m | grep -i mysql
```

Should show:
```
pdo_mysql
mysqli
PDO
```

**Test 2: Check MySQL Connection**
```bash
mysql -u root -p -e "SELECT 1;"
```

**Test 3: Check Database**
```bash
mysql -u root -p -e "SHOW DATABASES LIKE 'coedigo_db';"
```

**Test 4: Check Tables**
```bash
mysql -u root -p coedigo_db -e "SHOW TABLES;"
```

### PHP Info

Create `test.php`:
```php
<?php
phpinfo();
```

Access: `http://localhost:8000/test.php`

Look for:
- PDO support: enabled
- PDO drivers: mysql
- mysqli support: enabled

---

## 📝 Configuration Checklist

- [ ] PHP 8.0+ installed
- [ ] MySQL 8.0+ installed and running
- [ ] `pdo_mysql` extension enabled
- [ ] `mysqli` extension enabled
- [ ] Database `coedigo_db` created
- [ ] Schema imported
- [ ] Migrations applied
- [ ] Credentials correct in `database.php`
- [ ] MySQL port 3306 accessible
- [ ] Firewall allows MySQL connections

---

## 🔍 Debug Mode

Enable detailed error messages:

**backend/config/database.php:**
```php
public function getConnection() {
    $this->conn = null;
    try {
        $this->conn = new PDO(
            "mysql:host=" . $this->host . ";dbname=" . $this->db_name,
            $this->username,
            $this->password
        );
        $this->conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->conn->exec("set names utf8mb4");
    } catch(PDOException $exception) {
        // Show detailed error
        echo "Connection error: " . $exception->getMessage();
        echo "\nCode: " . $exception->getCode();
        echo "\nFile: " . $exception->getFile();
        echo "\nLine: " . $exception->getLine();
        die();
    }
    return $this->conn;
}
```

---

## 📚 Related Documentation

- [Installation Guide](../setup/INSTALLATION.md)
- [Configuration](../setup/CONFIGURATION.md)
- [Common Issues](COMMON_ISSUES.md)

---

## 🆘 Still Having Issues?

1. Run: `php backend/test-db.php`
2. Check: `backend/logs/app-*.log`
3. Share:
   - Error message (exact text)
   - PHP version (`php -v`)
   - MySQL version (`mysql --version`)
   - Operating system
   - Web server (XAMPP/WAMP/Apache/Nginx)

---

**Last Updated:** 2024
