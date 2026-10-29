Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public struct LASTINPUTINFO {
    public uint cbSize;
    public uint dwTime;
}
public class Win32Idle {
    [DllImport("User32.dll")]
    public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
    [DllImport("kernel32.dll")]
    public static extern uint GetTickCount();
    public static uint GetIdleMs() {
        LASTINPUTINFO lii = new LASTINPUTINFO();
        lii.cbSize = (uint)Marshal.SizeOf(lii);
        GetLastInputInfo(ref lii);
        return (GetTickCount() - lii.dwTime);
    }
}
'@
[Win32Idle]::GetIdleMs()
