# Installation Guide

Complete installation instructions for all platforms.

---

## 📋 System Requirements

### Minimum Requirements
- **PHP:** 8.0 or higher
- **MySQL:** 8.0 or higher (or MariaDB 10.5+)
- **Node.js:** 16.0 or higher
- **npm:** 8.0 or higher
- **RAM:** 2GB minimum
- **Storage:** 500MB free space

### Recommended
- **PHP:** 8.2+
- **MySQL:** 8.0+
- **Node.js:** 18 LTS
- **RAM:** 4GB+
- **Storage:** 1GB+

---

## 🖥️ Platform-Specific Setup

### Windows (XAMPP)

#### 1. Install XAMPP
Download from: https://www.apachefriends.org/

#### 2. Enable PHP Extensions
Edit `C:\xampp\php\php.ini`:
```ini
extension=pdo_mysql
extension=mysqli
extension=mbstring
extension=openssl
```

#### 3. Restart Apache
Open XAMPP Control Panel → Stop/Start Apache

#### 4. Verify
```bash
php -v
php -m | findstr pdo_mysql
```

### Windows (WAMP)

#### 1. Install WAMP
Download from: https://www.wampserver.com/

#### 2. Enable Extensions
Left-click WAMP icon → PHP → PHP Extensions → Check:
- php_pdo_mysql
- php_mysqli
- php_mbstring

#### 3. Restart Services
Left-click WAMP icon → Restart All Services

### Linux (Ubuntu/Debian)

#### 1. Install PHP & Extensions
```bash
sudo apt update
sudo apt install php8.2 php8.2-mysql php8.2-mbstring php8.2-xml php8.2-curl
```

#### 2. Install MySQL
```bash
sudo apt install mysql-server
sudo mysql_secure_installation
```

#### 3. Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install nodejs
```

#### 4. Verify
```bash
php -v
mysql --version
node -v
npm -v
```

### macOS (Homebrew)

#### 1. Install Homebrew
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

#### 2. Install PHP
```bash
brew install php@8.2
brew link php@8.2
```

#### 3. Install MySQL
```bash
brew install mysql
brew services start mysql
```

#### 4. Install Node.js
```bash
brew install node@18
```

#### 5. Verify
```bash
php -v
mysql --version
node -v
```

---

## 📦 Project Installation

### 1. Clone Repository

```bash
git clone <repository-url>
cd COEDIGO
```

### 2. Database Setup

#### Create Database
```bash
mysql -u root -p
```

```sql
CREATE DATABASE coedigo_db 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

-- Create user (optional)
CREATE USER 'coedigo_user'@'localhost' IDENTIFIED BY 'secure_password';
GRANT ALL PRIVILEGES ON coedigo_db.* TO 'coedigo_user'@'localhost';
FLUSH PRIVILEGES;

EXIT;
```

#### Import Schema
```bash
# Main schema
mysql -u root -p coedigo_db < database/coedigo.sql

# Migrations
mysql -u root -p coedigo_db < database/migration_attendance_weight.sql

# Demo data (optional)
mysql -u root -p coedigo_db < database/seed_demo_data.sql
```

### 3. Backend Configuration

#### Option A: Edit database.php directly
Edit `backend/config/database.php`:
```php
<?php
class Database {
    private $host = "localhost";
    private $db_name = "coedigo_db";
    private $username = "root";
    private $password = "your_password_here";
    // ... rest of the file
}
```

#### Option B: Use environment variables (recommended)
Create `backend/.env`:
```env
DB_HOST=localhost
DB_NAME=coedigo_db
DB_USER=root
DB_PASS=your_password
```

### 4. Frontend Configuration

```bash
cd frontend
npm install
```

Copy environment file:
```bash
cp .env.example .env
```

Edit `frontend/.env`:
```env
VITE_API_URL=http://localhost:8000/api
```

### 5. Verify Installation

Run test script:
```bash
php backend/test-db.php
```

Expected output:
```
===========================================
COEDIGO Database Connection Test
===========================================

