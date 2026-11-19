param([string]$DataDirectory = (Join-Path $PSScriptRoot '..\data'), [switch]$Background)
$ErrorActionPreference = 'Stop'
$AppDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$DataDirectory = [System.IO.Path]::GetFullPath($DataDirectory)
New-Item -ItemType Directory -Path $DataDirectory -Force | Out-Null
$RuntimePath = Join-Path $DataDirectory 'runtime.json'
function Get-RunningHost {
    if (-not (Test-Path -LiteralPath $RuntimePath)) { return $null }
    try {
        $Runtime = Get-Content -LiteralPath $RuntimePath -Raw | ConvertFrom-Json
        $Uri = [Uri]$Runtime.url
        if ($Uri.Scheme -ne 'http' -or $Uri.Host -ne '127.0.0.1') { return $null }
        $Status = Invoke-RestMethod -Uri ($Runtime.url + 'status') -TimeoutSec 2
        if ($Status.service -eq 'ProjLib Host' -and $Status.instance -eq $Runtime.instance) { return $Runtime }
    } catch { return $null }
    return $null
}
$Running = Get-RunningHost
if (-not $Running) {
    $Node = Join-Path $AppDirectory 'ProjLibHost.exe'
    if (-not (Test-Path -LiteralPath $Node)) { $Node = (Get-Command node -ErrorAction Stop).Source }
    $env:PROJLIB_HOME_DIR = $DataDirectory
    Start-Process -FilePath $Node -ArgumentList @(('"' + (Join-Path $AppDirectory 'server/home-host.mjs') + '"'), '--auto-start') -WorkingDirectory $AppDirectory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $DataDirectory 'host.log') -RedirectStandardError (Join-Path $DataDirectory 'error.log') | Out-Null
    $Limit = [DateTimeOffset]::UtcNow.AddSeconds(30)
    do {
        Start-Sleep -Milliseconds 300
        $Running = Get-RunningHost
    } while (-not $Running -and [DateTimeOffset]::UtcNow -lt $Limit)
    if (-not $Running) { throw ('Host startup failed. See ' + (Join-Path $DataDirectory 'error.log')) }
}
if (-not $Background) { Start-Process $Running.url }
