[CmdletBinding(SupportsShouldProcess)]
param()

$ErrorActionPreference = 'Stop'
$extensionsRoot = Join-Path $env:APPDATA 'Adobe\CEP\extensions'
$target = Join-Path $extensionsRoot 'com.aecodex.panel'
$resolvedRoot = [System.IO.Path]::GetFullPath($extensionsRoot)
$resolvedTarget = [System.IO.Path]::GetFullPath($target)

if (-not $resolvedTarget.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe CEP target path: $resolvedTarget"
}

if (Test-Path -LiteralPath $target) {
    if ($PSCmdlet.ShouldProcess($resolvedTarget, 'Remove AE Codex Studio')) {
        Remove-Item -LiteralPath $target -Recurse -Force
        Write-Host "Removed $resolvedTarget"
    }
} else {
    Write-Host 'AE Codex Studio is not installed.'
}
