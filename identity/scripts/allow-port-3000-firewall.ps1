# Allow Windows Firewall inbound connections on port 3000 for NexaPay backend
# Run this script as Administrator if you get "Connection failed: No route to host" from the mobile app.
#
# Usage: Run PowerShell as Administrator, then:
#   cd "d:\Programming\Nexa\backend\scripts"
#   .\allow-port-3000-firewall.ps1

$ruleName = "NexaPay Backend (Port 3000)"
$port = 3000

# Check if running as Administrator (required to modify firewall)
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "This script modifies Windows Firewall and must run as Administrator." -ForegroundColor Yellow
    Write-Host "Right-click PowerShell -> Run as administrator, then run this script again." -ForegroundColor Yellow
    exit 1
}

# Remove existing rule if present (so we can re-run safely)
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
    Remove-NetFirewallRule -DisplayName $ruleName
    Write-Host "Removed existing rule '$ruleName'." -ForegroundColor Gray
}

# Add inbound rule for TCP port 3000
New-NetFirewallRule -DisplayName $ruleName `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort $port `
    -Action Allow `
    -Profile Any `
    -Description "Allow NexaPay backend API for mobile app testing"

Write-Host "Firewall rule added: inbound TCP port $port is now allowed." -ForegroundColor Green
Write-Host ""

# Show current IPv4 address so user can verify app config
Write-Host "Your PC's IPv4 addresses (use one of these in the app if connection still fails):" -ForegroundColor Cyan
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback' -and $_.IPAddress -notmatch '^169\.' } | ForEach-Object {
    Write-Host "  $($_.IPAddress)  ($($_.InterfaceAlias))"
}
Write-Host ""
Write-Host "In the app, set _localNetworkIp in api_client.dart to the IP above (e.g. 192.168.1.113)." -ForegroundColor Gray
Write-Host "Then hot restart the Flutter app and try again." -ForegroundColor Gray
