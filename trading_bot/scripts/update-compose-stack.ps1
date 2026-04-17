$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $repoRoot "scripts\update-compose-stack.mjs"

& node $scriptPath @args
exit $LASTEXITCODE
