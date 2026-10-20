[CmdletBinding()]
param(
    [ValidateRange(1, 65535)][int]$Port = 3011,
    [ValidatePattern('^\.station-[a-z0-9-]+$')][string]$DistDir = '.station-preview',
    [switch]$Rebuild
)
$ErrorActionPreference = 'Stop'
if (-not $env:PUBLIC_SITE_URL) { $env:PUBLIC_SITE_URL = "http://localhost:$Port" }
. (Join-Path $PSScriptRoot 'station-env.ps1')
$env:NEXT_DIST_DIR = $DistDir
if (-not $env:STATION_WORKER_THREADS) { $env:STATION_WORKER_THREADS = 'true' }
$WebRoot = Join-Path $StationRoot 'apps/web'
$BuildRoot = Join-Path $WebRoot $DistDir
$ServerRoot = Join-Path $BuildRoot 'standalone/apps/web'
Push-Location $StationRoot
try {
    if ($Rebuild -or -not (Test-Path -LiteralPath (Join-Path $BuildRoot 'BUILD_ID'))) {
        & npm.cmd run build --workspace '@updatehub/web' -- --webpack
        if ($LASTEXITCODE -ne 0) { throw '正式构建失败，请检查上方错误。' }
    }
    $StaticRoot = Join-Path $ServerRoot "$DistDir/static"
    New-Item -ItemType Directory -Force -Path $StaticRoot | Out-Null
    Get-ChildItem -LiteralPath (Join-Path $BuildRoot 'static') | Copy-Item -Destination $StaticRoot -Recurse -Force
    $PublicRoot = Join-Path $WebRoot 'public'
    if (Test-Path -LiteralPath $PublicRoot) {
        $PublicTarget = Join-Path $ServerRoot 'public'
        New-Item -ItemType Directory -Force -Path $PublicTarget | Out-Null
        Get-ChildItem -LiteralPath $PublicRoot | Copy-Item -Destination $PublicTarget -Recurse -Force
    }
    $env:HOSTNAME = '127.0.0.1'
    $env:PORT = "$Port"
    Write-Host "网站：http://localhost:$Port；后台：http://localhost:$Port/admin"
    & node (Join-Path $ServerRoot 'server.js')
    if ($LASTEXITCODE -ne 0) { throw "网站已退出，状态码：$LASTEXITCODE" }
} finally { Pop-Location }
