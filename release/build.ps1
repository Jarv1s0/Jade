param(
    [string]$OutputName,
    [int]$KeepLatest = 1
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-NormalizedRelativePath {
    param(
        [string]$Value
    )

    return ($Value -replace '/', '\').Trim()
}

function Assert-RelativePathExists {
    param(
        [string]$BasePath,
        [string]$RelativePath,
        [string]$Label
    )

    if ([string]::IsNullOrWhiteSpace($RelativePath)) {
        return
    }

    if ($RelativePath -match '^(https?:|data:|chrome:|about:|#)') {
        return
    }

    $targetPath = Join-Path $BasePath (Get-NormalizedRelativePath $RelativePath)
    if (-not (Test-Path -LiteralPath $targetPath)) {
        throw "$Label not found: $RelativePath"
    }
}

function Assert-HtmlAssetReferences {
    param(
        [string]$HtmlPath
    )

    $htmlDir = Split-Path -Parent $HtmlPath
    $html = Get-Content -LiteralPath $HtmlPath -Raw
    $matches = [regex]::Matches($html, '(?i)(?:src|href)\s*=\s*"([^"]+)"|(?:src|href)\s*=\s*''([^'']+)''')
    foreach ($match in $matches) {
        $assetPath = if ($match.Groups[1].Success) { $match.Groups[1].Value } else { $match.Groups[2].Value }
        Assert-RelativePathExists -BasePath $htmlDir -RelativePath $assetPath -Label "HTML asset reference in $(Split-Path -Leaf $HtmlPath)"
    }
}

function Get-ZipEntries {
    param(
        [string]$ZipPath
    )

    $zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
    try {
        return @($zip.Entries | ForEach-Object { $_.FullName -replace '/', '\' })
    }
    finally {
        $zip.Dispose()
    }
}

$releaseRoot = $PSScriptRoot
$projectRoot = Split-Path -Parent $releaseRoot
$manifestPath = Join-Path $projectRoot 'manifest.json'

if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "manifest.json not found: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$version = [string]$manifest.version

if ([string]::IsNullOrWhiteSpace($OutputName)) {
    if ([string]::IsNullOrWhiteSpace($version)) {
        $OutputName = 'Jade.zip'
    }
    else {
        $OutputName = "Jade-v$version.zip"
    }
}

$outputPath = Join-Path $releaseRoot $OutputName
$cleanupScriptPath = Join-Path $releaseRoot 'clean-release.ps1'

$packageItems = @(
    'manifest.json',
    '_locales',
    'bookmarks',
    'newtab',
    'shared',
    'privacy.html',
    'README.md'
)

foreach ($item in $packageItems) {
    $fullPath = Join-Path $projectRoot $item
    if (-not (Test-Path -LiteralPath $fullPath)) {
        throw "Required package item not found: $item"
    }
}

$manifestAssetPaths = @()
if ($manifest.action -and $manifest.action.default_popup) {
    $manifestAssetPaths += [string]$manifest.action.default_popup
}
if ($manifest.side_panel -and $manifest.side_panel.default_path) {
    $manifestAssetPaths += [string]$manifest.side_panel.default_path
}
if ($manifest.chrome_url_overrides -and $manifest.chrome_url_overrides.newtab) {
    $manifestAssetPaths += [string]$manifest.chrome_url_overrides.newtab
}
if ($manifest.icons) {
    $manifest.icons.PSObject.Properties | ForEach-Object {
        $manifestAssetPaths += [string]$_.Value
    }
}

foreach ($assetPath in $manifestAssetPaths) {
    Assert-RelativePathExists -BasePath $projectRoot -RelativePath $assetPath -Label 'Manifest asset'
}

$defaultLocale = [string]$manifest.default_locale
if (-not [string]::IsNullOrWhiteSpace($defaultLocale)) {
    Assert-RelativePathExists -BasePath $projectRoot -RelativePath "_locales\$defaultLocale\messages.json" -Label 'Default locale messages'
}

Get-ChildItem -Path $projectRoot -Recurse -File -Include *.html |
    Where-Object { $_.FullName -notlike "$releaseRoot\*" } |
    ForEach-Object {
        Assert-HtmlAssetReferences -HtmlPath $_.FullName
}

if ($KeepLatest -lt 0) {
    throw "KeepLatest must be greater than or equal to 0."
}

if (Test-Path -LiteralPath $outputPath) {
    Remove-Item -LiteralPath $outputPath -Force
}

Push-Location $projectRoot
try {
    Compress-Archive -Path $packageItems -DestinationPath $outputPath -Force
}
finally {
    Pop-Location
}

$zipEntries = Get-ZipEntries -ZipPath $outputPath
foreach ($item in $packageItems) {
    $normalizedItem = Get-NormalizedRelativePath $item
    $targetPath = Join-Path $projectRoot $item
    $existsInZip = if (Test-Path -LiteralPath $targetPath -PathType Container) {
        $zipEntries | Where-Object { $_ -like "$normalizedItem\*" } | Select-Object -First 1
    }
    else {
        $zipEntries -contains $normalizedItem
    }

    if (-not $existsInZip) {
        throw "Packaged zip is missing expected entry: $item"
    }
}

if ($KeepLatest -gt 0 -and (Test-Path -LiteralPath $cleanupScriptPath)) {
    & $cleanupScriptPath -Keep $KeepLatest
}

Write-Host "Package created: $outputPath"
