# Building EmojiRL for Android

## Prerequisites

1. **Node.js / pnpm** — already set up if you can run the dev server
2. **Java 17+** — install [Android Studio](https://developer.android.com/studio) (includes a bundled JDK) or [Amazon Corretto 21](https://aws.amazon.com/corretto/)
3. **Android SDK** — install via Android Studio → SDK Manager

## Development loop

```powershell
pnpm build           # build web app to dist/
npx cap sync android # sync assets + plugins into android/
npx cap open android # open Android Studio for device/emulator testing
```

## Building a signed release AAB (Play Store)

### One-time keystore setup

The upload keystore has already been generated at `emojirl-upload.jks` (repo root).
**Never commit this file** — it is listed in `.gitignore`.

Store it securely (password manager, CI secret, etc.). If you lose it you cannot update the app on Play Store.

Keystore details:
- File: `emojirl-upload.jks`
- Alias: `emojirl`
- Algorithm: RSA 2048
- Validity: 10,000 days

### Build the AAB

```powershell
# Set JAVA_HOME to Java 17+ (Android Studio's bundled JDK works)
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"  # adjust path

# Set signing environment variables
$env:KEYSTORE_PATH     = "D:\TSD\emojirl\emojirl-upload.jks"
$env:KEYSTORE_PASSWORD = "your-keystore-password"
$env:KEY_ALIAS         = "emojirl"
$env:KEY_PASSWORD      = "your-key-password"

# Build
pnpm build
npx cap sync android
cd android
.\gradlew bundleRelease
```

Or use the helper script:
```powershell
.\scripts\build-release.ps1
```

The signed AAB will be at:
`android\app\build\outputs\bundle\release\app-release.aab`

### Play Store upload

1. Go to [play.google.com/console](https://play.google.com/console)
2. Create app → choose "App" → Android → Free
3. Upload the AAB under **Production → Create new release**
4. Enroll in **Play App Signing** (Google holds the distribution key; you upload with your upload key)
5. Increment `versionCode` in `android/app/build.gradle` for every subsequent upload

## Building a debug APK (for local testing)

```powershell
cd android
.\gradlew assembleDebug
# Output: android\app\build\outputs\apk\debug\app-debug.apk
```

Install directly to a connected device:
```powershell
adb install app\build\outputs\apk\debug\app-debug.apk
```

## F-Droid submission

F-Droid builds from source. Requirements:
- MIT `LICENSE` file — present at repo root
- No proprietary network calls — fonts are now self-hosted
- Fastlane metadata — present at `fastlane/metadata/android/`
- Source builds cleanly: `pnpm install && pnpm build && npx cap sync android`

Submit a build recipe to [gitlab.com/fdroid/fdroiddata](https://gitlab.com/fdroid/fdroiddata).

## Version bumping

Before each release, increment in `android/app/build.gradle`:
```gradle
versionCode 2          // must always increase (integer)
versionName "0.2.0"    // human-readable semver
```
