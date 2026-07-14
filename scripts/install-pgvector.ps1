#Requires -RunAsAdministrator
# Install pgvector extension files into PostgreSQL 18 (Windows).
# Run: Right-click PowerShell -> Run as administrator, then:
#   Set-Location C:\Publish\mock-duyn
#   .\scripts\install-pgvector.ps1

$ErrorActionPreference = "Stop"
$PgRoot = "C:\Program Files\PostgreSQL\18"
$Vendor = Join-Path $PSScriptRoot "vendor\pgvector-pg18"

if (-not (Test-Path "$Vendor\lib\vector.dll")) {
  Write-Error "Missing $Vendor\lib\vector.dll — re-clone repo or re-download pgvector zip."
}

Copy-Item "$Vendor\lib\vector.dll" "$PgRoot\lib\vector.dll" -Force
Copy-Item "$Vendor\share\extension\*" "$PgRoot\share\extension\" -Force

Restart-Service postgresql-x64-18

$env:PGPASSWORD = "admin"
& "$PgRoot\bin\psql.exe" -U postgres -h 127.0.0.1 -p 5432 -d factory -c "CREATE EXTENSION IF NOT EXISTS vector;"
Write-Host "pgvector installed and enabled on database 'factory'."
