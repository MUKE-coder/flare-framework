# Install the Flare CLI (@flaredev/cli), which provides the `flare` command.
#
#   irm https://flare-docs.codetotech.com/install.ps1 | iex
#
# Options (environment variables):
#   $env:FLARE_VERSION = "0.1.0"   install a specific version (default: latest)
#   $env:FLARE_PM = "pnpm"         install with pnpm instead of npm
$ErrorActionPreference = "Stop"

$Package = "@flaredev/cli"
$Version = if ($env:FLARE_VERSION) { $env:FLARE_VERSION } else { "latest" }
$MinNode = 22

function Fail($message) {
  Write-Host "error: $message" -ForegroundColor Red
  # `exit` would close the window when run through `irm | iex`; throw stops the script instead.
  throw "Flare install failed."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Fail "Node.js $MinNode or later is required and wasn't found. Install it from https://nodejs.org (or: winget install OpenJS.NodeJS.LTS), then run this again."
}
$NodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($NodeMajor -lt $MinNode) {
  Fail "Node.js $MinNode or later is required; you have $(node -v). Upgrade it, then run this again."
}

$Pm = if ($env:FLARE_PM) { $env:FLARE_PM } else { "npm" }
if ($Pm -ne "npm" -and $Pm -ne "pnpm") { Fail "FLARE_PM must be npm or pnpm (got `"$Pm`")." }
if (-not (Get-Command $Pm -ErrorAction SilentlyContinue)) { Fail "$Pm wasn't found on your PATH." }

Write-Host "Installing $Package@$Version with $Pm..." -ForegroundColor Cyan
if ($Pm -eq "npm") { npm install -g "$Package@$Version" } else { pnpm add -g "$Package@$Version" }
if ($LASTEXITCODE -ne 0) { Fail "The install failed (see the output above)." }

if (Get-Command flare -ErrorAction SilentlyContinue) {
  $Installed = ((flare --version | Select-Object -First 1) -split " ")[0]
  Write-Host "Installed $Installed." -ForegroundColor Green
  Write-Host "Create an app:  flare create my-app"
} else {
  Write-Host "Installed, but 'flare' isn't on your PATH yet. Open a new terminal, or add your global bin directory to PATH:"
  if ($Pm -eq "npm") { Write-Host "  $(npm prefix -g)" } else { Write-Host "  run: pnpm setup" }
}
