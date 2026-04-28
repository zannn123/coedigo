# Setup Guide - Fix "Cannot Find Driver" Error

## Problem
Error: `could not find driver` or `PDOException: could not find driver`

This means PHP doesn't have the MySQL/MariaDB driver installed.

---

## Quick Fix (Choose Your System)

### Windows (XAMPP/WAMP)

1. **Open `php.ini` file**
   - XAMPP: `C:\xampp\php\php.ini`
   - WAMP: `C:\wamp64\bin\php\php8.x.x\php.ini`

2. **Find and uncomment these lines** (remove the `;` at the start):
   ```ini
   ;extension=pdo_mysql
   ;extension=mysqli
   ```
   
   Should become:
   ```ini
   extension=pdo_mysql
   extension=mysqli
   ```

3. **Restart Apache** from XAMPP/WAMP Control Panel

4. **Verify** - Create `test.php`:
   ```php
   <?php
   phpinfo();
   ```
   Look for "pdo_mysql" in the output

---

### macOS (Homebrew PHP)

1. **Check PHP version**:
   ```bash
   php -v
   ```

2. **Install MySQL extension**:
   ```bash
   brew install php@8.2
   brew link php@8.2
   ```

3. **Restart Apache/PHP-FPM**:
   ```bash
   brew services restart php@8.2
   ```

---

### Linux (Ubuntu/Debian)

1. **Install PHP MySQL extension**:
   ```bash
   sudo apt update
   sudo apt install php-mysql php-pdo
   ```

2. **For specific PHP version** (e.g., PHP 8.2):
   ```bash
   sudo apt install php8.2-mysql
   ```

3. **Restart Apache/Nginx**:
   ```bash
   sudo systemctl restart apache2
   # OR
   sudo systemctl restart nginx
   sudo systemctl restart php8.2-fpm
   ```

---

### Linux (CentOS/RHEL/Fedora)

1. **Install PHP MySQL extension**:
   ```bash
   sudo yum install php-mysqlnd php-pdo
   # OR for newer versions
   sudo dnf install php-mysqlnd php-pdo
   ```

2. **Restart Apache**:
   ```bash
   sudo systemctl restart httpd
   ```

---

## Complete Setup Instructions for Team

### 1. Clone Repository
```bash
git clone https://github.com/your-username/COEDIGO.git
cd COEDIGO
```

### 2. Database Setup

**Create Database:**
```bash
mysql -u root -p
```

```sql
CREATE DATABASE coedigo_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;
```

**Import Schema:**
```bash
mysql -u root -p coedigo_db < database/coedigo.sql
```

**Run Migration (for attendance_weight):**
```bash
mysql -u root -p coedigo_db < database/migration_attendance_weight.sql
```

**Optional - Import Demo Data:**
```bash
mysql -u root -p coedigo_db < database/seed_demo_data.sql
```

### 3. Backend Configuration

**Copy environment file:**
```bash
cd backend
cp .env.example .env
```

**Edit `backend/config/database.php`** (if needed):
```php
<?php
class Database {
    private $host = "localhost";
    private $db_name = "coedigo_db";
    private $username = "root";
    private $password = ""; // Your MySQL password
    private $conn;

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
            echo "Connection error: " . $exception->getMessage();
        }
        return $this->conn;
    }
}
```

### 4. Frontend Setup

```bash
cd frontend
npm install
```

**Copy environment file:**
```bash
cp .env.example .env
```

**Edit `frontend/.env`:**
```env
VITE_API_URL=http://localhost:8000/api
```

### 5. Start Servers

**Backend (Terminal 1):**
```bash
cd backend
php -S localhost:8000
```

**Frontend (Terminal 2):**
```bash
cd frontend
npm run dev
```

### 6. Access Application

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000/api

**Default Login:**
- Email: `admin@jrmsu.edu.ph`
- Password: `admin123`

---

## Verify PHP Extensions

**Check if extensions are loaded:**
```bash
php -m | grep -i pdo
php -m | grep -i mysql
```

**Should show:**
```
pdo_mysql
mysqli
PDO
```

**Or check via PHP:**
```php
<?php
if (extension_loaded('pdo_mysql')) {
    echo "PDO MySQL driver is installed!";
} else {
    echo "PDO MySQL driver is NOT installed!";
}
```

---

## Common Issues & Solutions

### Issue 1: "Access denied for user 'root'@'localhost'"
**Solution:** Update MySQL password in `backend/config/database.php`

### Issue 2: "Unknown database 'coedigo_db'"
**Solution:** Run database creation and import commands above

### Issue 3: Port 8000 already in use
**Solution:** Use different port:
```bash
php -S localhost:8080
```
Update `frontend/.env` to match

### Issue 4: CORS errors in browser
**Solution:** Check `backend/.htaccess` has CORS headers

### Issue 5: npm install fails
**Solution:**
```bash
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

---

## Team Checklist

Before starting development, verify:

- [ ] PHP 8.0+ installed
- [ ] MySQL/MariaDB installed and running
- [ ] Node.js 16+ installed
- [ ] `pdo_mysql` extension enabled
- [ ] Database created and imported
- [ ] Migration run (attendance_weight)
- [ ] Backend `.env` configured
- [ ] Frontend `.env` configured
- [ ] Both servers running
- [ ] Can access login page
- [ ] Can login with default admin account

---

## Quick Test Script

Create `backend/test-db.php`:
```php
<?php
require_once __DIR__ . '/config/database.php';

echo "Testing database connection...\n\n";

// Check PDO MySQL driver
if (!extension_loaded('pdo_mysql')) {
    die("ERROR: PDO MySQL driver not installed!\n");
}
echo "✓ PDO MySQL driver is installed\n";

// Test connection
try {
    $database = new Database();
    $db = $database->getConnection();
    
    if ($db) {
        echo "✓ Database connection successful\n";
        
        // Test query
        $stmt = $db->query("SELECT COUNT(*) as count FROM users");
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        echo "✓ Found {$result['count']} users in database\n";
        
        echo "\n✅ All tests passed! System is ready.\n";
    }
} catch (Exception $e) {
    echo "❌ ERROR: " . $e->getMessage() . "\n";
}
```

**Run test:**
```bash
php backend/test-db.php
```

---

## Need Help?

If still having issues:

1. **Share error message** (exact text)
2. **Share PHP version**: `php -v`
3. **Share OS**: Windows/macOS/Linux
4. **Share server**: XAMPP/WAMP/MAMP/Native
5. **Check logs**: `backend/logs/app-*.log`

---

## Additional Resources

- [PHP PDO Documentation](https://www.php.net/manual/en/book.pdo.php)
- [XAMPP Setup Guide](https://www.apachefriends.org/)
- [MySQL Installation](https://dev.mysql.com/doc/mysql-installation-excerpt/8.0/en/)
