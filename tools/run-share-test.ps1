# Runs the 3-process sharing test (owner / editor / viewer) on a private local peer network.
# usage: powershell -File tools\run-share-test.ps1 [-Exe path\to\Blockpad.exe]
param([string]$Exe = '', [string[]]$Scripts = @('smoke20','smoke21','smoke22'))
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$work = Join-Path $env:TEMP ('bp-share-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $work | Out-Null
$boot = Join-Path $work 'boot.json'
$tn = Start-Process node -ArgumentList "`"$root\tools\testnet.js`"", "`"$boot`"" -PassThru -WindowStyle Hidden
for ($i = 0; $i -lt 60 -and -not (Test-Path $boot); $i++) { Start-Sleep -Milliseconds 500 }
if (-not (Test-Path $boot)) { throw 'test network did not start' }
$env:BP_DHT_BOOTSTRAP = ((Get-Content $boot -Raw | ConvertFrom-Json).bootstrap -join ',')
$env:BP_SYNC_DIR = Join-Path $work 'sync'
$env:BP_LLM_DIR = "$env:APPDATA\blockpad\ai\models"
$procs = @()
$names = @('A','B','C','D')
for ($si = 0; $si -lt $Scripts.Count; $si++) {
  $n = @($names[$si], $Scripts[$si])
  $env:BP_SMOKE_DIR = Join-Path $work ('data-' + $n[0])
  $env:BP_SMOKE_OUT = Join-Path $work ('out-' + $n[0])
  $log = Join-Path $work ($n[0] + '.log')
  $smoke = '"--smoke=' + $root + '\tools\' + $n[1] + '.js"'
  if ($Exe) { $p = Start-Process $Exe -ArgumentList $smoke -PassThru -RedirectStandardOutput $log -RedirectStandardError "$log.err" -WindowStyle Hidden }
  else { $p = Start-Process "$root\node_modules\electron\dist\electron.exe" -ArgumentList "`"$root`"", $smoke -PassThru -RedirectStandardOutput $log -RedirectStandardError "$log.err" -WindowStyle Hidden }
  $procs += ,@($n[0], $p, $log)
}
$deadline = (Get-Date).AddSeconds(170)
foreach ($x in $procs) { $left = [int](($deadline - (Get-Date)).TotalMilliseconds); if ($left -gt 0) { [void]$x[1].WaitForExit($left) } }
$bad = 0
foreach ($x in $procs) {
  Write-Output ("===== process " + $x[0] + (& { if ($x[1].HasExited) { ' (exit ' + $x[1].ExitCode + ')' } else { ' (TIMED OUT, killed)' } }) + ' =====')
  if (-not $x[1].HasExited) { Stop-Process -Id $x[1].Id -Force; $bad++ }
  $text = Get-Content $x[2] -Raw
  if ($text -notmatch 'ALL CHECKS PASSED' -or $text -match 'FAIL ') { $bad++ }
  Get-Content $x[2] | Where-Object { $_ -notmatch 'deprecated' } | ForEach-Object { Write-Output $_ }
}
Stop-Process -Id $tn.Id -Force -ErrorAction SilentlyContinue
Get-Process llama-server -ErrorAction SilentlyContinue | Stop-Process -Force
if ($bad) { Write-Output "`nSHARE TEST: $bad process(es) failed"; exit 1 } else { Write-Output "`nSHARE TEST: ALL PROCESSES PASSED" }