1. Checking PHP version...
   PHP Version: 8.2.x
   ✓ PHP version OK

2. Checking PDO extension...
   ✓ PDO extension is loaded

3. Checking PDO MySQL driver...
   ✓ PDO MySQL driver is loaded

4. Available PDO drivers:
   - mysql
   - sqlite

5. Testing database connection...
   ✓ Database connection successful

6. Testing database query...
   ✓ Found 1 users in database

7. Checking database schema...
   ✓ attendance_weight column exists

===========================================
✅ ALL TESTS PASSED!
===========================================
```

---

## 🚀 Running the Application

### Development Mode

#### Start Backend (Terminal 1)
```bash
cd backend
php -S localhost:8000
```

#### Start Frontend (Terminal 2)
```bash
cd frontend
npm run dev
```

#### Access Application
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000/api

### Production Mode

#### Build Frontend
```bash
cd frontend
npm run build
```

#### Serve with Apache/Nginx
Configure your web server to:
- Serve `frontend/dist` as document root
- Proxy `/api` requests to PHP backend

Example Apache config:
```apache
<VirtualHost *:80>
    ServerName coedigo.local
    DocumentRoot /path/to/COEDIGO/frontend/dist
    
    <Directory /path/to/COEDIGO/frontend/dist>
        AllowOverride All
        Require all granted
    </Directory>
    
    ProxyPass /api http://localhost:8000/api
    ProxyPassReverse /api http://localhost:8000/api
</VirtualHost>
```

---

## 🔐 Security Setup

### 1. Change Default Password
Login as admin and change password immediately:
- Email: `admin@jrmsu.edu.ph`
- Default Password: `admin123`

### 2. Update Database Credentials
Use strong passwords for database users.

### 3. Configure CORS
Edit `backend/.htaccess` for production domains.

### 4. Enable HTTPS
Use SSL certificates in production.

---

## 📊 Post-Installation

### 1. System Settings
Login as admin → Settings → Configure:
- Institution name
- Academic year
- Grading weights
- Email settings

### 2. Create Users
Admin → Users → Add:
- Faculty accounts
- Student accounts
- Dean/Program Chair accounts

### 3. Create Subjects
Admin → Subjects → Add course catalog

### 4. Create Classes
Faculty → Classes → Create class records

---

## 🧪 Testing Installation

### Test Checklist
- [ ] PHP version 8.0+
- [ ] MySQL running
- [ ] PDO MySQL driver enabled
- [ ] Database created and imported
- [ ] Migration applied
- [ ] Backend starts without errors
- [ ] Frontend builds successfully
- [ ] Can access login page
- [ ] Can login with admin account
- [ ] Can navigate all pages
- [ ] Can create test class
- [ ] Can enroll test student
- [ ] Can encode test scores

### Test Script
```bash
# Run comprehensive test
php backend/test-db.php

# Test API endpoint
curl http://localhost:8000/api/health

# Test frontend build
cd frontend && npm run build
```

---

## 🐛 Troubleshooting

### Installation fails
→ Check [Common Issues](../troubleshooting/COMMON_ISSUES.md)

### Database connection fails
→ Check [Database Errors](../troubleshooting/DATABASE_ERRORS.md)

### Frontend won't start
→ Delete `node_modules`, run `npm install` again

### Backend errors
→ Check `backend/logs/app-*.log`

---

## 📚 Next Steps

- [Configuration Guide](CONFIGURATION.md)
- [User Roles](../features/USER_ROLES.md)
- [API Documentation](../api/README.md)
- [Architecture Overview](../architecture/SYSTEM_OVERVIEW.md)

---

## 🆘 Getting Help

1. Run: `php backend/test-db.php`
2. Check logs: `backend/logs/`
3. Review: [Troubleshooting](../troubleshooting/)
4. Open browser console (F12)

---

**Installation complete!** 🎉

Access your application at: http://localhost:5173
