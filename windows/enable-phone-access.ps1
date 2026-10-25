# Lets phones on your Wi-Fi reach the app for TV mode. Run ONCE, as Administrator:
#   powershell -ExecutionPolicy Bypass -File enable-phone-access.ps1
#
# Out of the box WSL2 sits behind its own private network, so the app is only
# reachable from this PC. This switches WSL to "mirrored" networking (WSL
# shares Windows' network adapters, so the app is on your LAN address) and
# opens its ports in both firewalls — Private networks only, never Public:
# 8010 for the Windows launcher, 5173 + 8000 for `npm run dev` / start.sh.

$ErrorActionPreference = "Stop"
$ports = @(8010, 5173, 8000)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host "Please run this from an Administrator PowerShell." -ForegroundColor Red
  exit 1
}

# 1. Mirrored networking in %USERPROFILE%\.wslconfig (affects every WSL distro).
$wslconfig = Join-Path $env:USERPROFILE ".wslconfig"
$content = if (Test-Path $wslconfig) { Get-Content $wslconfig -Raw } else { "" }
if ($content -match "(?m)^\s*networkingMode\s*=\s*mirrored") {
  Write-Host "WSL already uses mirrored networking."
} else {
  if (Test-Path $wslconfig) { Copy-Item $wslconfig "$wslconfig.bak" -Force }
  if ($content -match "(?m)^\s*networkingMode\s*=") {
    $content = $content -replace "(?m)^\s*networkingMode\s*=.*$", "networkingMode=mirrored"
  } elseif ($content -match "(?m)^\[wsl2\]") {
    $content = $content -replace "(?m)^\[wsl2\]\s*$", "[wsl2]`r`nnetworkingMode=mirrored"
  } else {
    $content = $content.TrimEnd() + "`r`n[wsl2]`r`nnetworkingMode=mirrored`r`n"
  }
  Set-Content -Path $wslconfig -Value $content -Encoding ASCII
  Write-Host "Set networkingMode=mirrored in $wslconfig (backup: .wslconfig.bak)."
}

# 2. Hyper-V firewall: lets inbound LAN traffic into the WSL VM on these ports.
$wslVmCreator = "{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}"
if (Get-Command New-NetFirewallHyperVRule -ErrorAction SilentlyContinue) {
  Remove-NetFirewallHyperVRule -Name "GuitarPentatonicsTV" -ErrorAction SilentlyContinue
  New-NetFirewallHyperVRule -Name "GuitarPentatonicsTV" -DisplayName "Guitar Pentatonics TV mode (WSL)" `
    -Direction Inbound -VMCreatorId $wslVmCreator -Protocol TCP -LocalPorts $ports | Out-Null
  Write-Host "Opened ports $($ports -join ', ') in the Hyper-V (WSL) firewall."
}

# 3. Windows Defender firewall, Private profile only.
Remove-NetFirewallRule -Name "GuitarPentatonicsTV" -ErrorAction SilentlyContinue
New-NetFirewallRule -Name "GuitarPentatonicsTV" -DisplayName "Guitar Pentatonics TV mode" `
  -Direction Inbound -Protocol TCP -LocalPort $ports -Action Allow -Profile Private | Out-Null
Write-Host "Opened ports $($ports -join ', ') in Windows Firewall (Private networks)."

Write-Host ""
Write-Host "Done. Now restart WSL so the networking change applies:" -ForegroundColor Green
Write-Host "  wsl --shutdown"
Write-Host "then start Guitar Pentatonics again. Make sure your Wi-Fi is set to a Private network."
