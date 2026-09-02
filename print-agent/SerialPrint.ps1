# Writes raw ESC/POS bytes directly to a Windows COM port — the path for a
# Bluetooth Classic/SPP thermal printer that's paired (Windows created a
# "Standard Serial over Bluetooth link (COMn)" port for it) but has no
# Windows *printer queue* configured, so winspool.drv/RawPrint.ps1 has
# nothing to open. A Bluetooth SPP virtual port's framing is handled by the
# radio link, not these settings, so they rarely matter in practice — but
# they're parameterized (not hard-coded) per print-agent's own config.mjs,
# since some SPP stacks/firmwares are pickier than others.
param(
    [Parameter(Mandatory = $true)][string]$ComPort,
    [string]$FilePath,
    [int]$BaudRate = 9600,
    [int]$DataBits = 8,
    [string]$Parity = "None",
    [string]$StopBits = "One",
    # Diagnostics-only: open+close without writing anything, to check
    # whether the Bluetooth link is actually live right now without
    # risking sending garbage to an unknown device.
    [switch]$TestOnly
)

$ErrorActionPreference = "Stop"

if (-not $TestOnly -and -not $FilePath) {
    Write-Output "ERROR: -FilePath is required unless -TestOnly is set"
    exit 1
}
if (-not $TestOnly -and -not (Test-Path -LiteralPath $FilePath)) {
    Write-Output "ERROR: File not found: $FilePath"
    exit 1
}

try {
    $parityValue = [System.IO.Ports.Parity]::$Parity
    $stopBitsValue = [System.IO.Ports.StopBits]::$StopBits
    $port = New-Object System.IO.Ports.SerialPort($ComPort, $BaudRate, $parityValue, $DataBits, $stopBitsValue)
    $port.WriteTimeout = 5000
    $port.Open()
    try {
        if (-not $TestOnly) {
            $bytes = [System.IO.File]::ReadAllBytes($FilePath)
            $port.Write($bytes, 0, $bytes.Length)
            # Let the RFCOMM link flush before we close it — closing
            # immediately after Write() can truncate the tail of the
            # buffer on some stacks.
            Start-Sleep -Milliseconds 400
        }
    } finally {
        $port.Close()
    }
    Write-Output "OK"
} catch {
    Write-Output "ERROR: $($_.Exception.Message)"
    exit 1
}
