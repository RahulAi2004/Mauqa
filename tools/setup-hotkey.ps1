# Mauqa quick-access hotkey for Windows.
# Creates a Start Menu shortcut with a global hotkey (Ctrl+Alt+M) that opens
# Mauqa's quick-add bar instantly - the closest thing to a system-wide capture
# button a web app can have. Run once:  powershell -ExecutionPolicy Bypass -File tools\setup-hotkey.ps1

$url = "http://localhost:5183/?quick=1"

$ws = New-Object -ComObject WScript.Shell
$programs = $ws.SpecialFolders.Item("Programs")
$lnkPath = Join-Path $programs "Mauqa Quick Add.lnk"

$lnk = $ws.CreateShortcut($lnkPath)
$lnk.TargetPath = "cmd.exe"
$lnk.Arguments = "/c start `"`" `"$url`""
$lnk.WindowStyle = 7  # minimized - the cmd window flashes away
$lnk.Hotkey = "Ctrl+Alt+M"
$lnk.Description = "Open Mauqa quick add"
$lnk.Save()

Write-Host "Done! Press Ctrl+Alt+M anywhere in Windows to open Mauqa quick add." -ForegroundColor Green
Write-Host "(Shortcut: $lnkPath - hotkey activates after first use or next sign-in.)"
