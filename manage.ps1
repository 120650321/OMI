#!/usr/bin/env pwsh
param(
    [Parameter(Position = 0)]
    [ValidateSet("start", "stop", "restart", "status")]
    [string]$Action = "start"
)

$ErrorActionPreference = "Stop"
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path

$BACKEND_DIR = Join-Path $ROOT "backend"
$FRONTEND_DIR = Join-Path $ROOT "frontend"
$PYTHON = Join-Path $ROOT ".venv-1\Scripts\python.exe"
$BACKEND_SCRIPT = Join-Path $ROOT "backend\run_server.py"
$BACKEND_PORT = 8000
$FRONTEND_PORT = 3000
$PID_FILE = Join-Path $ROOT ".service_pids.txt"

function Write-Banner {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  OMI System Manager" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Get-PortProcess {
    param([int]$Port)
    $conn = netstat -ano 2>$null | Select-String ":$Port " | Select-String "LISTENING"
    if ($conn) {
        $line = if ($conn -is [string]) { $conn } else { $conn.Line }
        $parts = @($line -split '\s+' | Where-Object { $_ -match '^\d+$' })
        if ($parts.Count -gt 0) { return [int]$parts[-1] }
    }
    return 0
}

function Test-PortInUse {
    param([int]$Port)
    return (Get-PortProcess -Port $Port) -ne 0
}

function Wait-ForPort {
    param([int]$Port, [int]$TimeoutSeconds = 30)
    $elapsed = 0
    while (-not (Test-PortInUse -Port $Port) -and $elapsed -lt $TimeoutSeconds) {
        Start-Sleep -Milliseconds 500
        $elapsed += 0.5
    }
    return Test-PortInUse -Port $Port
}

function Stop-ProcessOnPort {
    param([int]$Port, [string]$ServiceName)
    $targetPid = Get-PortProcess -Port $Port
    if ($targetPid -eq 0) {
        Write-Host "  [OK] $ServiceName not running" -ForegroundColor Gray
        return
    }
    Write-Host "  [..] Stopping $ServiceName (PID: $targetPid)..." -ForegroundColor Yellow
    try {
        Stop-Process -Id $targetPid -Force -ErrorAction Stop
        Start-Sleep -Seconds 1
        if (Test-PortInUse -Port $Port) {
            Write-Host "  [!!] Failed to stop $ServiceName, PID: $targetPid" -ForegroundColor Red
        } else {
            Write-Host "  [OK] $ServiceName stopped" -ForegroundColor Green
        }
    } catch {
        Write-Host "  [!!] Error stopping $ServiceName : $_" -ForegroundColor Red
    }
}

function Invoke-Status {
    Write-Banner
    Write-Host "Service Status:" -ForegroundColor Cyan
    Write-Host ""

    $backendPid = Get-PortProcess -Port $BACKEND_PORT
    $frontendPid = Get-PortProcess -Port $FRONTEND_PORT

    if ($backendPid -ne 0) {
        try {
            $proc = Get-Process -Id $backendPid -ErrorAction SilentlyContinue
            $mem = if ($proc) { [math]::Round($proc.WorkingSet64 / 1MB, 1) } else { "N/A" }
            Write-Host "  Backend  (port $BACKEND_PORT):   RUNNING  PID: $backendPid  Memory: ${mem}MB" -ForegroundColor Green
        } catch {
            Write-Host "  Backend  (port $BACKEND_PORT):   RUNNING  PID: $backendPid" -ForegroundColor Green
        }
    } else {
        Write-Host "  Backend  (port $BACKEND_PORT):   STOPPED" -ForegroundColor Red
    }

    if ($frontendPid -ne 0) {
        try {
            $proc = Get-Process -Id $frontendPid -ErrorAction SilentlyContinue
            $mem = if ($proc) { [math]::Round($proc.WorkingSet64 / 1MB, 1) } else { "N/A" }
            Write-Host "  Frontend (port $FRONTEND_PORT):   RUNNING  PID: $frontendPid  Memory: ${mem}MB" -ForegroundColor Green
        } catch {
            Write-Host "  Frontend (port $FRONTEND_PORT):   RUNNING  PID: $frontendPid" -ForegroundColor Green
        }
    } else {
        Write-Host "  Frontend (port $FRONTEND_PORT):   STOPPED" -ForegroundColor Red
    }

    Write-Host ""
    if ($backendPid -ne 0 -and $frontendPid -ne 0) {
        Write-Host "  URL: http://localhost:$FRONTEND_PORT" -ForegroundColor Cyan
        Write-Host "  API: http://localhost:$BACKEND_PORT/docs" -ForegroundColor Cyan
    }
    Write-Host ""
}

