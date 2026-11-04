# Build API server + web (build/LabApp.exe).
# (File nay chi dung ky tu ASCII: Windows PowerShell 5.1 doc .ps1 khong BOM theo bang ma ANSI.)
# Chay tu CMD:        powershell -ExecutionPolicy Bypass -File build_server.ps1
# Chay tu PowerShell: .\build_server.ps1
# - Loi (src/*.cpp tru main.cpp va UI.cpp cua console) + server/*.cpp.
# - third_party/ them bang -isystem: canh bao trong thu vien ngoai khong lam hong -Werror.
# - cpp-httplib can Windows 10+ (_WIN32_WINNT=0x0A00) va Winsock (-lws2_32).
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

New-Item -ItemType Directory -Force build | Out-Null

$coreSources = @(Get-ChildItem src -Filter *.cpp |
    Where-Object { $_.Name -ne 'main.cpp' -and $_.Name -ne 'UI.cpp' } |
    ForEach-Object { $_.FullName })
$serverSources = @(Get-ChildItem server -Filter *.cpp | ForEach-Object { $_.FullName })

Write-Host 'Building build/LabApp.exe ...'
& g++ -std=c++17 -Wall -Wextra -Werror -g -O1 -D_WIN32_WINNT=0x0A00 -Iinclude -Iserver -isystem third_party `
    @coreSources @serverSources -o build/LabApp.exe -lws2_32
if ($LASTEXITCODE -ne 0) {
    Write-Host 'BUILD FAILED' -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host 'OK: build/LabApp.exe' -ForegroundColor Green
Write-Host 'Chay: .\build\LabApp.exe   (tu mo trinh duyet; --no-browser de tat, --port <n> de doi cong)'
