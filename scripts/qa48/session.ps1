param(
  [ValidateSet('provision', 'start', 'verify', 'regression', 'password')]
  [string]$Action = 'start',
  [switch]$ApproveQaCredentialRotation
)
$ErrorActionPreference = 'Stop'
$qaRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$qaVault = Join-Path $qaRoot 'output/qa48/credentials.clixml'
if ($env:OS -ne 'Windows_NT') { throw 'This QA vault requires Windows DPAPI.' }

if ($Action -eq 'provision') {
  if (-not $ApproveQaCredentialRotation) { throw 'Provision requires explicit QA-only credential rotation approval.' }
  if (Test-Path -LiteralPath $qaVault) { throw 'QA vault exists; refusing overwrite. Use start, not provision.' }
  if (Get-NetTCPConnection -State Listen -LocalPort 3001,5174 -ErrorAction SilentlyContinue) {
    throw 'Stop the verified QA48 processes before credential provisioning; no process is killed automatically.'
  }
  $qaSecrets = @{}
  foreach ($key in @('DB_PASSWORD', 'JWT_SECRET', 'QA48_PASSWORD')) {
    $qaSecrets[$key] = & node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
    if ($LASTEXITCODE -ne 0) { throw 'Could not generate QA secret.' }
  }
  New-Item -ItemType Directory -Force -Path (Split-Path $qaVault) | Out-Null
  # Persist recoverable encrypted material before changing the approved QA accounts.
  $qaSecure = @{}
  foreach ($key in $qaSecrets.Keys) { $qaSecure[$key] = ConvertTo-SecureString $qaSecrets[$key] -AsPlainText -Force }
  $qaSecure | Export-Clixml -LiteralPath $qaVault
} else {
  if (-not (Test-Path -LiteralPath $qaVault)) { throw 'QA vault missing. Provisioning requires separate approval.' }
  $qaSecure = Import-Clixml -LiteralPath $qaVault
  $qaSecrets = @{}
  foreach ($key in @('DB_PASSWORD', 'JWT_SECRET', 'QA48_PASSWORD')) {
    if ($qaSecure[$key] -isnot [Security.SecureString]) { throw 'Invalid QA vault.' }
    $qaSecrets[$key] = [Net.NetworkCredential]::new('', $qaSecure[$key]).Password
  }
}

if ($Action -eq 'password') {
  # Explicit, local interactive operation only. Never run from agent logs.
  Set-Clipboard -Value $qaSecrets['QA48_PASSWORD']
  Write-Host 'QA48 account password copied to clipboard. Paste in an isolated browser profile, then clear clipboard.'
  return
}

$qaPrevious = @{}
try {
  foreach ($key in $qaSecrets.Keys) {
    $qaPrevious[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    [Environment]::SetEnvironmentVariable($key, $qaSecrets[$key], 'Process')
  }
  Push-Location $qaRoot
  try {
    & node scripts/qa48/session.cjs $Action
    if ($LASTEXITCODE -ne 0) { throw "QA48 $Action failed; inspect its separate output. Do not rerun provision blindly." }
  } finally { Pop-Location }
} finally {
  foreach ($key in $qaPrevious.Keys) { [Environment]::SetEnvironmentVariable($key, $qaPrevious[$key], 'Process') }
  $qaSecrets.Clear()
}
