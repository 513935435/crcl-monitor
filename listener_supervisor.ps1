$ErrorActionPreference = "Stop"

$BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$StateDir = Join-Path $BaseDir ".state"
$SupervisorPidFile = Join-Path $StateDir "listener_supervisor.pid"
$ListenerPidFile = Join-Path $StateDir "listener.pid"
$SupervisorLog = Join-Path $StateDir "listener_supervisor.log"
$RunnerScript = Join-Path $BaseDir "listener_runner.cmd"

function Write-Log {
  param([string]$Message)
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -Path $SupervisorLog -Value "[$timestamp] $Message" -Encoding UTF8
}

function Remove-IfExists {
  param([string]$Path)
  if (Test-Path $Path) {
    Remove-Item $Path -Force -ErrorAction SilentlyContinue
  }
}

New-Item -ItemType Directory -Path $StateDir -Force | Out-Null
Set-Content -Path $SupervisorPidFile -Value $PID -Encoding UTF8
Write-Log "Supervisor started with PID $PID"

Push-Location $BaseDir
try {
  while ($true) {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCommand) {
      Write-Log "Node.js not found. Retry in 10 seconds."
      Start-Sleep -Seconds 10
      continue
    }

    $process = Start-Process -FilePath $RunnerScript -WorkingDirectory $BaseDir -PassThru -WindowStyle Hidden
    Set-Content -Path $ListenerPidFile -Value $process.Id -Encoding UTF8
    Write-Log "Listener started with PID $($process.Id)"

    $process.WaitForExit()
    $exitCode = $process.ExitCode
    Remove-IfExists $ListenerPidFile
    Write-Log "Listener exited with code $exitCode"

    Start-Sleep -Seconds 3
  }
}
finally {
  Remove-IfExists $ListenerPidFile
  Remove-IfExists $SupervisorPidFile
  Write-Log "Supervisor stopped"
  Pop-Location
}
