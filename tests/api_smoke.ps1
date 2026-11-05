# Smoke test API: chay LabApp.exe tren du lieu mau (thu muc tam), goi moi endpoint theo kich ban demo
# (docs/web-ui-spec.md muc 6) bang Invoke-RestMethod, in PASS/FAIL, exit 1 neu co loi.
# (File nay chi dung ky tu ASCII: Windows PowerShell 5.1 doc .ps1 khong BOM theo bang ma ANSI.
#  Chuoi tieng Viet duoc dung tu ma Unicode de kiem tra UTF-8.)
# Chay: powershell -ExecutionPolicy Bypass -File tests\api_smoke.ps1      (can build truoc: .\build_server.ps1)
param([int]$Port = 18080)

$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

$exe = Join-Path (Get-Location) 'build\LabApp.exe'
if (-not (Test-Path $exe)) { Write-Host 'Chua co build\LabApp.exe - hay chay .\build_server.ps1' -ForegroundColor Red; exit 1 }

$script:pass = 0
$script:fail = 0
function Check([string]$name, [bool]$cond) {
    if ($cond) { $script:pass++; Write-Host "  PASS  $name" -ForegroundColor Green }
    else       { $script:fail++; Write-Host "  FAIL  $name" -ForegroundColor Red }
}

# Goi API. Body (hashtable) -> JSON -> byte UTF-8. Tra ve @{ ok; status; body; code }.
function Api([string]$method, [string]$path, $body = $null, [string]$raw = $null) {
    $params = @{ Method = $method; Uri = "$script:base/api$path"; UseBasicParsing = $true }
    if ($null -ne $body -or $raw) {
        $text = if ($raw) { $raw } else { $body | ConvertTo-Json -Depth 5 -Compress }
        $params.Body = [System.Text.Encoding]::UTF8.GetBytes($text)
        $params.ContentType = 'application/json; charset=utf-8'
    }
    try {
        $r = Invoke-RestMethod @params
        return @{ ok = $true; status = 200; body = $r; code = $null }
    } catch [System.Net.WebException] {
        $resp = $_.Exception.Response
        if ($null -eq $resp) { throw }
        # PS 5.1 da doc het stream loi va dua noi dung vao ErrorDetails.Message.
        $text = if ($_.ErrorDetails) { $_.ErrorDetails.Message } else { '' }
        if (-not $text) {
            $reader = New-Object System.IO.StreamReader($resp.GetResponseStream(), [System.Text.Encoding]::UTF8)
            $text = $reader.ReadToEnd()
        }
        $json = $text | ConvertFrom-Json
        return @{ ok = $false; status = [int]$resp.StatusCode; body = $json; code = $json.error.code }
    }
}

