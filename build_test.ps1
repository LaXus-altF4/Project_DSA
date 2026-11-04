# Build va chay unit test cua loi CTDL.
# (File nay chi dung ky tu ASCII: Windows PowerShell 5.1 doc .ps1 khong BOM theo bang ma ANSI.)
# Chay tu CMD:        powershell -ExecutionPolicy Bypass -File build_test.ps1
# Chay tu PowerShell: .\build_test.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

New-Item -ItemType Directory -Force build | Out-Null

# Loi (tru main.cpp cua console) + file test. -Werror: moi canh bao deu lam build that bai.
$coreSources = @(Get-ChildItem src -Filter *.cpp | Where-Object { $_.Name -ne 'main.cpp' } | ForEach-Object { $_.FullName })

Write-Host 'Building build/test.exe ...'
& g++ -std=c++17 -Wall -Wextra -Werror -g -Iinclude tests/test_main.cpp @coreSources -o build/test.exe
if ($LASTEXITCODE -ne 0) {
    Write-Host 'BUILD FAILED' -ForegroundColor Red
    exit $LASTEXITCODE
}

& ./build/test.exe
exit $LASTEXITCODE
