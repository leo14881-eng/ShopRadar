# Local secret files for shopradar-server (gitignored). Run: npm run setup-secrets
$ErrorActionPreference = 'Stop'
$serverDir = Split-Path -Parent $PSScriptRoot
Set-Location $serverDir

function Read-FirstContentLine {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return '' }
    foreach ($line in Get-Content -Path $Path -Encoding UTF8) {
        $t = $line.Trim()
        if ($t -and -not $t.StartsWith('#')) { return $t }
    }
    return ''
}

function New-RandomSecret {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $b64 = [Convert]::ToBase64String($bytes).Replace('+', '').Replace('/', '')
    return $b64.Substring(0, [Math]::Min(43, $b64.Length))
}

$tokenFile = Join-Path $serverDir '.token-secret'
if (-not (Test-Path $tokenFile)) {
    $secret = New-RandomSecret
    Set-Content -Path $tokenFile -Value $secret -Encoding UTF8 -NoNewline
    Write-Host '[OK] created .token-secret' -ForegroundColor Green
} else {
    Write-Host '[--] .token-secret exists, skip' -ForegroundColor DarkGray
}

$lemonSecretFile = Join-Path $serverDir '.lemon-webhook-secret'
if (-not (Test-Path $lemonSecretFile)) {
    node (Join-Path $serverDir 'scripts\rotate-lemon-webhook-secret.js') | Out-Host
} else {
    $v = Read-FirstContentLine $lemonSecretFile
    if ($v -match 'REPLACE_WITH') {
        Write-Host '[!!] .lemon-webhook-secret is still placeholder' -ForegroundColor Yellow
    } else {
        Write-Host '[OK] .lemon-webhook-secret exists' -ForegroundColor Green
    }
}

$verifyFile = Join-Path $serverDir '.lemon-webhook-verify'
if (-not (Test-Path $verifyFile)) {
    Set-Content -Path $verifyFile -Value '1' -Encoding UTF8 -NoNewline
    Write-Host '[OK] created .lemon-webhook-verify = 1 (verify ON)' -ForegroundColor Green
} else {
    Write-Host '[--] .lemon-webhook-verify exists, skip' -ForegroundColor DarkGray
}

Write-Host ''
Write-Host "Dir: $serverDir"
Write-Host 'Start: cd shopradar-server; npm start'
Write-Host 'Enable Lemon verify: set .lemon-webhook-verify to 1 and fill .lemon-webhook-secret'
