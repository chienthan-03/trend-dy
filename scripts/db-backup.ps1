# Backup local factory Postgres DB (no Docker).
# Usage: .\scripts\db-backup.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$OutDir = Join-Path $Root "backups"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"

$PgDump = @(
  "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe",
  "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe",
  "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe",
  "C:\Program Files\PostgreSQL\13\bin\pg_dump.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $PgDump) {
  throw "pg_dump.exe not found under C:\Program Files\PostgreSQL"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$env:PGPASSWORD = if ($env:PGPASSWORD) { $env:PGPASSWORD } else { "factory" }

$DumpPath = Join-Path $OutDir "factory-$Stamp.dump"
$SqlPath = Join-Path $OutDir "factory-$Stamp.sql"

Write-Host "==> Dumping factory @ 127.0.0.1:5432"
& $PgDump -U factory -h 127.0.0.1 -p 5432 -d factory --no-owner --no-acl -F c -f $DumpPath
& $PgDump -U factory -h 127.0.0.1 -p 5432 -d factory --no-owner --no-acl -f $SqlPath

Write-Host "OK:"
Write-Host "  $DumpPath"
Write-Host "  $SqlPath"
Get-Item $DumpPath, $SqlPath | Format-Table Name, @{N = "MB"; E = { [math]::Round($_.Length / 1MB, 2) } }, LastWriteTime -AutoSize
