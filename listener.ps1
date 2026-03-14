$ErrorActionPreference = "Stop"

$BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodeCommand = Get-Command node -ErrorAction SilentlyContinue

if (-not $NodeCommand) {
  throw "Node.js 18+ is required to run listener.ps1."
}

Push-Location $BaseDir
try {
  Write-Host "Starting Feishu listener in foreground..."
  & $NodeCommand.Path ".\feishu_listener.mjs"
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}
finally {
  Pop-Location
}
