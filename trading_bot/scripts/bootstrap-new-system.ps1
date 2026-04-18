param(
  [ValidateSet("host", "compose")]
  [string]$Mode = "host"
)

$ErrorActionPreference = "Stop"
$rootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Require-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

function Invoke-NpmCi {
  param([string]$WorkingDirectory)

  Push-Location $WorkingDirectory
  try {
    & npm ci
    if ($LASTEXITCODE -ne 0) {
      throw "npm ci failed in $WorkingDirectory"
    }
  } finally {
    Pop-Location
  }
}

function Show-PlaceholderWarning {
  $envPath = Join-Path $rootDir "backend/.env"
  if (-not (Test-Path -LiteralPath $envPath)) {
    return
  }

  $matches = Select-String -Path $envPath -Pattern 'replace-me|postgres:5432|CONTROL_API_SECRET="replace-me"' -Quiet
  if ($matches) {
    Write-Host ""
    Write-Host "backend/.env still contains example values."
    Write-Host "Fill the provider keys and control secret before expecting the bot to work properly."
  }
}

Require-Command node
Require-Command npm
Require-Command docker

Write-Host "Using Node $(& node --version) and npm $(& npm --version)"
Write-Host "Installing backend dependencies..."
Invoke-NpmCi -WorkingDirectory (Join-Path $rootDir "backend")

Write-Host "Installing dashboard dependencies..."
Invoke-NpmCi -WorkingDirectory (Join-Path $rootDir "dashboard")

$backendEnv = Join-Path $rootDir "backend/.env"
if (-not (Test-Path -LiteralPath $backendEnv)) {
  Copy-Item -LiteralPath (Join-Path $rootDir "backend/.env.example") -Destination $backendEnv
  Write-Host "Created trading_bot/backend/.env from example"
}

if ($Mode -eq "compose" -and (Test-Path -LiteralPath $backendEnv)) {
  & (Join-Path $rootDir "scripts/sync-compose-env.ps1") -SourceEnv $backendEnv
  if ($LASTEXITCODE -ne 0) {
    throw "sync-compose-env.ps1 failed"
  }
}

Show-PlaceholderWarning
Write-Host ""

if ($Mode -eq "host") {
  Write-Host "Next steps for host-run app + Docker Postgres:"
  Write-Host "1. Edit trading_bot/backend/.env"
  Write-Host "2. Change DATABASE_URL host from postgres to 127.0.0.1 or localhost"
  Write-Host "3. Start Postgres:"
  Write-Host "   cd trading_bot; docker compose up -d postgres"
  Write-Host "4. Set up backend:"
  Write-Host "   cd trading_bot/backend; npm run db:generate; npm run db:setup; npm run dev"
  Write-Host "5. Start dashboard:"
  Write-Host "   cd trading_bot/dashboard; npm run dev"
} else {
  Write-Host "Next steps for full Compose stack:"
  Write-Host "1. Edit trading_bot/backend/.env"
  Write-Host "2. Keep DATABASE_URL pointed at postgres"
  Write-Host "3. Generate service env files:"
  Write-Host "   powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\sync-compose-env.ps1"
  Write-Host "4. Start the stack:"
  Write-Host "   docker compose up --build"
}
