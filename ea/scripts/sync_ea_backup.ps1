# ==============================================================================
# Skynet OS - MT5 EA & Preset Auto-Backup Script
# Backs up forward-tested EAs and optimized .set parameter files to GitHub
# ==============================================================================

$repoPath = "C:\Users\Win10\Desktop\UHNWI"
$presetsDir = Join-Path $repoPath "ea\presets"
$forwardDir = Join-Path $repoPath "ea\forward_test"
$terminalsDir = "C:\Users\Win10\AppData\Roaming\MetaQuotes\Terminal"

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "   ⚡ Skynet OS - MT5 EA & Presets Backup Sync" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

$copiedFiles = 0

# 1. Scan MT5 terminals for custom .set files (Presets & Tester profiles)
if (Test-Path $terminalsDir) {
    Get-ChildItem -Path $terminalsDir -Directory | ForEach-Object {
        $termDir = $_.FullName
        $termName = $_.Name

        # Check Profiles\Tester (Contains last used optimization / backtest parameters)
        $testerSets = Get-ChildItem -Path (Join-Path $termDir "MQL5\Profiles\Tester\*.set") -ErrorAction SilentlyContinue
        foreach ($setFile in $testerSets) {
            # Skip built-in example sets if needed, or back up all non-default
            $dest = Join-Path $presetsDir $setFile.Name
            Copy-Item -Path $setFile.FullName -Destination $dest -Force
            Write-Host " [+] Found Tester Preset: $($setFile.Name)" -ForegroundColor Green
            $copiedFiles++
        }

        # Check Presets folder
        $userPresets = Get-ChildItem -Path (Join-Path $termDir "MQL5\Presets\*.set") -Recurse -ErrorAction SilentlyContinue
        foreach ($setFile in $userPresets) {
            $dest = Join-Path $presetsDir $setFile.Name
            Copy-Item -Path $setFile.FullName -Destination $dest -Force
            Write-Host " [+] Found User Preset: $($setFile.Name)" -ForegroundColor Green
            $copiedFiles++
        }

        # Check Experts folder for custom EAs
        $customExperts = Get-ChildItem -Path (Join-Path $termDir "MQL5\Experts") -Recurse -Include *.mq5,*.ex5 -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match "Snowball|DavidDruz" }
        foreach ($eaFile in $customExperts) {
            $dest = Join-Path $forwardDir $eaFile.Name
            Copy-Item -Path $eaFile.FullName -Destination $dest -Force
            Write-Host " [+] Found Forward-Test EA: $($eaFile.Name)" -ForegroundColor Green
            $copiedFiles++
        }
    }
}

# 2. Also ensure current repo MQL5 code is mirrored to forward_test as snapshot
$allEAs = @("DCASnowballEA", "BTCSnowballEA", "DavidDruzTrendEA", "DavidDruzGridEA")
foreach ($ea in $allEAs) {
    $eaMQ5 = Join-Path $repoPath "ea\mql5\$ea.mq5"
    if (Test-Path $eaMQ5) {
        Copy-Item -Path $eaMQ5 -Destination (Join-Path $forwardDir "$ea.mq5") -Force
    }
    $eaEX5 = Join-Path $repoPath "ea\mql5\$ea.ex5"
    if (Test-Path $eaEX5) {
        Copy-Item -Path $eaEX5 -Destination (Join-Path $forwardDir "$ea.ex5") -Force
    }
}

Write-Host "---------------------------------------------------"
Write-Host "Total files synchronized to repo: $copiedFiles" -ForegroundColor Yellow

# 3. Git commit & push to GitHub
Set-Location -Path $repoPath
$status = git status --porcelain ea/

if ($status) {
    Write-Host "Changes detected in EA/Presets. Committing and pushing to GitHub..." -ForegroundColor Cyan
    git add ea/
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    git commit -m "backup(ea): update forward-test EA and optimization presets [$timestamp]"
    git push origin main
    Write-Host "===================================================" -ForegroundColor Green
    Write-Host " [SUCCESS] All EA codes and .set presets pushed to GitHub!" -ForegroundColor Green
    Write-Host "===================================================" -ForegroundColor Green
} else {
    Write-Host "===================================================" -ForegroundColor Green
    Write-Host " [OK] Everything is already up-to-date on GitHub." -ForegroundColor Green
    Write-Host "===================================================" -ForegroundColor Green
}
