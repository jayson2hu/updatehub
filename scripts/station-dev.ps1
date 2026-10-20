[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('api', 'web')]
    [string]$Component,
    [ValidateRange(0, 65535)]
    [int]$Port = 0
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'station-env.ps1')
if ($Port -eq 0) { $Port = if ($Component -eq 'api') { 8010 } else { 3010 } }
if ($Component -eq 'api') {
    Push-Location $StationApiRoot
    try { & $StationPython -m uvicorn app.main:app --host 127.0.0.1 --port $Port --no-access-log }
    finally { Pop-Location }
} else {
    Push-Location $StationRoot
    try { & npm.cmd run dev --workspace '@updatehub/web' -- --port $Port }
    finally { Pop-Location }
}
if ($LASTEXITCODE -ne 0) { throw "服务已退出，状态码：$LASTEXITCODE。请查看上方错误信息。" }