function StartServer([string]$dataDir, [int]$port, [string]$logFile) {
    $p = Start-Process -FilePath $exe -ArgumentList @('--data', "`"$dataDir`"", '--port', $port, '--seed', '--no-browser') `
        -PassThru -NoNewWindow -RedirectStandardOutput $logFile -RedirectStandardError "$logFile.err"
    $url = $null
    for ($i = 0; $i -lt 100 -and -not $url; $i++) {
        Start-Sleep -Milliseconds 200
        if ($p.HasExited) { break }
        if (-not (Test-Path $logFile)) { continue }
        # Server dang ghi file log: mo voi FileShare.ReadWrite.
        $fs = New-Object System.IO.FileStream($logFile, 'Open', 'Read', 'ReadWrite')
        $log = (New-Object System.IO.StreamReader($fs, [System.Text.Encoding]::UTF8)).ReadToEnd()
        $fs.Dispose()
        if ($log -match 'http://127\.0\.0\.1:(\d+)') { $url = "http://127.0.0.1:$($Matches[1])" }
    }
    return @{ proc = $p; url = $url }
}

# Chuoi tieng Viet tu ma Unicode.
$vrName   = 'K' + [char]0x00ED + 'nh th' + [char]0x1EF1 + 'c t' + [char]0x1EBF + ' ' + [char]0x1EA3 + 'o'   # Kinh thuc te ao (co dau)
$testName = 'Thi' + [char]0x1EBF + 't b' + [char]0x1ECB + ' th' + [char]0x1EED                          # Thiet bi thu (co dau)
$stuName  = 'L' + [char]0x00EA + ' V' + [char]0x0103 + 'n An'                                           # Le Van An (co dau)

$tmp = Join-Path $env:TEMP ("labapp_smoke_" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$data1 = Join-Path $tmp 'data1'
$data2 = Join-Path $tmp 'data2'
New-Item -ItemType Directory -Force $data1, $data2 | Out-Null

$srv = StartServer $data1 $Port (Join-Path $tmp 'server1.log')
$srv2 = $null
try {
    if (-not $srv.url) { throw 'Server khong khoi dong duoc (xem log trong thu muc tam).' }
    $script:base = $srv.url
    Write-Host "Server: $script:base  (du lieu tam: $data1)"

    Write-Host '[1] Dong ho, tong quan, thiet bi, do thi'
    $r = Api GET '/clock'
    Check 'GET /clock co hour va text' ($r.ok -and $r.body.hour -gt 0 -and $r.body.text -match '^\d\d/\d\d/\d{4} \d\d:00$')
    $startHour = $r.body.hour

    $r = Api GET '/stats?within=24'
    Check 'GET /stats: 18 thiet bi, >= 2 phieu qua han' ($r.ok -and $r.body.deviceCount -eq 18 -and $r.body.overdueRecords -ge 2)
    Check 'stats: bat bien tong don vi' ($r.body.available + $r.body.borrowed + $r.body.onHold + $r.body.maintenance -eq $r.body.totalUnits)
    Check 'stats: topBorrowed co du lieu' ($r.body.topBorrowed.Count -ge 1 -and $r.body.topBorrowed[0].timesBorrowed -ge 1)
    Check 'stats: expiringHolds (within=24) co VR01' (@($r.body.expiringHolds | Where-Object { $_.deviceId -eq 'VR01' }).Count -eq 1)
    $r = Api GET '/stats'
    Check 'stats mac dinh within=6: chua co ai sap het han' ($r.ok -and $r.body.expiringHolds.Count -eq 0)

    $r = Api GET '/records'
    Check 'GET /records: counts 52/5/2/47, total = all' ($r.ok -and $r.body.counts.all -eq 52 -and $r.body.counts.open -eq 5 -and $r.body.counts.overdue -eq 2 -and $r.body.counts.returned -eq 47 -and $r.body.total -eq 52)
    $r = Api GET '/records?status=open&pageSize=100'
    $openIds = @($r.body.records | ForEach-Object { $_.recordId })
    Check 'status=open: total = counts.open = 5' ($r.ok -and $r.body.total -eq 5 -and $r.body.counts.open -eq 5 -and $openIds.Count -eq 5)
    $r = Api GET '/records?status=overdue&pageSize=100'
    $odIds = @($r.body.records | ForEach-Object { $_.recordId })
    Check 'status=overdue: total = counts.overdue = 2, nam trong open' ($r.ok -and $r.body.total -eq 2 -and $r.body.counts.overdue -eq 2 -and @($odIds | Where-Object { $openIds -contains $_ }).Count -eq 2)
    $r = Api GET '/records?status=returned'
    Check 'status=returned: total = counts.returned = 47' ($r.ok -and $r.body.total -eq 47 -and $r.body.counts.returned -eq 47)
    $r = Api GET '/records?query=pm001'
    Check 'query: counts tren tap khop, all = open + returned = total' ($r.ok -and $r.body.counts.all -gt 0 -and $r.body.counts.all -lt 52 -and $r.body.counts.all -eq $r.body.counts.open + $r.body.counts.returned -and $r.body.total -eq $r.body.counts.all)
    $r = Api GET '/records?query=khong-ton-tai-xyz'
    Check 'query khong khop: counts toan 0' ($r.ok -and $r.body.total -eq 0 -and $r.body.counts.all -eq 0 -and $r.body.counts.open -eq 0 -and $r.body.counts.overdue -eq 0 -and $r.body.counts.returned -eq 0)

    $r = Api GET '/devices'
    Check 'GET /devices: 18 thiet bi' ($r.ok -and $r.body.count -eq 18 -and $r.body.devices.Count -eq 18)
    $vr = $r.body.devices | Where-Object { $_.id -eq 'VR01' }
    Check 'UTF-8: ten VR01 dung tieng Viet' ($vr.name -ceq $vrName)
    $r = Api GET '/devices?status=maintenance'
    Check 'GET /devices?status=maintenance co SLD01' ($r.ok -and @($r.body.devices | Where-Object { $_.id -eq 'SLD01' }).Count -eq 1)
    $r = Api GET '/devices?query=vr'
    Check 'GET /devices?query=vr co VR01, TC01' ($r.ok -and (@($r.body.devices.id) -contains 'VR01') -and (@($r.body.devices.id) -contains 'TC01'))

    $r = Api GET '/devices/VR01'
    Check 'GET /devices/VR01: hang doi 2 nguoi, nguoi dau dang giu' ($r.ok -and $r.body.queue.Count -eq 2 -and $r.body.queue[0].holding -and $r.body.queue[0].hoursLeft -gt 0)
    Check 'VR01: nguoi thu 2 chua giu (hoursLeft null)' ($null -eq $r.body.queue[1].hoursLeft -and $r.body.nextQueuePosition -eq 3)
    Check 'VR01: goi y top 1 la TC01' ($r.body.suggestions.Count -ge 1 -and $r.body.suggestions[0].id -eq 'TC01')

    $r = Api GET '/graph'
    $maxW = ($r.body.edges | Measure-Object weight -Maximum).Maximum
    $vrEdge = $r.body.edges | Where-Object { $_.from -eq 'TC01' -and $_.to -eq 'VR01' }
    Check 'GET /graph: 18 dinh, canh TC01-VR01 thuoc nhom nang nhat' ($r.ok -and $r.body.nodes.Count -eq 18 -and $null -ne $vrEdge -and $vrEdge.weight -eq $maxW)
    Check 'Moi canh xuat hien 1 lan (from < to)' (@($r.body.edges | Where-Object { [string]::CompareOrdinal($_.from, $_.to) -ge 0 }).Count -eq 0)

    Write-Host '[2] Them / sua thiet bi'
    $r = Api POST '/devices' @{ id = 'TST01'; name = $testName; total = 1 }
    Check 'POST /devices TST01' ($r.ok -and $r.body.device.id -eq 'TST01' -and $r.body.device.status -eq 'available')
    Check 'UTF-8: ten gui len giu nguyen' ($r.body.device.name -ceq $testName)
    $r = Api POST '/devices' @{ id = 'TST01'; name = 'X'; total = 1 }
    Check 'Them trung ma -> 409 DUPLICATE_DEVICE' ($r.status -eq 409 -and $r.code -eq 'DUPLICATE_DEVICE')
    $r = Api POST '/devices' @{ id = 'TST09'; name = 'X'; total = 0 }
    Check 'total = 0 -> 400 INVALID_INPUT' ($r.status -eq 400 -and $r.code -eq 'INVALID_INPUT')
    $r = Api POST '/devices' @{ id = 'TST09'; name = 'a,b'; total = 1 }
    Check 'Ten chua dau phay -> 400 INVALID_INPUT (M5)' ($r.status -eq 400 -and $r.code -eq 'INVALID_INPUT')
    $r = Api POST '/devices' @{ id = 'TST09'; name = 'X' }
    Check 'Thieu truong total -> 400 INVALID_INPUT' ($r.status -eq 400 -and $r.code -eq 'INVALID_INPUT')
    $r = Api PUT '/devices/TST01' @{ name = "$testName 2"; total = 1 }
    Check 'PUT /devices/TST01 doi ten' ($r.ok -and $r.body.device.name -ceq "$testName 2")

    Write-Host '[3] Muon het -> 3 SV dat truoc'
    $r = Api POST '/borrow' @{ studentId = '25300001'; studentName = $stuName; deviceIds = @('TST01', 'ARD01'); days = 2 }
    Check 'POST /borrow phieu 2 thiet bi' ($r.ok -and $r.body.record.open -and $r.body.record.devices.Count -eq 2 -and $r.body.record.studentName -ceq $stuName)
    $rec1 = $r.body.record.recordId
    Check 'Han tra = gio muon + 2*24' ($r.body.record.dueHour -eq $r.body.record.borrowHour + 48)
    $r = Api POST '/borrow' @{ studentId = '25300002'; studentName = 'SV B'; deviceIds = @('ARD01', 'TST01'); days = 2 }
    Check 'Muon mon het hang -> 409 OUT_OF_STOCK + unavailableIds' ($r.status -eq 409 -and $r.code -eq 'OUT_OF_STOCK' -and (@($r.body.error.details.unavailableIds) -join ',') -eq 'TST01')
    $r = Api POST '/borrow' @{ studentId = '25300002'; studentName = 'SV B'; deviceIds = @('ARD01', 'ARD01'); days = 2 }
    Check 'Trung ma trong phieu -> 409 DUPLICATE_DEVICE (M7)' ($r.code -eq 'DUPLICATE_DEVICE')
    $r = Api POST '/borrow' @{ studentId = '25300002'; studentName = 'SV B'; deviceIds = @('ARD01'); days = 31 }
    Check 'days = 31 -> 400 INVALID_INPUT (M9)' ($r.code -eq 'INVALID_INPUT')

    $pos = @()
    foreach ($s in @('25300011', '25300012', '25300013')) {
        $r = Api POST '/reservations/TST01' @{ studentId = $s; studentName = "SV $s" }
        $pos += $r.body.position
    }
    Check 'Dat truoc 3 SV -> vi tri 1,2,3' (($pos -join ',') -eq '1,2,3')
    $r = Api POST '/reservations/TST01' @{ studentId = '25300011'; studentName = 'SV 25300011' }
    Check 'Dat trung -> 409 ALREADY_QUEUED' ($r.code -eq 'ALREADY_QUEUED')
    $r = Api POST '/reservations/ARD01' @{ studentId = '25300011'; studentName = 'SV' }
    Check 'Dat truoc khi con hang -> 409 CAN_BORROW_DIRECTLY' ($r.code -eq 'CAN_BORROW_DIRECTLY')
    $r = Api POST '/reservations/TST01/claim' @{ studentId = '25300011' }
    Check 'Nhan khi chua duoc giu -> 409 NOT_HOLDING' ($r.code -eq 'NOT_HOLDING')
    $r = Api POST '/reservations/TST01/claim' @{ studentId = '99999999' }
    Check 'Nhan khi khong trong hang -> 404 NOT_IN_QUEUE' ($r.status -eq 404 -and $r.code -eq 'NOT_IN_QUEUE')

    Write-Host '[4] Tra -> nguoi dau hang duoc giu 24h'
    Api GET '/notifications' | Out-Null   # bo thong bao cu
    $r = Api GET "/records/$rec1"
    Check 'GET /records/{id}: dang mo, chua qua han' ($r.ok -and $r.body.record.open -and -not $r.body.record.overdue -and $r.body.record.lateDays -eq 0)
    $r = Api POST '/return' @{ recordId = $rec1 }
    Check 'POST /return' ($r.ok -and -not $r.body.record.open -and $r.body.record.fineFinal -and $r.body.record.fine -eq 0)
    $r = Api POST '/return' @{ recordId = $rec1 }
    Check 'Tra lai lan 2 -> 409 ALREADY_RETURNED' ($r.code -eq 'ALREADY_RETURNED')
    $r = Api GET '/notifications'
    $n = @($r.body.notifications | Where-Object { $_.deviceId -eq 'TST01' })
    Check 'Thong bao hold_granted cho SV dau hang' ($n.Count -eq 1 -and $n[0].type -eq 'hold_granted' -and $n[0].studentId -eq '25300011' -and $n[0].holdUntil -gt 0)
    $r = Api GET '/notifications'
    Check 'GET /notifications lay va xoa (lan 2 rong)' ($r.ok -and $r.body.notifications.Count -eq 0)
    $r = Api GET '/reservations/TST01'
    Check 'Nguoi dau dang giu, con 24 gio' ($r.ok -and $r.body.queue[0].holding -and $r.body.queue[0].hoursLeft -eq 24 -and $r.body.device.onHold -eq 1)

    Write-Host '[5] Tua +25 gio -> nguoi dau bi day xuong cuoi'
    $r = Api POST '/clock/advance' @{ hours = 25 }
    Check 'POST /clock/advance +25' ($r.ok -and $r.body.clock.hour -eq $startHour + 25 -and $r.body.pendingNotifications -ge 2)
    $r = Api GET '/notifications'
    $n = @($r.body.notifications | Where-Object { $_.deviceId -eq 'TST01' })
    Check 'Thong bao missed roi hold_granted cho nguoi ke' ($n.Count -eq 2 -and $n[0].type -eq 'missed' -and $n[0].studentId -eq '25300011' -and $n[1].type -eq 'hold_granted' -and $n[1].studentId -eq '25300012')
    Check 'missed.hour = holdUntil cu (M15)' ($n[0].hour -eq $startHour + 24)
    $r = Api GET '/reservations/TST01'
    $q = $r.body.queue
    Check 'Thu tu hang: 012 (giu), 013, 011 (lo 1 lan)' ($q.Count -eq 3 -and $q[0].studentId -eq '25300012' -and $q[0].holding -and $q[1].studentId -eq '25300013' -and $q[2].studentId -eq '25300011' -and $q[2].missCount -eq 1)

    Write-Host '[6] Nhan thiet bi, huy dang ky'
    $r = Api POST '/reservations/TST01/claim' @{ studentId = '25300012'; days = 3 }
    Check 'POST claim -> phieu 1 thiet bi, han 3 ngay' ($r.ok -and $r.body.record.devices.Count -eq 1 -and $r.body.record.dueHour -eq $r.body.record.borrowHour + 72 -and $r.body.queue.Count -eq 2)
    $rec2 = $r.body.record.recordId
    $r = Api DELETE '/reservations/TST01/25300013'
    Check 'DELETE huy dang ky' ($r.ok -and $r.body.queue.Count -eq 1 -and $r.body.queue[0].studentId -eq '25300011')
    $r = Api DELETE '/reservations/TST01/25300013'
    Check 'Huy lan 2 -> 404 NOT_IN_QUEUE' ($r.code -eq 'NOT_IN_QUEUE')

    Write-Host '[7] Goi y muon kem'
    $r = Api GET '/suggestions/VR01?k=3'
    Check 'GET /suggestions/VR01: <= 3, dau la TC01' ($r.ok -and $r.body.suggestions.Count -le 3 -and $r.body.suggestions[0].id -eq 'TC01')
    $w = @($r.body.suggestions.weight)
    Check 'Trong so giam dan' (($w.Count -lt 2) -or ($w[0] -ge $w[1]))
    $r = Api GET '/suggestions?ids=VR01,%20TC01&k=3'
    Check 'GET /suggestions?ids=VR01,TC01 khong chua mon trong gio' ($r.ok -and (@($r.body.ids) -join ',') -eq 'VR01,TC01' -and -not (@($r.body.suggestions.id) -contains 'VR01') -and -not (@($r.body.suggestions.id) -contains 'TC01'))
    $r = Api GET '/suggestions?ids='
    Check 'Gio rong -> danh sach rong' ($r.ok -and $r.body.suggestions.Count -eq 0)
    $r = Api GET '/devices/VR01/companions'
    Check 'GET /devices/VR01/companions' ($r.ok -and $r.body.companions.Count -ge 3)
    $r = Api GET '/suggestions/XYZ'
    Check 'Goi y ma la -> 404 DEVICE_NOT_FOUND' ($r.code -eq 'DEVICE_NOT_FOUND')

    Write-Host '[8] Bao tri, xoa thiet bi'
    $r = Api POST '/devices/ARD01/maintenance' @{ qty = 1 }
    $m = $r.body.device.maintenance
    Check 'POST maintenance ARD01 qty 1' ($r.ok -and $m -ge 1)
    $r = Api POST '/devices/ARD01/maintenance/finish' @{ qty = 1 }
    Check 'POST maintenance/finish' ($r.ok -and $r.body.device.maintenance -eq $m - 1)
    $r = Api POST '/devices/TST01/maintenance' @{ qty = 1 }
    Check 'Bao tri khi khong con don vi san sang -> 409 OUT_OF_STOCK' ($r.code -eq 'OUT_OF_STOCK')
    $r = Api DELETE '/devices/TST01'
    Check 'Xoa thiet bi dang muon/co hang doi -> 409 DEVICE_IN_USE' ($r.code -eq 'DEVICE_IN_USE')
    Api POST '/devices' @{ id = 'TST02'; name = 'Xoa thu'; total = 2 } | Out-Null
    $r = Api DELETE '/devices/TST02'
    Check 'DELETE /devices/TST02' ($r.ok -and $r.body.deleted -eq 'TST02')
    $r = Api GET '/devices/TST02'
    Check 'Da xoa -> 404 DEVICE_NOT_FOUND' ($r.status -eq 404 -and $r.code -eq 'DEVICE_NOT_FOUND')

    Write-Host '[9] Tua vai ngay -> qua han, tien phat'
    $r = Api POST '/clock/advance' @{ hours = 96 }
    Check 'Tua +96 gio' $r.ok
    $r = Api GET '/records?status=overdue&pageSize=100'
    $ov = @($r.body.records)
    $mine = $ov | Where-Object { $_.recordId -eq $rec2 }
    Check 'Phieu claim tre 1 ngay, phat 36.000' ($null -ne $mine -and $mine.overdue -and $mine.lateDays -eq 1 -and $mine.fine -eq 36000 -and -not $mine.fineFinal)
    $badFine = @($ov | Where-Object { $_.fine -ne $_.lateDays * $_.devices.Count * 36000 -or -not $_.overdue })
    Check 'Moi phieu qua han: fine = ngay x so TB x 36.000' ($ov.Count -ge 3 -and $badFine.Count -eq 0)
    $days = @($ov.lateDays)
    $sorted = @($days | Sort-Object -Descending)
    Check 'Danh sach qua han sap theo so ngay giam dan' (($days -join ',') -eq ($sorted -join ','))
    $r = Api GET '/stats'
    Check 'stats.overdueRecords khop danh sach' ($r.body.overdueRecords -eq $ov.Count -and $r.body.pendingFines -gt 0)
    $r = Api POST '/return' @{ recordId = $rec2 }
    Check 'Tra phieu tre -> chot phat' ($r.ok -and $r.body.record.fineFinal -and $r.body.record.lateDays -eq 1 -and $r.body.record.fine -eq 36000 -and -not $r.body.record.overdue)

    Write-Host '[10] Lich su, phan trang'
    $r = Api GET '/records?page=1&pageSize=5'
    Check 'GET /records phan trang' ($r.ok -and $r.body.records.Count -eq 5 -and $r.body.totalPages -eq [math]::Ceiling($r.body.total / 5))
    Check 'Phieu moi nhat dung dau' ($r.body.records[0].recordId -eq $rec2)
    $r = Api GET '/records?status=open&query=25300'
    Check 'Loc open + query' ($r.ok -and $r.body.total -eq 0)
    $r = Api GET '/records?status=returned&query=25300'
    Check 'Loc returned + query MSSV' ($r.ok -and $r.body.total -eq 2)

    Write-Host '[11] Loi chung'
    $r = Api POST '/borrow' $null '{oops'
    Check 'JSON hong -> 400 BAD_JSON' ($r.status -eq 400 -and $r.code -eq 'BAD_JSON')
    $r = Api POST '/borrow' $null '[1,2]'
    Check 'JSON khong phai object -> 400 BAD_JSON' ($r.code -eq 'BAD_JSON')
    $r = Api GET '/khongco'
    Check 'Endpoint la -> 404 NOT_FOUND' ($r.status -eq 404 -and $r.code -eq 'NOT_FOUND')
    $r = Api GET '/records/PM9999'
    Check 'Phieu la -> 404 RECORD_NOT_FOUND' ($r.code -eq 'RECORD_NOT_FOUND')
    $r = Api POST '/clock/advance' @{ hours = 0 }
    Check 'Tua 0 gio -> 400 INVALID_INPUT' ($r.code -eq 'INVALID_INPUT')
    $r = Api GET '/records?status=foo'
    Check 'status la -> 400 INVALID_INPUT' ($r.code -eq 'INVALID_INPUT')
    $r = Api GET '/suggestions/VR01?k=abc'
    Check 'k khong phai so -> 400 INVALID_INPUT' ($r.code -eq 'INVALID_INPUT')

    Write-Host '[12] File tinh, luu CSV, cong ban'
    $page = Invoke-WebRequest -Uri "$script:base/" -UseBasicParsing
    Check 'GET / tra web/index.html (UTF-8)' ($page.StatusCode -eq 200 -and $page.Headers['Content-Type'] -match 'charset=utf-8')
    $csv = [System.IO.File]::ReadAllText((Join-Path $data1 'devices.csv'), [System.Text.Encoding]::UTF8)
    Check 'Tu luu CSV sau thao tac (TST01 trong devices.csv)' ($csv -match 'TST01')
    $busyPort = [int]($script:base -replace '.*:', '')
    $srv2 = StartServer $data2 $busyPort (Join-Path $tmp 'server2.log')
    Check "Cong $busyPort ban -> server 2 chuyen sang cong khac" ($null -ne $srv2.url -and $srv2.url -ne $script:base)
} finally {
    foreach ($s in @($srv, $srv2)) {
        if ($s -and $s.proc -and -not $s.proc.HasExited) { Stop-Process -Id $s.proc.Id -Force }
    }
    Start-Sleep -Milliseconds 300
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}

Write-Host ''
$total = $script:pass + $script:fail
if ($script:fail -eq 0) { Write-Host "$script:pass/$total PASS - TAT CA DAT" -ForegroundColor Green; exit 0 }
Write-Host "$script:pass/$total PASS - $script:fail FAIL" -ForegroundColor Red
exit 1
