# Restore factory Postgres from a backup created by db-backup.ps1.
# Usage:
#   .\scripts\db-restore.ps1
#   .\scripts\db-restore.ps1 -BackupPath .\backups\factory-20260717-011515.sql
#
# Prerequisites on target machine:
#   - Postgres running, role/db `factory` exist (run setup-local-no-docker.ps1 first)
#   - pgvector extension available

param(
  [string]$BackupPath = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Backups = Join-Path $Root "backups"

if (-not $BackupPath) {
  $latest = Get-ChildItem $Backups -Filter "factory-*.sql" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if (-not $latest) {
    throw "No factory-*.sql found in $Backups. Pass -BackupPath."
  }
  $BackupPath = $latest.FullName
}

if (-not (Test-Path $BackupPath)) {
  throw "Backup not found: $BackupPath"
}

$Psql = @(
  "C:\Program Files\PostgreSQL\15\bin\psql.exe",
  "C:\Program Files\PostgreSQL\16\bin\psql.exe",
  "C:\Program Files\PostgreSQL\18\bin\psql.exe",
  "C:\Program Files\PostgreSQL\13\bin\psql.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

$PgRestore = @(
  "C:\Program Files\PostgreSQL\15\bin\pg_restore.exe",
  "C:\Program Files\PostgreSQL\16\bin\pg_restore.exe",
  "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe",
  "C:\Program Files\PostgreSQL\13\bin\pg_restore.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $Psql) {
  throw "psql.exe not found under C:\Program Files\PostgreSQL"
}

$env:PGPASSWORD = if ($env:PGPASSWORD) { $env:PGPASSWORD } else { "factory" }

Write-Host "==> Restoring from $BackupPath"

if ($BackupPath -like "*.dump") {
  if (-not $PgRestore) { throw "pg_restore.exe not found" }
  & $PgRestore -U factory -h 127.0.0.1 -p 5432 -d factory --no-owner --no-acl --clean --if-exists $BackupPath
} else {
  & $Psql -U factory -h 127.0.0.1 -p 5432 -d factory -v ON_ERROR_STOP=1 -f $BackupPath
}

if ($LASTEXITCODE -ne 0) {
  throw "Restore failed (exit $LASTEXITCODE)"
}

Write-Host "OK: database factory restored."
