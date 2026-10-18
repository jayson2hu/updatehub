[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('api', 'web')]
    [string]$Component
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'station-env.ps1')
if ($Component -eq 'api') {
    Push-Location $StationApiRoot
    try { & $StationPython -m uvicorn app.main:app --host 127.0.0.1 --port 8010 }
    finally { Pop-Location }
} else {
    Push-Location $StationRoot
    try { & npm.cmd run dev --workspace '@updatehub/web' -- --port 3010 }
    finally { Pop-Location }
}
if ($LASTEXITCODE -ne 0) { throw "服务已退出，状态码：$LASTEXITCODE。请查看上方错误信息。" }
