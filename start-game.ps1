$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$localUrl = "http://127.0.0.1:4173/"
$healthUrl = "http://127.0.0.1:4173/api/health"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js가 필요합니다. https://nodejs.org 에서 LTS 버전을 설치하세요." -ForegroundColor Red
    Read-Host "Enter를 누르면 종료합니다"
    exit 1
}

$serverReady = $false
try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 1
    $serverReady = $health.ok -eq $true
} catch {}

if (-not $serverReady) {
    Start-Process -FilePath "node" -ArgumentList "server.mjs" -WorkingDirectory $root -WindowStyle Hidden
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 200
        try {
            $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 1
            if ($health.ok -eq $true) { $serverReady = $true; break }
        } catch {}
    }
}

if (-not $serverReady) {
    Write-Host "게임 서버를 시작하지 못했습니다. 4173 포트 사용 여부를 확인하세요." -ForegroundColor Red
    Read-Host "Enter를 누르면 종료합니다"
    exit 1
}

$lanAddress = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notmatch '^(127\.|169\.254\.)' -and $_.PrefixOrigin -ne 'WellKnown' } |
    Select-Object -First 1 -ExpandProperty IPAddress
if (-not $lanAddress) {
    $ipconfigText = ipconfig | Out-String
    $match = [regex]::Match($ipconfigText, 'IPv4[^:]*:\s*(\d{1,3}(?:\.\d{1,3}){3})')
    if ($match.Success -and $match.Groups[1].Value -notmatch '^(127\.|169\.254\.)') {
        $lanAddress = $match.Groups[1].Value
    }
}

Write-Host "주식 배틀그라운드 서버가 실행 중입니다." -ForegroundColor Green
Write-Host "내 PC: $localUrl"
if ($lanAddress) {
    Write-Host "같은 와이파이 참가 주소: http://${lanAddress}:4173/" -ForegroundColor Cyan
}
Start-Process $localUrl
