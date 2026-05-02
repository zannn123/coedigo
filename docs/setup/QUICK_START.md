# Quick Start Guide

Get COEDIGO running in 5 minutes.

---

## ⚡ Prerequisites Check

```bash
# Check PHP version (need 8.0+)
php -v

# Check MySQL
mysql --version

# Check Node.js (need 16+)
node -v
npm -v
```

---

## 🚀 5-Minute Setup

### Step 1: Clone & Navigate (30 seconds)

```bash
git clone <repository-url>
cd COEDIGO
```

### Step 2: Database Setup (2 minutes)

```bash
# Create database
mysql -u root -p
```

```sql
CREATE DATABASE coedigo_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;
```

```bash
# Import schema
mysql -u root -p coedigo_db < database/coedigo.sql

# Run migration
mysql -u root -p coedigo_db < database/migration_attendance_weight.sql

# Optional: Demo data
mysql -u root -p coedigo_db < database/seed_demo_data.sql
```

### Step 3: Backend Config (30 seconds)

Edit `backend/config/database.php`:
```php
private $username = "root";
private $password = "your_password"; // Change this
```

### Step 4: Frontend Setup (1 minute)

```bash
cd frontend
npm install
cp .env.example .env
```

Edit `frontend/.env`:
```env
VITE_API_URL=http://localhost:8000/api
```

### Step 5: Start Servers (30 seconds)

**Windows + XAMPP - one command:**
```powershell
cd frontend
npm run dev:fullstack
```

This checks XAMPP, starts the backend, then starts the frontend. phpMyAdmin is available at:
```text
http://localhost/phpmyadmin/
```

**Terminal 1 - Backend:**
```bash
cd backend
php -S localhost:8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

### Step 6: Access & Login (30 seconds)

1. Open: http://localhost:5173
2. Login:
   - Email: `admin@jrmsu.edu.ph`
   - Password: `admin123`

---

## ✅ Verify Installation

Run the test script:
```bash
php backend/test-db.php
```

Should show:
```
✅ ALL TESTS PASSED!
```

---

## 🎯 What's Next?

### For Development
1. Read [Installation Guide](INSTALLATION.md) for details
2. Check [Configuration](CONFIGURATION.md) for customization
3. Review [Architecture](../architecture/SYSTEM_OVERVIEW.md)

### For Testing
1. Login as admin
2. Create a test class
3. Enroll test students
4. Try encoding grades

### Demo Accounts (if you imported seed data)
- **Admin:** `admin@jrmsu.edu.ph` / `admin123`
- **Faculty:** `faculty@jrmsu.edu.ph` / `faculty123`
- **Student:** `student@jrmsu.edu.ph` / `student123`

---

## 🐛 Common Issues

### "Cannot find driver"
→ See [Database Errors](../troubleshooting/DATABASE_ERRORS.md)

### phpMyAdmin will not load
→ See [XAMPP Windows Setup](XAMPP_WINDOWS.md)

### "Access denied"
→ Check MySQL password in `backend/config/database.php`

### "Unknown database"
→ Run database creation commands above

### Port already in use
→ Use different port: `php -S localhost:8080`

---

## 📚 Learn More

- [Full Installation Guide](INSTALLATION.md)
- [Configuration Options](CONFIGURATION.md)
- [Troubleshooting](../troubleshooting/COMMON_ISSUES.md)

---

**Need help?** Run `php backend/test-db.php` and share the output.
