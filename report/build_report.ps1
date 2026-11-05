# Bien dich bao cao LaTeX -> report/main.pdf bang XeLaTeX (MiKTeX).
# (File nay chi dung ky tu ASCII: Windows PowerShell 5.1 doc .ps1 khong BOM theo bang ma ANSI.)
# Chay tu CMD:        powershell -ExecutionPolicy Bypass -File report\build_report.ps1
# Chay tu PowerShell: .\report\build_report.ps1
# Can: MiKTeX (xelatex) va font Times New Roman, Consolas (co san tren Windows).
# Chay xelatex 2 lan de muc luc va tham chieu cheo dung. Them -Clean de xoa file phu sau khi build.
param([switch]$Clean)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Get-Command xelatex -ErrorAction SilentlyContinue)) {
    Write-Host 'Khong tim thay xelatex. Hay cai MiKTeX (https://miktex.org) va mo lai terminal.' -ForegroundColor Red
    exit 1
}

for ($pass = 1; $pass -le 2; $pass++) {
    Write-Host "xelatex lan $pass ..."
    & xelatex -interaction=nonstopmode -halt-on-error -file-line-error main.tex | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'BUILD FAILED - xem report\main.log (tim dong bat dau bang "!" hoac "main.tex:")' -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

if (-not (Test-Path main.pdf)) { Write-Host 'Khong thay main.pdf' -ForegroundColor Red; exit 1 }
$log = Get-Content main.log -Raw
if ($log -match 'Missing character') { Write-Host 'Canh bao: co ky tu thieu glyph (xem main.log).' -ForegroundColor Yellow }
if ($log -match 'undefined references|There were undefined') { Write-Host 'Canh bao: con tham chieu chua dinh nghia (xem main.log).' -ForegroundColor Yellow }

if ($Clean) {
    Remove-Item -ErrorAction SilentlyContinue main.aux, main.log, main.toc, main.lof, main.lot, main.out
}
Write-Host 'OK: report/main.pdf' -ForegroundColor Green
