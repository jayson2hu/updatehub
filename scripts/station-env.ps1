# Shared local-development paths. Dot-source from the station scripts.
$StationRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$StationApiRoot = Join-Path $StationRoot 'apps/api'
$StationPython = Join-Path $StationApiRoot '.venv/Scripts/python.exe'
$StationRuntime = Join-Path $StationRoot 'runtime'
$StationDatabase = Join-Path $StationRuntime 'station.db'
$StationUploads = Join-Path $StationRuntime 'station-uploads'
if (-not (Test-Path -LiteralPath $StationPython)) {
    throw '缺少 Python 虚拟环境。请先按 docs/station-operations.md 安装依赖。'
}
New-Item -ItemType Directory -Force -Path $StationRuntime, $StationUploads | Out-Null
if (-not $env:DATABASE_URL) { $env:DATABASE_URL = 'sqlite:///' + $StationDatabase.Replace('\', '/') }
if (-not $env:UPLOAD_DIR) { $env:UPLOAD_DIR = $StationUploads }
if (-not $env:PUBLIC_SITE_URL) { $env:PUBLIC_SITE_URL = 'http://localhost:3010' }
if (-not $env:CORS_ORIGINS) { $env:CORS_ORIGINS = 'http://localhost:3010,http://127.0.0.1:3010' }
if (-not $env:API_INTERNAL_URL) { $env:API_INTERNAL_URL = 'http://127.0.0.1:8010' }
$env:NEXT_TELEMETRY_DISABLED = '1'
