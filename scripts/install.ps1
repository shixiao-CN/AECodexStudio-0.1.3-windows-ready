[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$source = Split-Path -Parent $PSScriptRoot
$extensionsRoot = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$target = Join-Path $extensionsRoot 'com.aecodex.panel'
$resolvedRoot = [System.IO.Path]::GetFullPath($extensionsRoot)
$resolvedTarget = [System.IO.Path]::GetFullPath($target)

if (-not $resolvedTarget.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe CEP target path: $resolvedTarget"
}

New-Item -ItemType Directory -Path $extensionsRoot -Force | Out-Null
if (Test-Path -LiteralPath $target) {
    $backup = "$target.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Move-Item -LiteralPath $target -Destination $backup
    Write-Host "Existing extension moved to $backup"
}

Copy-Item -LiteralPath $source -Destination $target -Recurse -Force

foreach ($version in 11, 12, 13) {
    $key = "HKCU:\Software\Adobe\CSXS.$version"
    New-Item -Path $key -Force | Out-Null
    New-ItemProperty -Path $key -Name PlayerDebugMode -Value '1' -PropertyType String -Force | Out-Null
}

Write-Host "Installed AE Codex Studio to $target"
Write-Host 'Restart After Effects, then open Window > Extensions (Legacy) > AE Codex Studio.'
