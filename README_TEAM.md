# COEDIGO - Quick Start for Team

## ⚠️ Got "Cannot Find Driver" Error?

### Windows (XAMPP/WAMP) - Quick Fix

1. Open `php.ini`:
   - XAMPP: `C:\xampp\php\php.ini`
   - WAMP: `C:\wamp64\bin\php\php8.x.x\php.ini`

2. Find these lines and remove the `;`:
   ```ini
   ;extension=pdo_mysql
   ;extension=mysqli
   ```
   Change to:
   ```ini
   extension=pdo_mysql
   extension=mysqli
   ```

3. Restart Apache from XAMPP/WAMP Control Panel

4. Run test:
   ```bash
   php backend/test-db.php
   ```

### Linux - Quick Fix

```bash
sudo apt update
sudo apt install php-mysql php-pdo
sudo systemctl restart apache2
```

### macOS - Quick Fix

```bash
brew install php
brew services restart php
```

---

## 🚀 Setup Steps

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd COEDIGO
```

### 2. Database Setup

```bash
# Create database
mysql -u root -p
CREATE DATABASE coedigo_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;

# Import schema
mysql -u root -p coedigo_db < database/coedigo.sql

# Run migration (IMPORTANT!)
mysql -u root -p coedigo_db < database/migration_attendance_weight.sql

# Optional: Demo data
mysql -u root -p coedigo_db < database/seed_demo_data.sql
```

### 3. Backend Config

Edit `backend/config/database.php` if needed:
```php
private $username = "root";
private $password = ""; // Your MySQL password
```

### 4. Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
```

Edit `frontend/.env`:
```env
VITE_API_URL=http://localhost:8000/api
```

### 5. Start Servers

**Terminal 1 (Backend):**
```bash
cd backend
php -S localhost:8000
```

**Terminal 2 (Frontend):**
```bash
cd frontend
npm run dev
```

### 6. Access

- Frontend: http://localhost:5173
- Login: `admin@jrmsu.edu.ph` / `admin123`

---

## ✅ Verify Setup

Run this test:
```bash
php backend/test-db.php
```

Should show:
```
✅ ALL TESTS PASSED!
```

---

## 📝 Common Issues

### "Access denied for user 'root'"
→ Update password in `backend/config/database.php`

### "Unknown database 'coedigo_db'"
→ Run database creation commands above

### "attendance_weight column missing"
→ Run migration: `mysql -u root -p coedigo_db < database/migration_attendance_weight.sql`

### Port 8000 already in use
→ Use different port: `php -S localhost:8080`
→ Update `frontend/.env` to match

---

## 📚 Full Documentation

- **Setup Guide**: `SETUP_GUIDE.md`
- **Attendance Feature**: `ATTENDANCE_WEIGHT_FEATURE.md`
- **Troubleshooting**: `TROUBLESHOOTING_SAVE_SCORES.md`

---

## 🆘 Need Help?

1. Run: `php backend/test-db.php`
2. Share the output
3. Check `backend/logs/app-*.log`
4. Open browser console (F12) for frontend errors

---

## 🎯 Development Workflow

1. Pull latest changes: `git pull`
2. Check for new migrations in `database/`
3. Run migrations if any
4. Restart servers
5. Test your changes
6. Commit and push

---

## 📦 Project Structure

```
COEDIGO/
├── backend/
│   ├── config/         # Database config
│   ├── controllers/    # API endpoints
│   ├── logs/          # Error logs
│   └── test-db.php    # Connection test
├── frontend/
│   ├── src/
│   │   ├── pages/     # React pages
│   │   └── services/  # API calls
│   └── .env           # API URL config
├── database/
│   ├── coedigo.sql    # Main schema
│   └── migration_*.sql # Updates
└── README_TEAM.md     # This file
```

---

## 🔧 Tech Stack

- **Backend**: PHP 8.0+, MySQL 8.0+
- **Frontend**: React 18, Vite, React Router
- **Server**: PHP Built-in / Apache
- **Database**: MySQL / MariaDB

---

## ✨ New Features

### Attendance Weight Customization
Faculty can now set attendance contribution (0-100%) to Performance Tasks.

**How to use:**
1. Open any gradebook
2. Click "Customize" on attendance banner
3. Adjust slider (0-100%)
4. Save

**Migration required:**
```bash
mysql -u root -p coedigo_db < database/migration_attendance_weight.sql
```

---

Happy coding! 🚀
