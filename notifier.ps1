$ErrorActionPreference = "Stop"

$BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodeCommand = Get-Command node -ErrorAction SilentlyContinue
$Webhook = [System.Environment]::GetEnvironmentVariable("FEISHU_WEBHOOK_URL", "Process")
$AppId = [System.Environment]::GetEnvironmentVariable("FEISHU_APP_ID", "Process")
$AppSecret = [System.Environment]::GetEnvironmentVariable("FEISHU_APP_SECRET", "Process")

if (-not $Webhook) {
  $Webhook = [System.Environment]::GetEnvironmentVariable("FEISHU_WEBHOOK_URL", "User")
}

if (-not $AppId) {
  $AppId = [System.Environment]::GetEnvironmentVariable("FEISHU_APP_ID", "User")
}

if (-not $AppSecret) {
  $AppSecret = [System.Environment]::GetEnvironmentVariable("FEISHU_APP_SECRET", "User")
}

if (-not $Webhook) {
  $Webhook = (Get-ItemProperty "HKCU:\Environment" -ErrorAction SilentlyContinue).FEISHU_WEBHOOK_URL
}

if (-not $AppId) {
  $AppId = (Get-ItemProperty "HKCU:\Environment" -ErrorAction SilentlyContinue).FEISHU_APP_ID
}

if (-not $AppSecret) {
  $AppSecret = (Get-ItemProperty "HKCU:\Environment" -ErrorAction SilentlyContinue).FEISHU_APP_SECRET
}

if (-not $Webhook) {
  $Webhook = [System.Environment]::GetEnvironmentVariable("FEISHU_WEBHOOK_URL", "Machine")
}

if (-not $AppId) {
  $AppId = [System.Environment]::GetEnvironmentVariable("FEISHU_APP_ID", "Machine")
}

if (-not $AppSecret) {
  $AppSecret = [System.Environment]::GetEnvironmentVariable("FEISHU_APP_SECRET", "Machine")
}

if ($Webhook) {
  $env:FEISHU_WEBHOOK_URL = $Webhook
}

if ($AppId) {
  $env:FEISHU_APP_ID = $AppId
}

if ($AppSecret) {
  $env:FEISHU_APP_SECRET = $AppSecret
}

if (-not $NodeCommand) {
  throw "Node.js 18+ is required to run notifier.ps1."
}

Push-Location $BaseDir
try {
  & $NodeCommand.Path ".\notifier.mjs"
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}
finally {
  Pop-Location
}
