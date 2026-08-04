# Manually invoke background job dispatch (local or production).
# Usage:
#   powershell -File scripts/dispatch-jobs.ps1
#   powershell -File scripts/dispatch-jobs.ps1 -BaseUrl https://ghost-core-two.vercel.app
# Reads BACKGROUND_JOB_SECRET (or CRON_SECRET) from .env.local. Never prints the secret.

param(
  [string]$BaseUrl = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env.local"
if (-not (Test-Path $envFile)) { throw ".env.local not found" }

$raw = Get-Content $envFile -Raw
function Get-EnvVal([string]$name) {
  if ($raw -match "(?m)^$([regex]::Escape($name))=(.*)$") {
    return $Matches[1].Trim().Trim('"').Trim("'")
  }
  return $null
}

$secret = Get-EnvVal "BACKGROUND_JOB_SECRET"
if (-not $secret) { $secret = Get-EnvVal "CRON_SECRET" }
if (-not $secret) { throw "Set BACKGROUND_JOB_SECRET or CRON_SECRET in .env.local" }

if (-not $BaseUrl) { $BaseUrl = Get-EnvVal "NEXT_PUBLIC_SITE_URL" }
if (-not $BaseUrl) { $BaseUrl = "http://localhost:3000" }
$BaseUrl = $BaseUrl.TrimEnd("/")
$uri = "$BaseUrl/api/jobs/dispatch"

Write-Host "POST $uri" -ForegroundColor Cyan
$sw = [System.Diagnostics.Stopwatch]::StartNew()
try {
  $r = Invoke-WebRequest -Uri $uri -Method POST -Headers @{
    Authorization = "Bearer $secret"
    Accept = "application/json"
  } -UseBasicParsing -TimeoutSec 300
  $sw.Stop()
  Write-Host "HTTP $($r.StatusCode) in $([int]$sw.Elapsed.TotalSeconds)s" -ForegroundColor Green
  Write-Host $r.Content
  exit 0
} catch {
  $sw.Stop()
  if ($_.Exception.Response) {
    $code = [int]$_.Exception.Response.StatusCode
    $stream = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $body = $reader.ReadToEnd()
    Write-Host "HTTP $code in $([int]$sw.Elapsed.TotalSeconds)s" -ForegroundColor Red
    Write-Host $body
    exit 1
  }
  throw
}
