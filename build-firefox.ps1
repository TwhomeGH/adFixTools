param(
    [switch]$SkipSwitch
)

$parent = Split-Path -Parent $PSScriptRoot
$baseName = Split-Path -Leaf $PSScriptRoot
$src = Join-Path $parent "${baseName}-firefox"
$zipPath = Join-Path $parent "${baseName}-firefox.xpi"

if (-not $SkipSwitch) {
    & (Join-Path $PSScriptRoot "switch-browser.ps1") -Target firefox -CopyOnly
}

if (Test-Path $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zip = [System.IO.Compression.ZipFile]::Open($zipPath, 1)

Get-ChildItem -LiteralPath $src -Recurse | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
    $relative = $_.FullName.Substring($src.Length + 1) -replace '\\', '/'
    $entry = $zip.CreateEntry($relative)
    $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
    $stream = $entry.Open()
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Close()
}

$zip.Dispose()
Write-Host "Done: $zipPath" -ForegroundColor Green
