$ErrorActionPreference = "Stop"

$BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodeCommand = Get-Command node -ErrorAction SilentlyContinue

function Get-EnvValue([string]$Name) {
  $processValue = [System.Environment]::GetEnvironmentVariable($Name, "Process")
  if ($processValue) { return $processValue }

  $userValue = [System.Environment]::GetEnvironmentVariable($Name, "User")
  if ($userValue) { return $userValue }

  $registryValue = (Get-ItemProperty "HKCU:\Environment" -ErrorAction SilentlyContinue).$Name
  if ($registryValue) { return $registryValue }

  return [System.Environment]::GetEnvironmentVariable($Name, "Machine")
}

$env:FEISHU_WEBHOOK_URL = Get-EnvValue "FEISHU_WEBHOOK_URL"
$env:FEISHU_APP_ID = Get-EnvValue "FEISHU_APP_ID"
$env:FEISHU_APP_SECRET = Get-EnvValue "FEISHU_APP_SECRET"

if (-not $NodeCommand) {
  throw "Node.js 18+ is required to run crcl_notifier.ps1."
}

Push-Location $BaseDir
try {
  & $NodeCommand.Path ".\crcl_notifier.mjs"
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}
finally {
  Pop-Location
}
