param(
    [int]$ApachePort = 80,
    [int]$MySqlPort = 3306
)

$ErrorActionPreference = 'Stop'

$xamppCandidates = @(
    'C:\Program Files\Xaamp',
    'C:\Program Files\XAMPP',
    'C:\xampp'
)

$xamppRoot = $xamppCandidates | Where-Object { Test-Path (Join-Path $_ 'xampp-control.exe') } | Select-Object -First 1
if (-not $xamppRoot) {
    Write-Error 'XAMPP was not found. Expected C:\Program Files\Xaamp or C:\xampp.'
    exit 1
}

$apacheExe = Join-Path $xamppRoot 'apache\bin\httpd.exe'
$mysqlExe = Join-Path $xamppRoot 'mysql\bin\mysqld.exe'
$mysqlIni = Join-Path $xamppRoot 'mysql\bin\my.ini'
$mysqlAdmin = Join-Path $xamppRoot 'mysql\bin\mysqladmin.exe'

function Test-PortListening {
    param([int]$Port)
    return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Test-Url {
    param([string]$Url)
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
        return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
    } catch {
        return $false
    }
}

function Test-MySql {
    if (-not (Test-Path $mysqlAdmin)) {
        return $false
    }

    & $mysqlAdmin -uroot ping *> $null
    return $LASTEXITCODE -eq 0
}

if (-not (Test-MySql)) {
    Write-Output "Starting XAMPP MySQL on port $MySqlPort..."
    Start-Process `
        -FilePath $mysqlExe `
        -ArgumentList @("--defaults-file=$mysqlIni", '--standalone') `
        -WorkingDirectory $xamppRoot `
        -WindowStyle Hidden

    $mysqlReady = $false
    foreach ($attempt in 1..15) {
        Start-Sleep -Seconds 1
        if (Test-MySql) {
            $mysqlReady = $true
            break
        }
    }

    if (-not $mysqlReady) {
        Write-Error 'MySQL did not become ready. Check docs/setup/XAMPP_WINDOWS.md and C:\Program Files\Xaamp\mysql\data\mysql_error.log.'
        exit 1
    }
}

$dashboardUrl = if ($ApachePort -eq 80) { 'http://localhost/dashboard/' } else { "http://localhost:$ApachePort/dashboard/" }

if (-not (Test-Url $dashboardUrl)) {
    Write-Output "Starting XAMPP Apache on port $ApachePort..."
    $apacheRoot = (Join-Path $xamppRoot 'apache') -replace '\\', '/'
    Start-Process `
        -FilePath $apacheExe `
        -ArgumentList "-d `"$apacheRoot`"" `
        -WorkingDirectory $xamppRoot `
        -WindowStyle Hidden

    $apacheReady = $false
    foreach ($attempt in 1..10) {
        Start-Sleep -Seconds 1
        if (Test-Url $dashboardUrl) {
            $apacheReady = $true
            break
        }
    }

    if (-not $apacheReady) {
        Write-Error "Apache did not become ready on $dashboardUrl. Check the XAMPP Apache logs."
        exit 1
    }
}

$phpMyAdminUrl = if ($ApachePort -eq 80) { 'http://localhost/phpmyadmin/' } else { "http://localhost:$ApachePort/phpmyadmin/" }

Write-Output "XAMPP is ready."
Write-Output "phpMyAdmin: $phpMyAdminUrl"
Write-Output "MySQL: localhost:$MySqlPort"
