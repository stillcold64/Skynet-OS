Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class WinUtil {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", SetLastError=true)]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    public static string GetActiveProcessName() {
        IntPtr hwnd = GetForegroundWindow();
        uint pid;
        GetWindowThreadProcessId(hwnd, out pid);
        try {
            return System.Diagnostics.Process.GetProcessById((int)pid).ProcessName;
        } catch {
            return "";
        }
    }
}
'@
[WinUtil]::GetActiveProcessName()
