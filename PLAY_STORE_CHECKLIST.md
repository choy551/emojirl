# Play Store Submission Checklist

## Account setup
- [ ] Create Google Play developer account at https://play.google.com/console
- [ ] Pay one-time $25 registration fee

## App creation
- [ ] New app → Android → Free → "EmojiRL"
- [ ] Default language: English (United States)

## Store listing
- [ ] **App name:** EmojiRL
- [ ] **Short description** (80 chars max):
      A turn-based emoji roguelike. Collect soul emojis, equip gear, descend deep.
- [ ] **Full description** — copy from `fastlane/metadata/android/en-US/full_description.txt`
- [ ] **App icon:** 512x512 PNG — export from `assets/icon.png`
- [ ] **Feature graphic:** 1024x500 PNG — create (game screenshot with logo overlay)
- [ ] **Phone screenshots:** minimum 2, recommended 4-8
      Capture from Android emulator or device via Android Studio
- [ ] **Category:** Games → Role Playing

## Content rating
- [ ] Complete IARC questionnaire at Play Console → Content rating
- [ ] Typical answers for EmojiRL: no violence, no adult content, no location, no user comms
- [ ] Expected rating: Everyone (E) or E10+

## Data safety
- [ ] Data collected: None
- [ ] Data shared: None
- [ ] Security practices: Data is encrypted in transit (N/A — fully offline)
- [ ] Committed to Play Families Policy: No

## Privacy policy
- [ ] Host a privacy policy page (required even for apps with no data collection)
- [ ] Suggested text: "EmojiRL does not collect, transmit, or share any personal data.
      All game progress is stored locally on your device and never leaves it."
- [ ] Options: GitHub Pages, Notion public page, or any free hosting

## Release
- [ ] Upload signed AAB from `android/app/build/outputs/bundle/release/app-release.aab`
- [ ] Enroll in Play App Signing (recommended — Google holds distribution key)
- [ ] Set rollout: start with 20% production rollout or use Internal Testing first
- [ ] Minimum Android version: check `android/variables.gradle` for `minSdkVersion`

## Post-submission
- [ ] Monitor Play Console → Android Vitals for crashes
- [ ] Respond to user reviews
- [ ] For updates: increment `versionCode` + `versionName`, rebuild AAB, upload
