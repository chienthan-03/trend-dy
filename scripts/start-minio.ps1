# Start local MinIO (no Docker)
# Install once: winget install MinIO.Server
# Then run: .\scripts\start-minio.ps1

$DataDir = Join-Path $PSScriptRoot "..\.data\minio"
New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

$minio = Get-Command minio -ErrorAction SilentlyContinue
if (-not $minio) {
  $found = @(
    "$env:LOCALAPPDATA\Microsoft\WinGet\Links\minio.exe",
    (Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter "minio.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName)
  ) | Where-Object { $_ -and (Test-Path $_) }
  $found = @($found)
  if ($found.Count -eq 0) {
    Write-Error "minio not found. Install: winget install MinIO.Server"
    exit 1
  }
  $minioExe = $found[0]
} else {
  $minioExe = $minio.Source
}

$env:MINIO_ROOT_USER = "minio"
$env:MINIO_ROOT_PASSWORD = "minio12345"

Write-Host "MinIO API : http://127.0.0.1:9000"
Write-Host "MinIO UI  : http://127.0.0.1:9001  (login minio / minio12345)"
Write-Host "Create bucket: factory"
& "$minioExe" server $DataDir --console-address ":9001"
