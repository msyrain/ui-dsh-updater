# DSH auto-upgrade script (package edition). Shipped inside the dsh-updater
# plugin package and executed by the plugin's node half.
#
# Unlike the original repo-integration flow, this version does NOT register the
# plugin inside the DSH repository: the plugin is installed as a profile bundle
# (`dsh plugin add`), so a DSH upgrade cannot drop it. The script only has to
# pull, install, build, and restart.
#
# The restart phase stops ONLY the process listening on the port (no
# taskkill /T), so this script survives even when spawned as a child of the old
# server. Keep this file ASCII-only: the plugin runs it with Windows PowerShell
# 5.1, which mis-decodes BOM-less UTF-8 as GBK and would turn Chinese comments
# into phantom quotes / broken syntax.
param(
  [string]$Repo = 'D:\deepseek-harness',
  [int]$Port = 3080
)

$ErrorActionPreference = 'Continue'
$env:GIT_TERMINAL_PROMPT = '0'
$log = Join-Path $Repo 'dsh-updater-last-run.log'
Start-Transcript -Path $log -Force | Out-Null
function Log($m) { Write-Host ('[upgrade] ' + $m) }
Write-Host '== DSH auto-upgrade start ==' -ForegroundColor Cyan

# 1) enter the repo
if (-not (Test-Path (Join-Path $Repo '.git'))) {
  Log ('aborting: ' + $Repo + ' is not a git checkout')
  Stop-Transcript | Out-Null
  exit 1
}
Log ('repo: ' + $Repo)
Set-Location $Repo

# 2) fetch: origin direct first, then gh-proxy.com mirror; both with low-speed
#    timeouts so a blocked connection fails fast instead of hanging forever.
Log 'fetching upstream (origin direct, mirror fallback)'
$fetched = $false
foreach ($src in @('origin', 'https://gh-proxy.com/https://github.com/deepseek-ai/deepseek-harness.git')) {
  Log ('fetch source: ' + $src)
  & git -c http.lowSpeedLimit=1 -c http.lowSpeedTime=20 fetch $src master --tags --force
  if ($LASTEXITCODE -eq 0) { $fetched = $true; break }
  Log 'fetch failed on this source, trying next'
}
if (-not $fetched) {
  Log 'all fetch sources failed; aborting upgrade (current service untouched)'
  Stop-Transcript | Out-Null
  exit 1
}

# 3) merge (ff-only). The three files below are restored only to clear leftovers
#    from the OLD manual integration (which edited tracked files in place); the
#    package install never touches them, so this is a no-op on a clean checkout.
$head = (git rev-parse --short=7 HEAD).Trim()
$ffh  = (git rev-parse --short=7 FETCH_HEAD).Trim()
if ($head -eq $ffh) {
  Log ('repo already up to date at ' + $head + ', skipping merge')
} else {
  Log ('merging ' + $head + ' -> ' + $ffh)
  git checkout -- packages/bundle/web-app/cordis.patch.yml packages/bundle/web-app/package.json tsconfig.client.json
  $others = @(git status --porcelain | Where-Object { $_ -notmatch '^\?\?' -and $_.Trim() -ne '' })
  $stashed = $false
  if ($others.Count -gt 0) {
    Log ('stashing other local changes (' + $others.Count + ' entries)')
    git stash push -m 'dsh-upgrade-autostash' | Out-Null
    $stashed = ($LASTEXITCODE -eq 0)
  }
  git merge --ff-only FETCH_HEAD
  if ($LASTEXITCODE -ne 0) {
    Log 'ff merge failed; aborting (current service untouched)'
    if ($stashed) { git stash pop | Out-Null }
    Stop-Transcript | Out-Null
    exit 1
  }
  if ($stashed) {
    git stash pop | Out-Null
    if ($LASTEXITCODE -ne 0) { Log 'stash pop had conflicts; changes kept in stash (see git stash list)' }
  }
}
$short = (git rev-parse --short=7 HEAD).Trim()
Log ('current commit: ' + $short)

# 4) dependencies
Log 'pnpm install'
& pnpm install --fetch-timeout 600000 --fetch-retries 8 --fetch-retry-mintimeout 20000
if ($LASTEXITCODE -ne 0) { Log 'pnpm install failed; aborting (no restart)'; Stop-Transcript | Out-Null; exit 1 }

# 5) full build (stamps the new commit hash into the client badge)
Log 'pnpm run build (this can take several minutes)'
& pnpm run build
if ($LASTEXITCODE -ne 0) { Log 'build failed; aborting (no restart, current service stays up)'; Stop-Transcript | Out-Null; exit 1 }

# 6) safe restart: stop only the process listening on the port
Log 'restarting DSH service'
$conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($conn) {
  $svc = $conn.OwningProcess
  Log ('stopping old service process (PID ' + $svc + ')')
  Stop-Process -Id $svc -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3
} else {
  Log ('port ' + $Port + ' is free; nothing to stop')
}

# 7) start the new service (child of this script; it outlives this script)
Log 'starting new service (pnpm dsh web)'
$cmdArgs = '/c cd /d ' + $Repo + ' && pnpm dsh web'
Start-Process -FilePath 'cmd.exe' -ArgumentList $cmdArgs -WindowStyle Hidden
Start-Sleep -Seconds 12

Log ('== upgrade done. Press Ctrl+F5 in the browser; expected commit ' + $short + ' ==')
Log ('log file: ' + $log)
Stop-Transcript | Out-Null
