# EmojiRL — Release AAB Build Script
# Prerequisites:
#   1. Android Studio installed (includes bundled JDK 17+)
#   2. Android SDK installed (via Android Studio's SDK Manager)
#   3. emojirl-upload.jks present at repo root (already generated)
#
# Usage:
#   Set-ExecutionPolicy -Scope Process Bypass
#   .\scripts\build-release.ps1

param(
    [string]$KeystorePath = "$PSScriptRoot\..\emojirl-upload.jks",
    [string]$KeystorePassword = $(Read-Host -AsSecureString "Keystore password" | ConvertFrom-SecureString -AsPlainText),
    [string]$KeyAlias = "emojirl",
    [string]$KeyPassword = $(Read-Host -AsSecureString "Key password" | ConvertFrom-SecureString -AsPlainText)
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

# 1. Locate Android Studio's bundled JDK (Java 17+)
$StudioPaths = @(
    "C:\Program Files\Android\Android Studio\jbr",
    "C:\Program Files\Android\Android Studio\jre",
    "$env:LOCALAPPDATA\Programs\Android Studio\jbr",
    "$env:LOCALAPPDATA\Programs\Android Studio\jre"
)
$JavaHome = $null
foreach ($p in $StudioPaths) {
    if (Test-Path "$p\bin\java.exe") {
        $JavaHome = $p
        break
    }
}
if (-not $JavaHome) {
    # Try JAVA_HOME if set by user
    if ($env:JAVA_HOME -and (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
        $JavaHome = $env:JAVA_HOME
    } else {
        Write-Error "Java 11+ not found. Install Android Studio or set JAVA_HOME to a JDK 11+ installation."
    }
}
Write-Host "Using Java from: $JavaHome"
$env:JAVA_HOME = $JavaHome

# 2. Build web app
Write-Host "`nBuilding web app..."
Set-Location $ProjectRoot
pnpm build

# 3. Sync Capacitor
Write-Host "`nSyncing Capacitor..."
npx cap sync android

# 4. Build signed AAB
Write-Host "`nBuilding release AAB..."
$env:KEYSTORE_PATH = (Resolve-Path $KeystorePath).Path
$env:KEYSTORE_PASSWORD = $KeystorePassword
$env:KEY_ALIAS = $KeyAlias
$env:KEY_PASSWORD = $KeyPassword

Set-Location "$ProjectRoot\android"
.\gradlew bundleRelease

$AabPath = "$ProjectRoot\android\app\build\outputs\bundle\release\app-release.aab"
if (Test-Path $AabPath) {
    Write-Host "`nSUCCESS: AAB built at:"
    Write-Host "  $AabPath"
    Write-Host "`nNext steps:"
    Write-Host "  1. Upload $AabPath to Play Console"
    Write-Host "  2. Enroll in Play App Signing if not already done"
} else {
    Write-Error "AAB not found at expected path: $AabPath"
}
