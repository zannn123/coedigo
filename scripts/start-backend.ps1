param(
    [int]$Port = 8000
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$router = Join-Path $repoRoot 'backend\index.php'
$logDir = Join-Path $repoRoot 'backend\logs'

if (-not (Test-Path $router)) {
    Write-Error "Backend router not found at $router"
    exit 1
}

if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

$phpCommand = Get-Command php -ErrorAction SilentlyContinue
$phpCandidates = @(
    $phpCommand.Source,
    'C:\Program Files\Xaamp\php\php.exe',
    'C:\Program Files\Xaamp\php\windowsXamppPhp\php.exe',
    'C:\xampp\php\php.exe'
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

if (-not $phpCandidates) {
    Write-Error 'PHP was not found. Install PHP or XAMPP, or add php.exe to PATH.'
    exit 1
}

$existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existing) {
    Write-Output "COEDIGO backend already listening on http://127.0.0.1:$Port"
    exit 0
}

$phpExe = $phpCandidates[0]
$stdoutLog = Join-Path $logDir 'php-server.out.log'
$stderrLog = Join-Path $logDir 'php-server.err.log'

Start-Process `
    -FilePath $phpExe `
    -ArgumentList @('-S', "127.0.0.1:$Port", $router) `
    -WorkingDirectory $repoRoot `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -WindowStyle Hidden

Start-Sleep -Seconds 2

$started = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $started) {
    Write-Error "Failed to start COEDIGO backend on http://127.0.0.1:$Port. Check $stderrLog"
    exit 1
}

Write-Output "COEDIGO backend started on http://127.0.0.1:$Port"
