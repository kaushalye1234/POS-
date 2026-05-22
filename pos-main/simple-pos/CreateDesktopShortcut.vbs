Set WshShell = WScript.CreateObject("WScript.Shell")
strDesktop = WshShell.SpecialFolders("Desktop")

Set oShortcut = WshShell.CreateShortcut(strDesktop & "\Fashion Shaa POS.lnk")
oShortcut.TargetPath = WScript.ScriptFullName
oShortcut.TargetPath = Replace(WScript.ScriptFullName, "CreateDesktopShortcut.vbs", "FashionShaa-POS.bat")
oShortcut.WorkingDirectory = Replace(WScript.ScriptFullName, "CreateDesktopShortcut.vbs", "")
oShortcut.Description = "Fashion Shaa Point of Sale System"
oShortcut.IconLocation = "shell32.dll,21"
oShortcut.Save

MsgBox "Desktop shortcut 'Fashion Shaa POS' created successfully!", vbInformation, "Shortcut Created"

/* placeholder aria-label */
