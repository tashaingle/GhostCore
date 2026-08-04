# Validates core Ghost Core env + remote Supabase schema without printing secrets.
# Usage: powershell -File scripts/check-prod-ready.ps1

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env.local"
if (-not (Test-Path $envFile)) {
  Write-Error ".env.local not found at $envFile"
  exit 1
}

$raw = Get-Content $envFile -Raw
function Get-EnvVal([string]$name) {
  if ($raw -match "(?m)^$([regex]::Escape($name))=(.*)$") {
    return $Matches[1].Trim().Trim('"').Trim("'")
  }
  return $null
}

function Pass([string]$msg) { Write-Host "  PASS  $msg" -ForegroundColor Green }
function Fail([string]$msg) { Write-Host "  FAIL  $msg" -ForegroundColor Red }
function Info([string]$msg) { Write-Host "  INFO  $msg" -ForegroundColor Cyan }

Write-Host ""
Write-Host "== Core environment ==" -ForegroundColor White
$failures = 0

$url = Get-EnvVal "NEXT_PUBLIC_SUPABASE_URL"
$anon = Get-EnvVal "NEXT_PUBLIC_SUPABASE_ANON_KEY"
$service = Get-EnvVal "SUPABASE_SERVICE_ROLE_KEY"
$site = Get-EnvVal "NEXT_PUBLIC_SITE_URL"
$enc = Get-EnvVal "GITHUB_TOKEN_ENCRYPTION_KEY"
$job = Get-EnvVal "BACKGROUND_JOB_SECRET"
$cron = Get-EnvVal "CRON_SECRET"

if ($url -and $url -match "supabase\.co") {
  Pass "NEXT_PUBLIC_SUPABASE_URL set ($(([uri]$url).Host))"
} else {
  Fail "NEXT_PUBLIC_SUPABASE_URL missing or invalid"
  $failures++
}

if ($anon -and $anon.StartsWith("eyJ") -and $anon.Length -gt 100) {
  Pass "NEXT_PUBLIC_SUPABASE_ANON_KEY looks like a JWT (len=$($anon.Length))"
} else {
  Fail "NEXT_PUBLIC_SUPABASE_ANON_KEY missing or not a JWT"
  $failures++
}

if ($service -and $service.StartsWith("eyJ") -and $service.Length -gt 100) {
  Pass "SUPABASE_SERVICE_ROLE_KEY looks like a JWT (len=$($service.Length))"
} else {
  Fail "SUPABASE_SERVICE_ROLE_KEY must be the service_role JWT from Project Settings -> API (current len=$($service.Length))"
  $failures++
}

if ($site -and $site -match "^https://") {
  Pass "NEXT_PUBLIC_SITE_URL is HTTPS production-style ($site)"
} elseif ($site -and $site -match "localhost") {
  Info "NEXT_PUBLIC_SITE_URL is localhost ($site) - fine for local; set HTTPS for prod/Vercel"
} else {
  Fail "NEXT_PUBLIC_SITE_URL missing or not a URL"
  $failures++
}

if ($enc) {
  try {
    $bytes = [Convert]::FromBase64String($enc)
    if ($bytes.Length -eq 32) {
      Pass "GITHUB_TOKEN_ENCRYPTION_KEY is 32-byte base64"
    } else {
      Fail "GITHUB_TOKEN_ENCRYPTION_KEY decodes to $($bytes.Length) bytes (need 32)"
      $failures++
    }
  } catch {
    Fail "GITHUB_TOKEN_ENCRYPTION_KEY is not valid base64"
    $failures++
  }
} else {
  Fail "GITHUB_TOKEN_ENCRYPTION_KEY missing"
  $failures++
}

if ($job -and $job.Length -ge 32) {
  Pass "BACKGROUND_JOB_SECRET set (len=$($job.Length))"
} else {
  Fail "BACKGROUND_JOB_SECRET missing or shorter than 32 chars"
  $failures++
}

if ($cron -and $cron.Length -ge 16) {
  Pass "CRON_SECRET set (Vercel Cron Authorization bearer)"
  if ($job -and $cron -eq $job) {
    Pass "CRON_SECRET matches BACKGROUND_JOB_SECRET"
  } elseif ($job) {
    Info "CRON_SECRET differs from BACKGROUND_JOB_SECRET (both are accepted by dispatch)"
  }
} else {
  Fail "CRON_SECRET not set - set it equal to BACKGROUND_JOB_SECRET on Vercel so daily cron is authorized"
  $failures++
}

Write-Host ""
Write-Host "== Remote schema probe ==" -ForegroundColor White
if (-not $url -or -not $anon) {
  Fail "Cannot probe schema without URL + anon key"
  $failures++
} else {
  $headers = @{ apikey = $anon; Authorization = "Bearer $anon" }
  $tables = @(
    "organisations", "organisation_members", "profiles", "integrations", "events",
    "integration_logs", "insights", "organisation_invitations", "stripe_event_receipts",
    "manual_records", "event_correlations", "command_centre_views",
    "background_jobs", "notifications", "workflow_definitions",
    "work_tasks", "work_cases", "work_templates", "work_runs"
  )
  $missing = @()
  foreach ($t in $tables) {
    try {
      $null = Invoke-WebRequest -Uri "$url/rest/v1/${t}?select=*&limit=0" -Headers $headers -Method GET -UseBasicParsing -TimeoutSec 20
      Pass "table $t"
    } catch {
      $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "?" }
      Fail "table $t (HTTP $code)"
      $missing += $t
      $failures++
    }
  }
  if ($missing.Count -gt 0) {
    Info "Missing tables: apply supabase/migrations/202607290013_tasks_cases_work_management.sql"
  }

  try {
    $health = Invoke-WebRequest -Uri "$url/auth/v1/health" -Headers @{ apikey = $anon } -Method GET -UseBasicParsing -TimeoutSec 15
    Pass "Auth health $($health.StatusCode)"
  } catch {
    Fail "Auth health check failed"
    $failures++
  }

  if ($service -and $service.StartsWith("eyJ") -and $service.Length -gt 100) {
    $svcHeaders = @{ apikey = $service; Authorization = "Bearer $service" }
    try {
      $r = Invoke-WebRequest -Uri "$url/rest/v1/organisations?select=id&limit=1" -Headers $svcHeaders -Method GET -UseBasicParsing -TimeoutSec 15
      Pass "service_role can query organisations (HTTP $($r.StatusCode))"
    } catch {
      $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { "?" }
      Fail "service_role query failed (HTTP $code) - key may be wrong project or truncated"
      $failures++
    }
  }
}

Write-Host ""
Write-Host "== Auth redirect checklist (manual) ==" -ForegroundColor White
Info "Site URL / redirect allow list should include:"
if ($site) {
  Info "  $site"
  Info "  $site/auth/callback"
  Info "  $site/auth/github/callback"
}
Info "Local dev still needs http://localhost:3000/auth/callback (and github callback)"

Write-Host ""
Write-Host "== Result ==" -ForegroundColor White
if ($failures -eq 0) {
  Write-Host "All automated checks passed." -ForegroundColor Green
  exit 0
}

Write-Host "$failures check(s) failed. Fix the FAIL lines above." -ForegroundColor Yellow
exit 1
