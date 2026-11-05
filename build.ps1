# Build chuong trinh console (build/app.exe).
# (File nay chi dung ky tu ASCII: Windows PowerShell 5.1 doc .ps1 khong BOM theo bang ma ANSI.)
# Chay tu CMD:        powershell -ExecutionPolicy Bypass -File build.ps1
# Chay tu PowerShell: .\build.ps1
# Mac dinh build RELEASE: -O2 -DNDEBUG -static (exe khong can DLL MinGW). Them -Dev de build debug (-g -O0, bat assert).
param([switch]$Dev)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

New-Item -ItemType Directory -Force build | Out-Null

$sources = @(Get-ChildItem src -Filter *.cpp | ForEach-Object { $_.FullName })

if ($Dev) { $flags = @('-g', '-O0') } else { $flags = @('-O2', '-DNDEBUG', '-static') }

Write-Host 'Building build/app.exe ...'
& g++ -std=c++17 -Wall -Wextra @flags -Iinclude @sources -o build/app.exe
if ($LASTEXITCODE -ne 0) {
    Write-Host 'BUILD FAILED' -ForegroundColor Red
    exit $LASTEXITCODE
}
Write-Host 'OK: build/app.exe' -ForegroundColor Green
Write-Host 'Chay: .\build\app.exe   (lan dau chua co data/ se hoi tao du lieu mau; hoac .\build\app.exe --seed)'
