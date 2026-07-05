<#
.SYNOPSIS
  Apply pending SQL migrations to the local Docker Postgres (nexa-db).

.DESCRIPTION
  Reads backend/database/migrations/*.sql in filename order, skips files already
  recorded in schema_migrations, and applies the rest via docker exec psql.

.PARAMETER Baseline
  Mark all migration files as applied without executing SQL (for DBs already
  provisioned via initdb or TypeORM sync).

.PARAMETER File
  Apply a single migration file (by name, e.g. 046_my_change.sql).

.PARAMETER Container
  Docker container name (default: nexa-db, or env NEXA_DB_CONTAINER).

.EXAMPLE
  npm run migrate:docker

.EXAMPLE
  npm run migrate:docker -- -File 046_add_feature.sql

.EXAMPLE
  npm run migrate:docker:baseline
#>
param(
  [switch]$Baseline,
  [string]$File = "",
  [string]$Container = $(if ($env:NEXA_DB_CONTAINER) { $env:NEXA_DB_CONTAINER } else { "nexa-db" })
)

$ErrorActionPreference = "Stop"
$backendRoot = Split-Path -Parent $PSScriptRoot
$migrationsDir = Join-Path $backendRoot "database\migrations"
$db = if ($env:DB_NAME) { $env:DB_NAME } else { "nexapay" }
$user = if ($env:DB_USERNAME) { $env:DB_USERNAME } else { "postgres" }

function Test-DockerContainerRunning {
  param([string]$Name)
  $id = docker ps -q -f "name=^/${Name}$" 2>$null
  return [bool]$id
}

function Invoke-DockerPsql {
  param([string]$Sql)
  # psql NOTICE lines go to stderr; suppress so PowerShell does not treat them as errors.
  $Sql | docker exec -i $Container psql -U $user -d $db -v ON_ERROR_STOP=1 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "psql failed with exit code $LASTEXITCODE"
  }
}

function Get-MigrationFiles {
  Get-ChildItem -Path $migrationsDir -Filter "*.sql" |
    Where-Object { $_.Name -notmatch '\.md$' } |
    Sort-Object { $_.Name } |
    ForEach-Object { $_.Name }
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error "docker is not available in PATH"
}

if (-not (Test-DockerContainerRunning -Name $Container)) {
  Write-Error @"
Docker container '$Container' is not running.
Start it from nexa_backend/infra:
  docker compose -f docker-compose.db.yml up -d
"@
}

Write-Host "Target: container=$Container database=$db user=$user"
Write-Host "Migrations: $migrationsDir"

$bootstrap = @"
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"@
Invoke-DockerPsql -Sql $bootstrap | Out-Null

$appliedRows = docker exec $Container psql -U $user -d $db -t -A -c "SELECT filename FROM schema_migrations ORDER BY filename;"
$applied = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($row in ($appliedRows -split "`n")) {
  $t = $row.Trim()
  if ($t) { [void]$applied.Add($t) }
}

$files = if ($File) {
  if (-not (Test-Path (Join-Path $migrationsDir $File))) {
    Write-Error "Migration file not found: $File"
  }
  @($File)
} else {
  Get-MigrationFiles
}

if ($Baseline) {
  Write-Host "Baselining $($files.Count) migration(s) (no SQL executed)..."
  foreach ($name in $files) {
    if ($applied.Contains($name)) { continue }
    $esc = $name.Replace("'", "''")
    Invoke-DockerPsql -Sql "INSERT INTO schema_migrations (filename) VALUES ('$esc') ON CONFLICT DO NOTHING;" | Out-Null
    Write-Host "  marked: $name"
  }
  Write-Host "Baseline complete."
  exit 0
}

$pending = @($files | Where-Object { -not $applied.Contains($_) })
if ($pending.Count -eq 0) {
  Write-Host "No pending migrations."
  exit 0
}

Write-Host "Applying $($pending.Count) pending migration(s)..."
foreach ($name in $pending) {
  $path = Join-Path $migrationsDir $name
  Write-Host ">> $name"
  $sql = Get-Content $path -Raw
  try {
    Invoke-DockerPsql -Sql $sql
    $esc = $name.Replace("'", "''")
    Invoke-DockerPsql -Sql "INSERT INTO schema_migrations (filename) VALUES ('$esc') ON CONFLICT DO NOTHING;" | Out-Null
    Write-Host "   OK"
  } catch {
    Write-Error "Migration failed: $name`n$_"
  }
}

Write-Host "All pending migrations applied. Restart the backend if it is running."
