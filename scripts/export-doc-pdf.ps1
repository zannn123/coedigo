param(
    [string]$Source = "COEDIGO_Documentation.html",
    [string]$Output = "COEDIGO_Documentation.pdf"
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $repoRoot $Source
$outputPath = Join-Path $repoRoot $Output
$pythonScript = Join-Path $PSScriptRoot 'export-doc-pdf.py'

if (-not (Test-Path $sourcePath)) {
    Write-Error "Source document not found: $sourcePath"
    exit 1
}

if (-not (Test-Path $pythonScript)) {
    Write-Error "Python export script not found: $pythonScript"
    exit 1
}

python $pythonScript $sourcePath $outputPath
exit $LASTEXITCODE
