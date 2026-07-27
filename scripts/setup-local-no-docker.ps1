# Local dev setup WITHOUT Docker (Windows)
# Prerequisites: PostgreSQL 18, Redis, MinIO (see below)
#
# Usage (normal user):
#   Set-Location C:\Publish\mock-duyn
#   .\scripts\setup-local-no-docker.ps1
#
# pgvector requires admin once:
#   Run PowerShell as Administrator -> .\scripts\install-pgvector.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$PgBin = "C:\Program Files\PostgreSQL\18\bin\psql.exe"

Write-Host "==> 1/4 Ensure Postgres role + database"
$env:PGPASSWORD = "admin"
& $PgBin -U postgres -h 127.0.0.1 -p 5432 -v ON_ERROR_STOP=1 -c @"
DO `$`$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'factory') THEN
    CREATE USER factory WITH PASSWORD 'factory' CREATEDB;
  END IF;
END `$`$;
"@ | Out-Null

$dbExists = & $PgBin -U postgres -h 127.0.0.1 -p 5432 -tAc "SELECT 1 FROM pg_database WHERE datname='factory'"
if (-not $dbExists.Trim()) {
  & $PgBin -U postgres -h 127.0.0.1 -p 5432 -c "CREATE DATABASE factory OWNER factory;"
}

Write-Host "==> 2/4 Check pgvector extension"
try {
  & $PgBin -U postgres -h 127.0.0.1 -p 5432 -d factory -c "CREATE EXTENSION IF NOT EXISTS vector;" | Out-Null
  Write-Host "    pgvector OK"
} catch {
  Write-Warning "pgvector missing. Run as Admin: .\scripts\install-pgvector.ps1"
  exit 1
}

Write-Host "==> 3/4 Prisma migrate"
Set-Location $Root
pnpm exec prisma migrate deploy
pnpm exec prisma generate

Write-Host "==> 4/4 Smoke checks"
$env:PGPASSWORD = "factory"
& $PgBin -U factory -h 127.0.0.1 -p 5432 -d factory -c "SELECT extname FROM pg_extension WHERE extname='vector';"

Write-Host @"

Done. Start dev (3 terminals):
  pnpm dev:api
  pnpm dev:worker
  pnpm dev:web

Login: see STUDIO_EMAIL / STUDIO_PASSWORD in .env
Open:  http://localhost:3000/login

Also ensure:
  - Redis 7 on 127.0.0.1:6380  (.\scripts\start-redis.ps1)
    Old winget Redis 3.0 on 6379 is NOT compatible with BullMQ.
  - MinIO on 127.0.0.1:19000  (winget install MinIO.Server)
  - Bucket 'factory' in MinIO console http://127.0.0.1:19001
"@
