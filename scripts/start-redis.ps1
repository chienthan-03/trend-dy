# Start Redis 7+ for BullMQ (no Docker, no admin).
# Old winget Redis 3.0 on port 6379 is too old - this runs Redis 7 on 6380.
#
# Usage: .\scripts\start-redis.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$VendorDir = Join-Path $Root "vendor\redis-7"
$DataDir = Join-Path $Root ".data\redis"
$ZipUrl = "https://github.com/redis-windows/redis-windows/releases/download/7.4.9/Redis-7.4.9-Windows-x64-msys2.zip"
$ZipPath = Join-Path $env:TEMP "Redis-7.4.9-Windows-x64-msys2.zip"
$Port = 6380

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null

$redisServer = Join-Path $VendorDir "redis-server.exe"
if (-not (Test-Path $redisServer)) {
  Write-Host "==> Downloading Redis 7.4.9..."
  Invoke-WebRequest -Uri $ZipUrl -OutFile $ZipPath -UseBasicParsing
  if (Test-Path $VendorDir) {
    Remove-Item $VendorDir -Recurse -Force
  }
  Expand-Archive -Path $ZipPath -DestinationPath (Join-Path $Root "vendor") -Force
  $extracted = Get-ChildItem (Join-Path $Root "vendor") -Directory |
    Where-Object { $_.Name -like "Redis-*msys2*" } |
    Select-Object -First 1
  if (-not $extracted) {
    Write-Error "Redis extract failed - check vendor folder"
  }
  Rename-Item $extracted.FullName $VendorDir -Force
  Remove-Item $ZipPath -Force -ErrorAction SilentlyContinue
}

$listening = netstat -ano | Select-String ":$Port\s+.*LISTENING"
if ($listening) {
  Write-Host "Redis already listening on port $Port"
  & $redisServer --version
  exit 0
}

Write-Host "Redis 7 starting on port $Port"
Write-Host "Data dir: $DataDir"
Write-Host "REDIS_URL=redis://127.0.0.1:$Port"

& $redisServer --port $Port --dir $DataDir --bind 127.0.0.1 --protected-mode no --save '""'
