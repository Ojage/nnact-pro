# One-command OpenFieldPro deploy (Windows). Mirrors deploy.sh.
#   .\deploy.ps1            # build + up
#   .\deploy.ps1 down       # tear down
param([string]$Action = "up")
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$compose = if (Get-Command podman -ErrorAction SilentlyContinue) { "podman" } else { "docker" }

if ($Action -eq "down") {
  & $compose compose -f infra/compose.prod.yml down
  return
}

if (-not (Test-Path .env)) {
  Write-Host "-> creating .env from .env.example (edit secrets before a real deploy!)"
  Copy-Item .env.example .env
}

Write-Host "-> building + starting stack with: $compose compose"
& $compose compose -f infra/compose.prod.yml up -d --build

Write-Host ""
Write-Host "OpenFieldPro is starting."
Write-Host "  App:      http://localhost:8080"
Write-Host "  Landing:  http://localhost:8080/welcome"
Write-Host "  API:      http://localhost:8080/api/health"
Write-Host "  Login:    owner@demo.test / demo12345"
