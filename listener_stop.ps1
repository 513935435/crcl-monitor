$ErrorActionPreference = "Stop"

$BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$StateDir = Join-Path $BaseDir ".state"
$SupervisorPidFile = Join-Path $StateDir "listener_supervisor.pid"
$ListenerPidFile = Join-Path $StateDir "listener.pid"
$TaskName = "CodexFeishuListenerSupervisor"

function Stop-ByPidFile {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    return $false
  }

  $raw = (Get-Content -Path $Path -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
  if (-not $raw) {
    return $false
  }

  try {
    $pidValue = [int]$raw
    $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($process) {
      Stop-Process -Id $pidValue -Force
      return $true
    }
  }
  catch {
  }

  return $false
}

$stoppedListener = Stop-ByPidFile $ListenerPidFile
$stoppedSupervisor = Stop-ByPidFile $SupervisorPidFile

try {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
}
catch {
}

Remove-Item $ListenerPidFile -Force -ErrorAction SilentlyContinue
Remove-Item $SupervisorPidFile -Force -ErrorAction SilentlyContinue

if ($stoppedListener -or $stoppedSupervisor) {
  Write-Host "Listener stack stopped."
} else {
  Write-Host "Listener stack was not running."
}
