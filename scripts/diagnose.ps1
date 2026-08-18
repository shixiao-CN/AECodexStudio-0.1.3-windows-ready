[CmdletBinding()]
param()

$aePaths = @(
    'C:\Program Files\Adobe\Adobe After Effects 2024\Support Files\AfterFX.com',
    'C:\Program Files\Adobe\Adobe After Effects 2025\Support Files\AfterFX.com'
)

[PSCustomObject]@{
    CodexCli = (Get-Command codex -ErrorAction SilentlyContinue).Source
    AeDevSkill = Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.agents\skills\ae-dev\SKILL.md')
    InstalledPanel = Test-Path -LiteralPath (Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.aecodex.panel\CSXS\manifest.xml')
}

$aePaths | ForEach-Object {
    [PSCustomObject]@{ AfterEffects = $_; Exists = Test-Path -LiteralPath $_ }
}
