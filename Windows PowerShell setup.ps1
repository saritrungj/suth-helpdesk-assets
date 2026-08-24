# Setup script for suth-helpdesk-assets (Windows PowerShell)
# Usage:
#   .\setup.ps1            -> install deps + create DB + run schema/migrations
#   .\setup.ps1 -Seed      -> also load seed_dummy_data.sql
#   .\setup.ps1 -Fresh     -> force `npm install` even if node_modules exists

param(
    [switch]$Seed,
    [switch]$Fresh
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "== Checking prerequisites ==" -ForegroundColor Cyan
foreach ($cmd in @("node", "npm", "mysql")) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Host "'$cmd' not found on PATH. Install it first (Node 20+, MySQL client)." -ForegroundColor Red
        exit 1
    }
}
Write-Host "Node: $(node -v) | npm: $(npm -v)"

Write-Host "`n== Backend: dependencies ==" -ForegroundColor Cyan
Set-Location backend

if (-not (Test-Path ".env")) {
    Write-Host ".env not found, copying from .env.example"
    Copy-Item ".env.example" ".env"
    Write-Host "!! Edit backend\.env with your DB credentials before continuing, then re-run this script." -ForegroundColor Yellow
    exit 1
}

if ($Fresh -or -not (Test-Path "node_modules")) {
    npm install
} else {
    Write-Host "node_modules already present, skipping (use -Fresh to force reinstall)"
}

# Parse .env
$envContent = Get-Content ".env" | Where-Object { $_ -match "=" }
$envMap = @{}
foreach ($line in $envContent) {
    $parts = $line -split "=", 2
    $envMap[$parts[0].Trim()] = $parts[1].Trim()
}
$DbHost = if ($envMap["DB_HOST"]) { $envMap["DB_HOST"] } else { "localhost" }
$DbUser = if ($envMap["DB_USER"]) { $envMap["DB_USER"] } else { "root" }
$DbPassword = $envMap["DB_PASSWORD"]
$DbName = $envMap["DB_NAME"]

$mysqlArgs = @("-h", $DbHost, "-u", $DbUser)
if ($DbPassword) {
    $mysqlArgs += "-p$DbPassword"
}

Set-Location ..

Write-Host "`n== Database: creating '$DbName' if it doesn't exist ==" -ForegroundColor Cyan
mysql @mysqlArgs -e "CREATE DATABASE IF NOT EXISTS ``$DbName`` CHARACTER SET utf8mb4;"

Write-Host "== Database: applying schema.sql ==" -ForegroundColor Cyan
Get-Content "database\schema.sql" -Raw | mysql @mysqlArgs $DbName

Write-Host "== Database: applying migrations ==" -ForegroundColor Cyan
Get-ChildItem "database\migration_*.sql" | Sort-Object Name | ForEach-Object {
    Write-Host "  -> $($_.Name)"
    Get-Content $_.FullName -Raw | mysql @mysqlArgs $DbName
}

if ($Seed) {
    Write-Host "== Database: loading seed_dummy_data.sql ==" -ForegroundColor Cyan
    Get-Content "database\seed_dummy_data.sql" -Raw | mysql @mysqlArgs $DbName
}

Write-Host "`n== Frontend: dependencies ==" -ForegroundColor Cyan
Set-Location frontend
if ($Fresh -or -not (Test-Path "node_modules")) {
    npm install
} else {
    Write-Host "node_modules already present, skipping (use -Fresh to force reinstall)"
}
Set-Location ..

Write-Host "`n✅ Setup complete." -ForegroundColor Green
Write-Host "Next steps (run in two terminals):"
Write-Host "  cd backend  ; npm run dev   # API on http://localhost:3000"
Write-Host "  cd frontend ; npm run dev   # Web app on http://localhost:5173"
Write-Host "Login: admin / admin123 (change this before real use)"
