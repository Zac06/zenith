# Zenith on Android and iOS

The same app runs on Android phones and tablets. Tablets (600 px wide and up) keep the sidebar; phones get a bottom navigation bar.

## Status

| Platform | State |
| --- | --- |
| **Android** | Works. Released as a signed `.apk` on the GitHub releases page (Android 7.0 or newer). |
| **iOS** | **Not supported yet.** The iOS project and its Swift plugin are in the repo as groundwork, but the iOS build has known bugs and has not been run, so there is no iOS download, no CI job and no App Store or TestFlight build. See [iOS](#ios). |

## Build it

You need the usual Tauri mobile setup: <https://v2.tauri.app/start/prerequisites/> (Android Studio + NDK for Android, Xcode on a Mac for iOS).

```
npm install
npm run tauri android init      # once; creates src-tauri/gen/android
npm run tauri android dev
npm run tauri android build
```

`src-tauri/gen/android` is already committed, so `android init` is only needed on a fresh checkout without it. (`npm run tauri ios init`, `ios dev` and `ios build` exist too, but iOS does not work yet; see [iOS](#ios).)

## What had to change, and why

| Problem on a phone | What the branch does |
| --- | --- |
| No app entry point | `run()` is a Tauri mobile entry point |
| Single-instance plugin is desktop-only | Only registered (and only compiled) on desktop |
| `keyring` has no Android backend | Android encrypts the login with a key that stays in the Android Keystore (secure hardware where the phone has it) and stores only the ciphertext, so backups of it are useless; iOS still uses the Keychain (`secret` in `lib.rs`, `plugins/android-native`) |
| OpenSSL can't be cross-compiled for Android | `reqwest` uses rustls on Android |
| The opener plugin only opens URLs on mobile, so downloaded files could not be opened | Android: the file is opened with the app the user picks, from the system's "open with" list (`plugins/android-native`). iOS: the file is previewed in Quick Look, the system viewer, whose Share button has "Open in…" and "Save to Files" (`plugins/ios-native`) |
| No user-visible Downloads folder, no folder picker | Files go to the app's own storage; the "Download folder" setting is hidden |
| Browser SSO returns through `zenith://` | The scheme is registered for Android and iOS in `tauri.conf.json` |
| The system can close the app while the browser login is open | The login attempt is saved on disk and read back when the link returns. A link that starts the app from scratch is not delivered as an event, so the app asks for it at startup (`get_current`). The handler runs off the UI thread, which would otherwise freeze Android |
| Self-update prompts break store rules | The GitHub update check does nothing on mobile |
| Sidebar, `100vh`, notches | Bottom bar under 600 px, `100dvh`, `viewport-fit=cover` and safe-area insets |
| No hover or right-click on touch | Course menu button always visible, 44 px touch targets |
| Android back button closed the app | Each open course is a history entry, so back goes up one level (`src/courseStack.ts`) |
| Sign out lived in the sidebar | On phones it is in Settings → Account |

## Signing the Android APK

Android refuses to install an unsigned APK, and every update has to be signed with the same key. Make the key once:

```
keytool -genkey -v -keystore ~/zenith-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias zenith
```

Use one password for the keystore and the key. **Back the file up** (and the password): with a new key, phones that have the app installed must uninstall it before they can update. Never put it in the repo.

For builds on your machine, create `src-tauri/gen/android/keystore.properties` (already git-ignored):

```
keyAlias=zenith
password=the-password
storeFile=/home/you/zenith-release.jks
```

Then `npm run tauri android build -- --apk --target aarch64` gives a signed `app-universal-release.apk` in `src-tauri/gen/android/app/build/outputs/apk/universal/release/`. Without that file the build still works and the release APK is simply unsigned.

For GitHub (`.github/workflows/release.yml`, on every `v*` tag), add three repository secrets under Settings → Secrets and variables → Actions: `ANDROID_KEY_ALIAS` (`zenith`), `ANDROID_KEY_PASSWORD`, and `ANDROID_KEY_BASE64` (the output of `base64 -w0 ~/zenith-release.jks`; on a Mac `base64 -i ~/zenith-release.jks`). The workflow adds the signed APK to the draft release.

## Android notes

- **Android 7.0 or newer** (API 24). The release APK contains 64-bit and 32-bit ARM code, which is every current phone and tablet. It does not run on x86 emulator images; use an ARM image or a real device.
- **Installing.** The release is an `.apk`, not a Play Store listing. The first time, Android asks you to allow installs from the browser or file manager you used. Allow it for that one install.
- **Updating.** The app never updates itself and never prompts about new versions on a phone. To update, download the newer `.apk` from the releases page and install it over the old one. This only works because every APK is signed with the same key (see below); an APK signed with a different key has to be installed after uninstalling the old app, which also deletes its saved login and files.
- **Your login** is encrypted with a key that never leaves the Android Keystore. If the phone is restored from a backup or its lock screen is reset, that key is gone and you simply sign in again.
- **Files stay inside the app.** They are removed on uninstall and are not shown in the Files app. Opening one hands a copy to another app, and the copy stays in the app's cache until Android clears it.
- **Browser sign-in.** Android may close Zenith while the browser login is open. The login attempt is kept on disk, so the sign-in still completes when the link brings the app back.
- **Back button.** Back goes up one level (from a course to the course list) before it leaves the app.
- **https only.** Release builds refuse plain `http://` sites and traffic. Debug builds allow it so the dev server works.
- **Launcher icon.** The adaptive icon is the app's `M` and bookmark, in the pine green `#1F5C4A`, so it keeps the same look under every launcher mask. The foreground is the mark alone, kept inside Android's safe zone (source: `src-tauri/icons/android/ic_launcher_foreground.svg`); the background is the green colour layer. The files live in `src-tauri/icons/android` and are copied into `src-tauri/gen/android/app/src/main/res`. `npx tauri icon` rewrites the first folder with a stock full-bleed foreground, so after running it regenerate the foreground from the SVG and copy it into `res` (the generated project is committed and is not refreshed by `tauri icon`).

## iOS

Not supported yet. What is in the repo:

- `src-tauri/gen/apple`: the Xcode project made by `tauri ios init`.
- `src-tauri/plugins/ios-native`: a small Swift plugin that shows a downloaded file in Quick Look, the system viewer, whose Share button has "Open in…" and "Save to Files". Login is kept in the iOS Keychain through the same `keyring` code as on the desktop.

None of it has been run: the iOS build has bugs that are still open. The release workflow has no iOS job, `bundle.iOS.developmentTeam` is not set, and nothing is signed for Apple. To pick it up you need a Mac with Xcode and an Apple Developer account, your team ID in `APPLE_DEVELOPMENT_TEAM`, and then to fix the build before anything else.

## Known limits

- **Android has been tested on a phone; iOS has not been tested at all.** The iOS-only Rust type-checks against the real iOS target and the Swift only parses; none of it has been run. The layout was also rendered in WebKit at phone, tablet and desktop sizes.
- **A login attempt does not expire.** It is replaced by the next attempt and deleted when its callback arrives. The passport in it is random and is only useful together with a callback signed by your Moodle site.
- **Stores need a privacy policy link.** Use `PRIVACY.md`, and update it if a store build adds anything.
