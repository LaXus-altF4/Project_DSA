# Dong goi ban phat hanh: release/Project_DSA/ + release/Project_DSA_25300003.zip + release/Project_DSA_source.zip
# (File nay chi dung ky tu ASCII: Windows PowerShell 5.1 doc .ps1 khong BOM theo bang ma ANSI.)
# Chay: powershell -ExecutionPolicy Bypass -File make_release.ps1
# Luu y: data/ va ma nguon lay tu commit HEAD (git), khong lay ban dang sua trong working tree.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Fail([string]$msg) { Write-Host $msg -ForegroundColor Red; exit 1 }

# Thay cho `$ErrorActionPreference`: lenh native khong tu nem loi.
function Run([scriptblock]$cmd, [string]$what) {
    & $cmd
    if ($LASTEXITCODE -ne 0) { Fail "FAILED: $what" }
}

if (git status --porcelain) {
    Write-Host 'Canh bao: working tree chua commit - data/ va zip ma nguon chi lay tu HEAD.' -ForegroundColor Yellow
}

# 1. Build release
Run { & powershell -NoProfile -ExecutionPolicy Bypass -File build.ps1 } 'build.ps1'
Run { & powershell -NoProfile -ExecutionPolicy Bypass -File build_server.ps1 } 'build_server.ps1'

# 2. Kiem tra khong phu thuoc DLL MinGW
$objdump = Get-Command objdump -ErrorAction SilentlyContinue
if ($objdump) {
    foreach ($exe in 'build\app.exe', 'build\LabApp.exe') {
        $dlls = & $objdump.Source -p $exe | Select-String 'DLL Name'
        if ($dlls | Select-String 'libstdc\+\+|libgcc_s|libwinpthread') { Fail "$exe con phu thuoc DLL MinGW" }
    }
    Write-Host 'OK: exe khong phu thuoc DLL MinGW' -ForegroundColor Green
} else {
    Write-Host 'Canh bao: khong co objdump trong PATH - bo qua kiem tra DLL.' -ForegroundColor Yellow
}

# 3. Dung thu muc release/Project_DSA
$root = Join-Path $PSScriptRoot 'release'
$out = Join-Path $root 'Project_DSA'
if (Test-Path $root) { Remove-Item -Recurse -Force $root }
New-Item -ItemType Directory -Force $out | Out-Null

Copy-Item build\LabApp.exe, build\app.exe $out

# web/: chi cac file da commit; bo tai lieu noi bo. Giu mock.js (api.js/main.js import tinh).
foreach ($f in (git ls-files web)) {
    if ($f -eq 'web/API_REQUESTS.md' -or $f -eq 'web/DESIGN.md') { continue }
    $dest = Join-Path $out $f
    New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
    Copy-Item -LiteralPath $f $dest
}

# data/ sach lay tu HEAD
$tmpData = Join-Path $root '_data.zip'
Run { git archive --format=zip -o $tmpData HEAD data } 'git archive data'
Expand-Archive -LiteralPath $tmpData -DestinationPath $out
Remove-Item $tmpData

New-Item -ItemType Directory -Force (Join-Path $out 'docs') | Out-Null
Copy-Item docs\demo-checklist.md (Join-Path $out 'docs')
Copy-Item docs\README_RUN.txt (Join-Path $out 'README_RUN.txt')

# 4. Nen ban chay
$zip = Join-Path $root 'Project_DSA_25300003.zip'
Push-Location $root
Run { & "$env:SystemRoot\System32\tar.exe" -a -c -f Project_DSA_25300003.zip Project_DSA } 'tar zip'
Pop-Location

# 5. Zip ma nguon
Run { git archive --format=zip --prefix=Project_DSA/ -o (Join-Path $root 'Project_DSA_source.zip') HEAD } 'git archive source'

Write-Host ''
Get-ChildItem $root -Filter *.zip | ForEach-Object { Write-Host ("{0}  {1:N0} KB" -f $_.Name, ($_.Length / 1KB)) }
Write-Host 'DONE' -ForegroundColor Green
