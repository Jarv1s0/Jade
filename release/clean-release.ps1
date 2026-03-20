param(
    [int]$Keep = 1,
    [string]$Pattern = 'Jade-v*.zip'
)

$ErrorActionPreference = 'Stop'

if ($Keep -lt 1) {
    throw "Keep must be greater than or equal to 1."
}

$releaseRoot = $PSScriptRoot
$packages = Get-ChildItem -Path $releaseRoot -File -Filter $Pattern |
    Sort-Object -Property LastWriteTimeUtc, Name -Descending

if ($packages.Count -le $Keep) {
    Write-Host "No cleanup required. Kept $($packages.Count) package(s)."
    return
}

$toKeep = $packages | Select-Object -First $Keep
$toRemove = $packages | Select-Object -Skip $Keep

foreach ($package in $toRemove) {
    Remove-Item -LiteralPath $package.FullName -Force
    Write-Host "Removed old package: $($package.Name)"
}

$keptNames = ($toKeep | ForEach-Object { $_.Name }) -join ', '
Write-Host "Kept latest package(s): $keptNames"
