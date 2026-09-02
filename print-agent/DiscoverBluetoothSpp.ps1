# Finds Bluetooth Classic/SPP virtual COM ports that Windows has created for
# a *paired* device but that have no Windows printer queue bound to them yet
# — exactly the state a Bluetooth Classic/SPP thermal printer is in right
# after pairing, before anyone runs Windows' "Add a printer" wizard against
# that COM port. Reported back as a printable candidate (systemPrinterName
# = the COM port itself, e.g. "COM5") so the agent can write ESC/POS bytes
# straight to the port (see SerialPrint.ps1 / print.mjs) instead of
# requiring the owner to manually configure a Windows printer object first.
$ErrorActionPreference = "SilentlyContinue"

$usedPorts = @(Get-Printer | ForEach-Object { ($_.PortName -replace ':$', '').ToUpper() })
$btPorts = Get-PnpDevice -Class Ports | Where-Object { $_.FriendlyName -match "Bluetooth" }
$btDevices = Get-PnpDevice -Class Bluetooth

# Build deviceAddress -> friendlyName lookup once, from each Bluetooth
# device's own InstanceId (format ...\DEV_<12-hex-MAC>\...), then check
# whether a port's InstanceId contains that same MAC anywhere — more
# robust than assuming a fixed separator character around it, which
# differs between the two observed formats (...&0&<MAC>_... vs ...&<MAC>\...).
$deviceByMac = @{}
foreach ($device in $btDevices) {
    if ($device.InstanceId -match "([0-9A-Fa-f]{12})") {
        $mac = $Matches[1].ToUpper()
        if ($mac -ne "000000000000" -and -not $deviceByMac.ContainsKey($mac)) {
            $lastConnected = Get-PnpDeviceProperty -InstanceId $device.InstanceId -KeyName 'DEVPKEY_Bluetooth_LastConnectedTime' -ErrorAction SilentlyContinue
            $deviceByMac[$mac] = [PSCustomObject]@{
                name              = $device.FriendlyName
                lastConnectedTime = if ($lastConnected.Data) { $lastConnected.Data.ToString("o") } else { $null }
            }
        }
    }
}

$results = @()
foreach ($port in $btPorts) {
    if ($port.FriendlyName -notmatch "\(COM(\d+)\)") { continue }
    $comName = "COM$($Matches[1])"
    if ($usedPorts -contains $comName.ToUpper()) { continue }

    # Only report ports we can tie to an actual paired device — an
    # unresolved port is almost always the radio's own local SPP service
    # record, not a remote accessory, and printing to it would just
    # confuse the owner with a dead entry in the picker.
    $portIdUpper = $port.InstanceId.ToUpper()
    $match = $null
    $matchedMac = $null
    foreach ($mac in $deviceByMac.Keys) {
        if ($portIdUpper.Contains($mac)) {
            $match = $deviceByMac[$mac]
            $matchedMac = $mac
            break
        }
    }
    if (-not $match) { continue }

    $results += [PSCustomObject]@{
        comPort           = $comName
        label             = "$($match.name) (Bluetooth SPP)"
        deviceName        = $match.name
        address           = $matchedMac
        lastConnectedTime = $match.lastConnectedTime
    }
}

$results | ConvertTo-Json -Compress
