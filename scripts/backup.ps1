# Daily local backup for an office PC (Windows Task Scheduler).
# Needs PostgreSQL client tools 17 (pg_dump) and the DB connection string in env var SUPABASE_DB_URL.
# Keeps the last 30 dumps in .\backups. Restore with:  pg_restore --clean --no-owner -d "<db url>" <file>.dump
$ErrorActionPreference = 'Stop'
$dir = Join-Path $PSScriptRoot '..\backups'
New-Item -ItemType Directory -Force $dir | Out-Null
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmm'
$file = Join-Path $dir "ikgpl-erp-$stamp.dump"
if (-not $env:SUPABASE_DB_URL) { throw 'Set the SUPABASE_DB_URL environment variable first.' }
& pg_dump $env:SUPABASE_DB_URL --format=custom --no-owner --no-privileges --schema=public --schema=app --schema=auth -f $file
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }
Get-ChildItem $dir -Filter 'ikgpl-erp-*.dump' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30 | Remove-Item
Write-Output "Backup written: $file"
