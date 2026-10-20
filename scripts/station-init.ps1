[CmdletBinding()]
param(
    [switch]$CreateAdmin,
    [switch]$SkipDemo
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'station-env.ps1')
Push-Location $StationApiRoot
try {
    & $StationPython -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) { throw '数据库迁移失败，请检查连接配置后重试。' }
    if (-not $SkipDemo) {
        & $StationPython -m app.cli seed-station
        if ($LASTEXITCODE -ne 0) { throw '示例内容初始化失败。' }
    }
    if ($CreateAdmin) {
        # The CLI prompts for missing email/password and never echoes the password.
        & $StationPython -m app.cli create-admin
        if ($LASTEXITCODE -ne 0) { throw '管理员初始化失败；已存在的账号不会被覆盖。' }
    }
    Write-Host '初始化完成。下一步在两个终端分别运行 station-dev.ps1 -Component api / web。'
} finally { Pop-Location }
