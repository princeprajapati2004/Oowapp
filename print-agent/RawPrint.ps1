# Sends raw bytes straight to a Windows-installed printer's spooler queue
# (RAW datatype — no GDI rendering, no re-interpretation), the standard
# technique for ESC/POS thermal printers: P/Invoke into winspool.drv
# (OpenPrinter/StartDocPrinter/WritePrinter), the same approach as
# Microsoft's classic "RawPrinterHelper" sample. Invoked by print.js via
# `powershell -File RawPrint.ps1 -PrinterName ... -FilePath ...` so Node
# never has to embed a native addon just to reach the OS print spooler.
param(
    [Parameter(Mandatory = $true)][string]$PrinterName,
    [Parameter(Mandatory = $true)][string]$FilePath
)

$ErrorActionPreference = "Stop"

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class OowappRawPrinter
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public struct DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] ref DOCINFOA di);

    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static string SendBytesToPrinter(string printerName, byte[] bytes)
    {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
        {
            return "ERROR: OpenPrinter failed (" + Marshal.GetLastWin32Error() + ")";
        }

        try
        {
            DOCINFOA di = new DOCINFOA();
            di.pDocName = "OOWAPP Receipt";
            di.pOutputFile = null;
            di.pDataType = "RAW";

            if (!StartDocPrinter(hPrinter, 1, ref di))
            {
                return "ERROR: StartDocPrinter failed (" + Marshal.GetLastWin32Error() + ")";
            }

            try
            {
                if (!StartPagePrinter(hPrinter))
                {
                    return "ERROR: StartPagePrinter failed (" + Marshal.GetLastWin32Error() + ")";
                }

                IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                try
                {
                    Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
                    int written;
                    if (!WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out written))
                    {
                        return "ERROR: WritePrinter failed (" + Marshal.GetLastWin32Error() + ")";
                    }
                    if (written != bytes.Length)
                    {
                        return "ERROR: Only wrote " + written + " of " + bytes.Length + " bytes";
                    }
                }
                finally
                {
                    Marshal.FreeCoTaskMem(pUnmanagedBytes);
                }

                EndPagePrinter(hPrinter);
            }
            finally
            {
                EndDocPrinter(hPrinter);
            }
        }
        finally
        {
            ClosePrinter(hPrinter);
        }

        return "OK";
    }
}
"@

if (-not (Test-Path -LiteralPath $FilePath)) {
    Write-Output "ERROR: File not found: $FilePath"
    exit 1
}

$bytes = [System.IO.File]::ReadAllBytes($FilePath)
$result = [OowappRawPrinter]::SendBytesToPrinter($PrinterName, $bytes)
Write-Output $result
if ($result -ne "OK") { exit 1 }
