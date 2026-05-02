# XAMPP Windows Setup

This guide documents the local XAMPP setup used for COEDIGO on Windows.

---

## Current Local Setup

```text
XAMPP path: C:\Program Files\Xaamp
Apache URL: http://localhost/
phpMyAdmin: http://localhost/phpmyadmin/
MySQL host: localhost
MySQL port: 3306
MySQL user: root
MySQL password: blank
COEDIGO database: coedigo_db
```

The XAMPP PHP and MySQL folders were added to the user PATH:

```text
C:\Program Files\Xaamp\php
C:\Program Files\Xaamp\mysql\bin
```

Open a new terminal before expecting `php`, `mysql`, or `mysqladmin` to work without full paths.

---

## Daily Start

Use one command from the project root:

```powershell
cd frontend
npm run dev:fullstack
```

That command runs:

1. `scripts/start-xampp.ps1`
2. `scripts/start-backend.ps1`
3. Vite frontend dev server

Expected URLs:

```text
Application: http://localhost:5173
Backend API: http://localhost:8000/api
phpMyAdmin: http://localhost/phpmyadmin/
```

You can also start XAMPP only:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-xampp.ps1
```

---

## Verify Database

From the project root:

```powershell
php backend\test-db.php
```

Expected result:

```text
ALL TESTS PASSED
```

If `php` is not recognized, either open a new terminal or use the full XAMPP PHP path:

```powershell
& 'C:\Program Files\Xaamp\php\php.exe' backend\test-db.php
```

---

## What Was Fixed

Two separate issues blocked phpMyAdmin.

### 1. Apache Was On Port 8080

Apache was configured with:

```text
Listen 8080
ServerName localhost:8080
```

That made `http://localhost/phpmyadmin` fail because port `80` was closed. Apache was moved back to the default port:

```text
Listen 80
ServerName localhost:80
```

Backup created:

```text
C:\Program Files\Xaamp\apache\conf\httpd.conf.bak-20260430-030825
```

### 2. MariaDB Could Not Complete Login Handshake

MySQL/MariaDB was listening on port `3306`, but clients failed with:

```text
Lost connection to MySQL server at 'handshake: reading initial communication packet'
```

The console startup error was:

```text
Table '.\mysql\db' is marked as crashed and last (automatic?) repair failed
Fatal error: Can't open and lock privilege tables
```

There was also an InnoDB redo log mismatch:

```text
The log sequence number ... in the system tablespace does not match ... in the ib_logfiles
```

Repair performed:

1. Stopped the hung `mysqld.exe`.
2. Backed up the full MySQL data folder.
3. Renamed `ib_logfile0` and `ib_logfile1` so MariaDB could recreate them.
4. Repaired the crashed `mysql.db` privilege table with `aria_chk --recover`.

Backup created:

```text
C:\Users\DjMhel\Documents\COEDIGO_MYSQL_BACKUPS\mysql-data-20260430-030445
```

---

## If phpMyAdmin Hangs Again

First check whether MySQL is actually ready:

```powershell
mysqladmin -uroot ping
```

If it says `mysqld is alive`, phpMyAdmin should load. If it fails at handshake, check the MariaDB error log:

```powershell
Get-Content -Tail 80 'C:\Program Files\Xaamp\mysql\data\mysql_error.log'
```

If the log says `mysql\db` is crashed, stop MySQL, back up the data folder, then repair:

```powershell
Get-Process mysqld -ErrorAction SilentlyContinue | Stop-Process -Force

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item 'C:\Program Files\Xaamp\mysql\data' "C:\Users\DjMhel\Documents\COEDIGO_MYSQL_BACKUPS\mysql-data-$stamp" -Recurse

Push-Location 'C:\Program Files\Xaamp\mysql\data'
& 'C:\Program Files\Xaamp\mysql\bin\aria_chk.exe' --recover 'mysql\db.MAI'
Pop-Location
```

Then start XAMPP again:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-xampp.ps1
```

---

## Prevent Repeat Problems

- Shut down XAMPP from the control panel before powering off or restarting Windows.
- Do not open multiple XAMPP Control Panel windows.
- Avoid manually copying files into `C:\Program Files\Xaamp\mysql\data` while MySQL is running.
- Keep SQL exports for important work:

```powershell
mysqldump -u root coedigo_db > database\coedigo_db_backup.sql
```
