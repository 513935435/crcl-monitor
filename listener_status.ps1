$ErrorActionPreference = "Stop"

$BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$StateDir = Join-Path $BaseDir ".state"
$SupervisorPidFile = Join-Path $StateDir "listener_supervisor.pid"
$ListenerPidFile = Join-Path $StateDir "listener.pid"

function Read-PidStatus {
  param([string]$Path, [string]$Name)

  if (-not (Test-Path $Path)) {
    return "${Name}: stopped"
  }

  $line = Get-Content -Path $Path -ErrorAction SilentlyContinue | Select-Object -First 1
  $raw = if ($null -eq $line) { "" } else { $line.ToString().Trim() }
  if (-not $raw) {
    return "${Name}: stopped"
  }

  try {
    $pidValue = [int]$raw
    $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($process) {
      return "${Name}: running (PID $pidValue)"
    }
  }
  catch {
  }

  return "${Name}: stopped"
}

Write-Host (Read-PidStatus $SupervisorPidFile "Supervisor")
Write-Host (Read-PidStatus $ListenerPidFile "Listener")

try {
  $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8787/healthz" -TimeoutSec 3
  if ($response.StatusCode -eq 200) {
    Write-Host "Health: ok"
  } else {
    Write-Host "Health: degraded"
  }
}
catch {
  Write-Host "Health: down"
}
