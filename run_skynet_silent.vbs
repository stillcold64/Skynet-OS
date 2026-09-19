Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\Win10\Desktop\UHNWI\apps\webapp"
WshShell.Run """C:\Program Files\nodejs\node.exe"" scripts/launcher.js", 0, False