function Invoke-Stop {
    Write-Banner
    Write-Host "Stopping all services..." -ForegroundColor Yellow
    Write-Host ""

    Stop-ProcessOnPort -Port $FRONTEND_PORT -ServiceName "Frontend"
    Stop-ProcessOnPort -Port $BACKEND_PORT -ServiceName "Backend"

    if (Test-Path $PID_FILE) {
        Remove-Item $PID_FILE -Force -ErrorAction SilentlyContinue
    }

    Write-Host ""
    Write-Host "All services stopped." -ForegroundColor Green
    Write-Host ""
}

function Invoke-Start {
    Write-Banner

    $backendRunning = Test-PortInUse -Port $BACKEND_PORT
    $frontendRunning = Test-PortInUse -Port $FRONTEND_PORT

    if ($backendRunning -and $frontendRunning) {
        Write-Host "All services are already running!" -ForegroundColor Green
        Write-Host "  Frontend: http://localhost:$FRONTEND_PORT" -ForegroundColor Cyan
        Write-Host "  Backend:  http://localhost:$BACKEND_PORT" -ForegroundColor Cyan
        Write-Host "  API Docs: http://localhost:$BACKEND_PORT/docs" -ForegroundColor Cyan
        Write-Host ""
        return
    }

    Write-Host "Starting services..." -ForegroundColor Cyan
    Write-Host ""
    $logDir = Join-Path $ROOT "logs"
    if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

    # Start Backend
    if ($backendRunning) {
        Write-Host "  [OK] Backend already running (port $BACKEND_PORT)" -ForegroundColor Gray
    } else {
        if (-not (Test-Path $PYTHON)) {
            Write-Host "  [!!] Error: Python not found: $PYTHON" -ForegroundColor Red
            Write-Host "  Please ensure .venv-1 virtual environment exists" -ForegroundColor Red
            return
        }
        if (-not (Test-Path $BACKEND_SCRIPT)) {
            Write-Host "  [!!] Error: Script not found: $BACKEND_SCRIPT" -ForegroundColor Red
            return
        }
        Write-Host "  [..] Starting backend..." -ForegroundColor Yellow
        $cmdArgs = "/c start `"OMI Backend`" /B `"$PYTHON`" `"$BACKEND_SCRIPT`""
        $proc = Start-Process -FilePath "cmd" -ArgumentList $cmdArgs -NoNewWindow -PassThru

        if (Wait-ForPort -Port $BACKEND_PORT -TimeoutSeconds 15) {
            Write-Host "  [OK] Backend started (port $BACKEND_PORT, PID: $($proc.Id))" -ForegroundColor Green
        } else {
            Write-Host "  [!!] Backend startup timeout" -ForegroundColor Red
            return
        }
    }

    # Start Frontend
    if ($frontendRunning) {
        Write-Host "  [OK] Frontend already running (port $FRONTEND_PORT)" -ForegroundColor Gray
    } else {
        if (-not (Test-Path (Join-Path $FRONTEND_DIR "node_modules"))) {
            Write-Host "  [..] Installing frontend dependencies..." -ForegroundColor Yellow
            Push-Location $FRONTEND_DIR
            try {
                npm install 2>&1 | Out-Null
                Write-Host "  [OK] Frontend dependencies installed" -ForegroundColor Green
            } catch {
                Write-Host "  [!!] Failed to install dependencies: $_" -ForegroundColor Red
                Pop-Location
                return
            }
            Pop-Location
        }
        Write-Host "  [..] Starting frontend..." -ForegroundColor Yellow
        $vitePath = Join-Path $FRONTEND_DIR "node_modules\.bin\vite.cmd"
        if (-not (Test-Path $vitePath)) {
            Write-Host "  [!!] Error: vite not found at $vitePath" -ForegroundColor Red
            return
        }
        $cmdArgs = "/c start `"OMI Frontend`" /B `"$vitePath`""
        $proc = Start-Process -FilePath "cmd" -ArgumentList $cmdArgs -WorkingDirectory $FRONTEND_DIR -NoNewWindow -PassThru

        if (Wait-ForPort -Port $FRONTEND_PORT -TimeoutSeconds 30) {
            Write-Host "  [OK] Frontend started (port $FRONTEND_PORT, PID: $($proc.Id))" -ForegroundColor Green
        } else {
            Write-Host "  [!!] Frontend startup timeout" -ForegroundColor Red
            return
        }
    }

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  All services started!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Frontend:  http://localhost:$FRONTEND_PORT" -ForegroundColor Cyan
    Write-Host "  API Docs:  http://localhost:$BACKEND_PORT/docs" -ForegroundColor Cyan
    Write-Host "  Login:     admin / admin123" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Stop:      .\manage.ps1 stop" -ForegroundColor Gray
    Write-Host ""
}

switch ($Action) {
    "start"   { Invoke-Start }
    "stop"    { Invoke-Stop }
    "restart" {
        Invoke-Stop
        Start-Sleep -Seconds 2
        Invoke-Start
    }
    "status"  { Invoke-Status }
}