# Creates "Guitar Pentatonics" and "Stop Guitar Pentatonics" shortcuts on the Desktop.
# Run once from Windows PowerShell:
#   powershell -ExecutionPolicy Bypass -File install-shortcuts.ps1

$distro = "Ubuntu-26.04"
$projectPath = "/home/ron/guitar-pentatonics"
$desktop = [Environment]::GetFolderPath('Desktop')
$wsl = "$env:WINDIR\System32\wsl.exe"
$shell = New-Object -ComObject WScript.Shell

$start = $shell.CreateShortcut("$desktop\Guitar Pentatonics.lnk")
$start.TargetPath = $wsl
$start.Arguments = "-d $distro -- bash -lc `"$projectPath/windows/start.sh`""
$start.WorkingDirectory = "$env:USERPROFILE"
$start.IconLocation = "shell32.dll,220"
$start.Description = "Start the Guitar Pentatonics app"
$start.Save()

$stop = $shell.CreateShortcut("$desktop\Stop Guitar Pentatonics.lnk")
$stop.TargetPath = $wsl
$stop.Arguments = "-d $distro -- bash -lc `"$projectPath/windows/stop.sh`""
$stop.WorkingDirectory = "$env:USERPROFILE"
$stop.IconLocation = "shell32.dll,131"
$stop.Description = "Stop the Guitar Pentatonics app"
$stop.Save()

Write-Host "Created shortcuts on the Desktop:"
Write-Host "  - Guitar Pentatonics.lnk"
Write-Host "  - Stop Guitar Pentatonics.lnk"
