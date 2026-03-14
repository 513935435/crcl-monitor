$ErrorActionPreference = "Stop"

$BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$StateDir = Join-Path $BaseDir ".state"
$SupervisorPidFile = Join-Path $StateDir "listener_supervisor.pid"
$TaskName = "CodexFeishuListenerSupervisor"
$LauncherScript = Join-Path $BaseDir "listener_launcher.vbs"

function Get-RunningPid {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    return $null
  }

  $raw = (Get-Content -Path $Path -ErrorAction SilentlyContinue | Select-Object -First 1).Trim()
  if (-not $raw) {
    return $null
  }

  try {
    $pidValue = [int]$raw
    $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($process) {
      return $pidValue
    }
  }
  catch {
  }

  return $null
}

New-Item -ItemType Directory -Path $StateDir -Force | Out-Null

$runningPid = Get-RunningPid $SupervisorPidFile
if ($runningPid) {
  Write-Host "Listener supervisor is already running. PID: $runningPid"
  exit 0
}

try {
  & (Join-Path $BaseDir "listener_task_install.ps1")
  Start-ScheduledTask -TaskName $TaskName
}
catch {
  & cscript //nologo $LauncherScript
}

$runningPid = $null
for ($index = 0; $index -lt 20; $index += 1) {
  Start-Sleep -Milliseconds 500
  $runningPid = Get-RunningPid $SupervisorPidFile
  if ($runningPid) {
    break
  }
}

if (-not $runningPid) {
  throw "Listener supervisor failed to start."
}

Write-Host "Listener supervisor started. PID: $runningPid"
