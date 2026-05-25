Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

backendDir = fso.GetParentFolderName(WScript.ScriptFullName)
backendScript = fso.BuildPath(backendDir, "server.js")
backendOut = fso.BuildPath(backendDir, "backend-launch.out.log")
backendErr = fso.BuildPath(backendDir, "backend-launch.err.log")

If Not fso.FileExists(backendScript) Then
    MsgBox "Could not find the backend server at:" & vbCrLf & backendScript, vbCritical, "Fashion Shaa POS"
    WScript.Quit 1
End If

shell.CurrentDirectory = backendDir
shell.Run "powershell -NoProfile -ExecutionPolicy Bypass -Command ""$backendRunning = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue; if (-not $backendRunning) { Start-Process -FilePath 'node' -ArgumentList 'server.js' -WorkingDirectory '" & Replace(backendDir, "'", "''") & "' -WindowStyle Hidden -RedirectStandardOutput '" & Replace(backendOut, "'", "''") & "' -RedirectStandardError '" & Replace(backendErr, "'", "''") & "' }""", 0, False
