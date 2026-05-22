Set WshShell = WScript.CreateObject("WScript.Shell")
Set FSO = WScript.CreateObject("Scripting.FileSystemObject")
strDesktop = WshShell.SpecialFolders("Desktop")
scriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
launcherPath = FSO.BuildPath(scriptDir, "FashionShaa_POS.vbs")
rootDir = FSO.GetParentFolderName(scriptDir)
targetPath = WshShell.ExpandEnvironmentStrings("%SystemRoot%\System32\wscript.exe")

Set oShortcut = WshShell.CreateShortcut(strDesktop & "\Fashion Shaa POS.lnk")
oShortcut.TargetPath = targetPath
oShortcut.Arguments = Chr(34) & launcherPath & Chr(34)
oShortcut.WorkingDirectory = rootDir
oShortcut.Description = "Fashion Shaa Point of Sale System"
oShortcut.IconLocation = "shell32.dll,21"
oShortcut.Save

MsgBox "Desktop shortcut 'Fashion Shaa POS' created successfully!", vbInformation, "Shortcut Created"

/* placeholder aria-label */
