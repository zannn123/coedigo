param(
    [int]$Port = 5000
)

$ErrorActionPreference = 'Stop'
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$chatbotDir = Join-Path $repoRoot 'ai_chatbot'
$appPath = Join-Path $chatbotDir 'app.py'
$requirementsPath = Join-Path $chatbotDir 'requirements.txt'
$envPath = Join-Path $chatbotDir '.env'
$envExamplePath = Join-Path $chatbotDir '.env.example'
$venvDir = Join-Path $chatbotDir '.venv'
$venvPython = Join-Path $venvDir 'Scripts\python.exe'
$logDir = Join-Path $chatbotDir 'logs'

if (-not (Test-Path $appPath)) {
    Write-Error "AI chatbot app not found at $appPath"
    exit 1
}

if (-not (Test-Path $envPath) -and (Test-Path $envExamplePath)) {
    Copy-Item -LiteralPath $envExamplePath -Destination $envPath
    Write-Output "Created ai_chatbot\.env from .env.example"
}

if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

$existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existing) {
    Write-Output "COEDIGO AI chatbot already listening on http://127.0.0.1:$Port"
    exit 0
}

if (-not (Test-Path $venvPython)) {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if (-not $pythonCommand) {
        Write-Error 'Python was not found. Install Python or add python.exe to PATH.'
        exit 1
    }

    Write-Output 'Creating AI chatbot virtual environment...'
    $venvProcess = Start-Process `
        -FilePath $pythonCommand.Source `
        -ArgumentList @('-m', 'venv', $venvDir) `
        -Wait `
        -PassThru `
        -NoNewWindow

    if ($venvProcess.ExitCode -ne 0) {
        Write-Error 'Failed to create the AI chatbot virtual environment.'
        exit 1
    }
}

$dependencyOut = Join-Path $logDir 'dependency-check.out.log'
$dependencyErr = Join-Path $logDir 'dependency-check.err.log'
$dependencyCheck = Start-Process `
    -FilePath $venvPython `
    -ArgumentList @('-c', '"import flask, flask_cors, mysql.connector, dotenv, requests, sklearn"') `
    -Wait `
    -PassThru `
    -RedirectStandardOutput $dependencyOut `
    -RedirectStandardError $dependencyErr `
    -WindowStyle Hidden

if ($dependencyCheck.ExitCode -ne 0) {
    Write-Output 'Installing AI chatbot dependencies...'
    $pipProcess = Start-Process `
        -FilePath $venvPython `
        -ArgumentList @('-m', 'pip', 'install', '-r', $requirementsPath) `
        -Wait `
        -PassThru `
        -NoNewWindow

    if ($pipProcess.ExitCode -ne 0) {
        Write-Error "Failed to install AI chatbot dependencies from $requirementsPath"
        exit 1
    }
}

$stdoutLog = Join-Path $logDir 'chatbot-server.out.log'
$stderrLog = Join-Path $logDir 'chatbot-server.err.log'

$env:CHATBOT_PORT = [string]$Port

Start-Process `
    -FilePath $venvPython `
    -ArgumentList @($appPath) `
    -WorkingDirectory $chatbotDir `
    -RedirectStandardOutput $stdoutLog `
    -RedirectStandardError $stderrLog `
    -WindowStyle Hidden

$started = $null
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 500
    $started = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($started) {
        break
    }
}

if (-not $started) {
    Write-Error "Failed to start COEDIGO AI chatbot on http://127.0.0.1:$Port. Check $stderrLog"
    exit 1
}

Write-Output "COEDIGO AI chatbot started on http://127.0.0.1:$Port"
