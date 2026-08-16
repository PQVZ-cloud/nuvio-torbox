# Push nuvio-torbox to GitHub via REST API (no git needed)
# Usage:
#   $env:GITHUB_TOKEN = "github_pat_xxx"   (fine-grained PAT)
#   .\push.ps1 -Owner "yourname" -Repo "nuvio-torbox"
#
# Safety: token is read from the environment ONLY, never written to disk.
# Revoke the token right after the push.

param(
  [Parameter(Mandatory = $true)][string]$Owner,
  [Parameter(Mandatory = $true)][string]$Repo
)

$ErrorActionPreference = "Stop"

$token = $env:GITHUB_TOKEN
if (-not $token) { $token = $env:GH_TOKEN }
if (-not $token) {
  Write-Host "ERROR: set GITHUB_TOKEN first" -ForegroundColor Red
  exit 1
}

$headers = @{
  Authorization = "Bearer $token"
  Accept        = "application/vnd.github+json"
  "User-Agent"  = "nuvio-torbox-push"
}

# ---------- 1. Secret sanity check ----------
Write-Host "== Secret scan ==" -ForegroundColor Cyan
$secretHashes = @(
  "626abec5627228a4cec43d744bc3e655460f8e99b973463d60e8a0f57d8b28a4",
  "8fe556d5603151dd46d3900e749c2a67c4c0c403c0f808c196bab97e7daf5f76"
)
function Get-Sha256([string]$text) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
  return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLower()
}
$secretFound = $false
Get-ChildItem -Recurse -File | Where-Object { $_.FullName -notmatch "node_modules|\.git" } | ForEach-Object {
  $content = Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue
  if ($content) {
    foreach ($h in $secretHashes) {
      if ((Get-Sha256 $content) -eq $h) {
        Write-Host "SECRET FOUND in $($_.FullName) - aborting!" -ForegroundColor Red
        $script:secretFound = $true
      }
    }
  }
}
if ($secretFound) { exit 1 }
Write-Host "No secrets found in any project file." -ForegroundColor Green

# ---------- 2. Build file list ----------
$files = @(
  "manifest.json",
  "README.md",
  "LICENSE",
  ".gitignore",
  "package.json",
  "package-lock.json",
  "build.js",
  "server.js",
  "index.html",
  "push.ps1",
  "providers/torbox.js",
  "src/torbox/config.js",
  "src/torbox/config.example.js",
  "src/torbox/index.js",
  "src/torbox/mapping.js",
  "src/torbox/sources.js",
  "src/torbox/torbox.js",
  "src/torbox/utils.js",
  "test/test.js"
)

# ---------- 3. Verify the repo exists ----------
$repoCheck = Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/$Owner/$Repo" -Headers $headers -TimeoutSec 30
Write-Host "Repo found: $($repoCheck.full_name) (default branch: $($repoCheck.default_branch))" -ForegroundColor Green

# ---------- 4. Upload files (create or update) ----------
Write-Host "`n== Uploading ==" -ForegroundColor Cyan
$branch = $repoCheck.default_branch
foreach ($f in $files) {
  if (-not (Test-Path $f)) {
    Write-Host "SKIP (missing): $f" -ForegroundColor Yellow
    continue
  }
  $bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $f))
  $b64 = [System.Convert]::ToBase64String($bytes)
  $apiPath = $f -replace '\\', '/'
  $payload = @{
    message = "Update $f"
    content = $b64
    branch  = $branch
  }
  try {
    $existing = Invoke-RestMethod -Method Get -Uri "https://api.github.com/repos/$Owner/$Repo/contents/$apiPath" -Headers $headers -TimeoutSec 30
    $payload.sha = $existing.sha
    $payload.message = "Update $f"
  } catch {
    $payload.message = "Add $f"
  }
  $body = $payload | ConvertTo-Json -Compress
  try {
    Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$Owner/$Repo/contents/$apiPath" -Headers $headers -Body $body -ContentType "application/json" -TimeoutSec 60 | Out-Null
    Write-Host "OK: $f" -ForegroundColor Green
  } catch {
    Write-Host "FAIL: $f - $($_.Exception.Message)" -ForegroundColor Red
  }
}

Write-Host "`nDone! https://github.com/$Owner/$Repo" -ForegroundColor Green
Write-Host "REVOKE the token now (GitHub -> Settings -> Developer settings -> Personal access tokens)." -ForegroundColor Yellow