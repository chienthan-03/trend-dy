# Start local MinIO (no Docker)
# Install once: winget install MinIO.Server
# Then run: .\scripts\start-minio.ps1

$DataDir = Join-Path $PSScriptRoot "..\.data\minio"
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

$minio = Get-Command minio -ErrorAction SilentlyContinue
if (-not $minio) {
  $candidate = "$env:LOCALAPPDATA\Microsoft\WinGet\Links\minio.exe"
  if (Test-Path $candidate) { $minio = $candidate } else {
    Write-Error "minio not found. Install: winget install MinIO.Server"
  }
} else {
  $minio = $minio.Source
}

$env:MINIO_ROOT_USER = "minio"
$env:MINIO_ROOT_PASSWORD = "minio12345"

Write-Host "MinIO API : http://127.0.0.1:9000"
Write-Host "MinIO UI  : http://127.0.0.1:9001  (login minio / minio12345)"
Write-Host "Create bucket: factory"
& $minio server $DataDir --console-address ":9001"
