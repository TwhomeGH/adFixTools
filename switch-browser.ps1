param(
    [ValidateSet("chrome", "firefox", "all")]
    [string]$Target,
    [switch]$CopyOnly
)

$src = $PSScriptRoot
$parent = Split-Path -Parent $src
$baseName = Split-Path -Leaf $src

$chromeManifest = Join-Path $src "manifest-chrome.json"
$firefoxManifest = Join-Path $src "manifest-firefox.json"
$manifestPath = Join-Path $src "manifest.json"

$exclude = @('.git', '.gitignore', 'node_modules', '.DS_Store', 'Thumbs.db')

function Copy-ToFolder {
    param([string]$Dest, [string]$SourceManifest)
    if (Test-Path $Dest) {
        Remove-Item -LiteralPath $Dest -Recurse -Force
    }
    New-Item -ItemType Directory -Path $Dest -Force | Out-Null
    Get-ChildItem -LiteralPath $src -Exclude $exclude | ForEach-Object {
        if ($_.Name -notin $exclude -and $_.Name -notlike '*.ps1' -and $_.Name -notlike 'manifest-*.json') {
            if ($_.PSIsContainer) {
                Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $Dest $_.Name) -Recurse -Force
            } else {
                Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $Dest $_.Name) -Force
            }
        }
    }
    Copy-Item -LiteralPath $SourceManifest -Destination (Join-Path $Dest "manifest.json") -Force
    Write-Host "Created: $Dest"
}

function Switch-Manifest {
    param([string]$SourceManifest, [string]$Label)
    if (-not (Test-Path $SourceManifest)) {
        Write-Host "ERROR: $SourceManifest not found!" -ForegroundColor Red
        exit 1
    }
    Copy-Item -LiteralPath $SourceManifest -Destination $manifestPath -Force
    Write-Host "Switched current folder to $Label manifest"
}

switch ($Target) {
    "chrome" {
        Copy-ToFolder -Dest (Join-Path $parent "${baseName}-chrome") -SourceManifest $chromeManifest
        if (-not $CopyOnly) { Switch-Manifest -SourceManifest $chromeManifest -Label "Chrome" }
    }
    "firefox" {
        Copy-ToFolder -Dest (Join-Path $parent "${baseName}-firefox") -SourceManifest $firefoxManifest
        if (-not $CopyOnly) { Switch-Manifest -SourceManifest $firefoxManifest -Label "Firefox" }
    }
    "all" {
        Copy-ToFolder -Dest (Join-Path $parent "${baseName}-chrome") -SourceManifest $chromeManifest
        Copy-ToFolder -Dest (Join-Path $parent "${baseName}-firefox") -SourceManifest $firefoxManifest
    }
}
