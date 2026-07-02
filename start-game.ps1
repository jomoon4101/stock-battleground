param(
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$localUrl = "http://127.0.0.1:4173/"
$healthUrl = "http://127.0.0.1:4173/api/health"

function Test-GameServer {
    try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 1
        return $health.ok -eq $true
    } catch {
        return $false
    }
}

function Find-NodeExecutable {
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }

    $candidates = @(
        "C:\Program Files\nodejs\node.exe",
        "${env:LOCALAPPDATA}\Programs\nodejs\node.exe",
        "${env:USERPROFILE}\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
    }
    return $null
}

try {
    $nodeExecutable = Find-NodeExecutable
    if (-not $nodeExecutable) {
        throw "Node.js를 찾을 수 없습니다. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행해 주세요."
    }

    $serverReady = Test-GameServer
    $startedServer = $false
    if (-not $serverReady) {
        $serverStart = [System.Diagnostics.ProcessStartInfo]::new()
        $serverStart.FileName = $nodeExecutable
        $serverStart.Arguments = "server.mjs"
        $serverStart.WorkingDirectory = $root
        $serverStart.UseShellExecute = $true
        $serverStart.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
        $serverProcess = [System.Diagnostics.Process]::Start($serverStart)
        $startedServer = $true

        for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
            Start-Sleep -Milliseconds 250
            if (Test-GameServer) {
                $serverReady = $true
                break
            }
        }
    }

    if (-not $serverReady) {
        $details = if ($serverProcess -and $serverProcess.HasExited) { "서버 종료 코드: $($serverProcess.ExitCode)" } else { "4173 포트를 다른 프로그램이 사용 중인지 확인해 주세요." }
        throw "게임 서버를 시작하지 못했습니다.`n$details"
    }

    $lanAddress = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.PrefixOrigin -ne 'WellKnown' } |
        Select-Object -First 1 -ExpandProperty IPAddress

    Write-Host "주식서바이벌 서버가 실행 중입니다." -ForegroundColor Green
    Write-Host "내 PC: $localUrl" -ForegroundColor Cyan
    if ($lanAddress) {
        Write-Host "같은 와이파이 참가 주소: http://${lanAddress}:4173/" -ForegroundColor Cyan
    }

    if ($NoBrowser) {
        Write-Host "실행 도우미 진단을 통과했습니다." -ForegroundColor Green
        if ($startedServer -and -not $serverProcess.HasExited) {
            $serverProcess.Kill()
            $serverProcess.WaitForExit()
        }
        exit 0
    }

    $browserStart = [System.Diagnostics.ProcessStartInfo]::new()
    $browserStart.FileName = $localUrl
    $browserStart.UseShellExecute = $true
    [System.Diagnostics.Process]::Start($browserStart) | Out-Null

    if ($startedServer) {
        Write-Host "게임 중에는 이 창을 닫지 마세요. 창을 닫으면 서버가 종료됩니다." -ForegroundColor Yellow
        $serverProcess.WaitForExit()
        if ($serverProcess.ExitCode -ne 0) {
            throw "게임 서버가 종료되었습니다. 종료 코드: $($serverProcess.ExitCode)"
        }
    }
} catch {
    Write-Host "게임 실행 실패" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Yellow
    if (-not $NoBrowser) { Read-Host "Enter를 누르면 창이 닫힙니다" }
    exit 1
}
