param(
    [Parameter(Mandatory=$true)][string]$Candidate,
    [Parameter(Mandatory=$true)][string]$InstallDirectory,
    [Parameter(Mandatory=$true)][string]$ProgramsDirectory,
    [string]$StartupDirectory
)
$ErrorActionPreference = 'Stop'
$Principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Windows administrator approval is required for the host firewall rule.' }
$Candidate = [System.IO.Path]::GetFullPath($Candidate).TrimEnd('\')
$InstallDirectory = [System.IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\')
$ManifestPath = Join-Path $Candidate 'manifest.json'
$Manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
if ($Manifest.component -ne 'ProjLib Host candidate' -or -not $Manifest.hashes) { throw 'Candidate manifest is missing or invalid.' }
$RuleName = 'ProjLib-Home-Proxy-8443'
if (Test-Path -LiteralPath (Join-Path $InstallDirectory 'installation.json')) { throw 'An installation already exists. Review its running state before updating.' }
if (Get-NetFirewallRule -Name $RuleName -ErrorAction SilentlyContinue) { throw 'A firewall rule with this name already exists.' }
if (-not $Manifest.hashes.'ProjLibHost.exe') { throw 'The dedicated host executable is missing from the candidate.' }
foreach ($Property in $Manifest.hashes.PSObject.Properties) {
    $Source = [System.IO.Path]::GetFullPath((Join-Path $Candidate $Property.Name))
    if (-not $Source.StartsWith($Candidate + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Candidate path escapes its directory.' }
    if ((Get-FileHash -LiteralPath $Source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Property.Value) { throw ('Candidate hash mismatch: ' + $Property.Name) }
}
$Version = (Get-FileHash -LiteralPath $ManifestPath -Algorithm SHA256).Hash.Substring(0,12).ToLowerInvariant()
$Application = Join-Path $InstallDirectory ('app-' + $Version)
if (Test-Path -LiteralPath $Application) { throw 'The candidate application directory already exists.' }
New-Item -ItemType Directory -Path $Application -Force | Out-Null
foreach ($Property in $Manifest.hashes.PSObject.Properties) {
    $Destination = [System.IO.Path]::GetFullPath((Join-Path $Application $Property.Name))
    if (-not $Destination.StartsWith($Application + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Install path escapes the application directory.' }
    New-Item -ItemType Directory -Path (Split-Path -Parent $Destination) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $Candidate $Property.Name) -Destination $Destination
    if ((Get-FileHash -LiteralPath $Destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Property.Value) { throw 'Installed file verification failed.' }
}
Copy-Item -LiteralPath $ManifestPath -Destination (Join-Path $Application 'manifest.json')
$Data = Join-Path $InstallDirectory 'data'
New-Item -ItemType Directory -Path $Data -Force | Out-Null
$Launcher = Join-Path $Application 'scripts/start-home-host.ps1'
$NodePath = Join-Path $Application 'ProjLibHost.exe'
$Shell = New-Object -ComObject WScript.Shell
New-Item -ItemType Directory -Path $ProgramsDirectory -Force | Out-Null
$MenuPath = Join-Path $ProgramsDirectory 'ProjLib Host.lnk'
if (Test-Path -LiteralPath $MenuPath) { throw 'A Start menu entry already exists.' }
$CreatedRule = $false
$CreatedMenu = $false
$CreatedStartup = $false
try {
    New-NetFirewallRule -Name $RuleName -DisplayName 'ProjLib Host HTTPS TCP 8443' -Group 'ProjLib Host' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8443 -Program $NodePath -Profile Any -EdgeTraversalPolicy Block | Out-Null
    $CreatedRule = $true
    $Link = $Shell.CreateShortcut($MenuPath)
    $Link.TargetPath = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $Link.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $Launcher + '" -DataDirectory "' + $Data + '"'
    $Link.WorkingDirectory = $Application
    $CreatedMenu = $true
    $Link.Save()
    $StartupPath = $null
    if ($StartupDirectory) {
        New-Item -ItemType Directory -Path $StartupDirectory -Force | Out-Null
        $StartupPath = Join-Path $StartupDirectory 'ProjLib Host.lnk'
        if (Test-Path -LiteralPath $StartupPath) { throw 'A startup entry already exists.' }
        $Startup = $Shell.CreateShortcut($StartupPath)
        $Startup.TargetPath = $Link.TargetPath
        $Startup.Arguments = $Link.Arguments + ' -Background'
        $Startup.WorkingDirectory = $Application
        $CreatedStartup = $true
        $Startup.Save()
    }
    $Record = @{ application = $Application; data = $Data; firewallRule = $RuleName; menu = $MenuPath; startup = $StartupPath; version = $Version }
    [System.IO.File]::WriteAllText((Join-Path $InstallDirectory 'installation.json'), ($Record | ConvertTo-Json), [System.Text.UTF8Encoding]::new($false))
} catch {
    if ($CreatedRule) { Remove-NetFirewallRule -Name $RuleName }
    if ($CreatedMenu -and (Test-Path -LiteralPath $MenuPath)) { Remove-Item -LiteralPath $MenuPath }
    if ($CreatedStartup -and (Test-Path -LiteralPath $StartupPath)) { Remove-Item -LiteralPath $StartupPath }
    throw
}
