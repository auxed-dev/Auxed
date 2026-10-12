# AUXED native app (App Store / Play Store)

The web app (PWA) already does everything except the always-on lock-screen card. Wrapping it with
[Capacitor](https://capacitorjs.com) gives the same screens in a native shell, plus:

| Platform | Lock-screen card | What it shows | Buttons |
| --- | --- | --- | --- |
| iPhone (iOS 17+) | **Live Activity** (lock screen + Dynamic Island, up to 8 h) | Song, artist, venue, time left | 🔥 🙌 react (no unlock), ♪ Request (opens the request sheet) |
| Android | **Ongoing notification** (lock screen, notification shade) | Song, artist, venue | 🔥 react, ♪ Request, Reply (quick Wire Room line) |
| Web / PWA | Push notification card (Android Chrome, iOS 16.4+ home-screen app) + media controls while AUX IN is playing | Song, artist, venue | 🔥 🙌 react, ♪ Request (Android) |

The server side is already in this repo:

- `POST /api/push/native` registers tokens (`IOS_LIVE_ACTIVITY_START`, `IOS_LIVE_ACTIVITY`, `IOS`, `ANDROID`).
- `lib/server/push.ts` sends Live Activity updates through APNs whenever the song changes
  (`notifyNowPlaying`). Set `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, `APNS_BUNDLE_ID`
  (and `APNS_PRODUCTION=true` for App Store builds).
- `POST /api/performances/:id/react-now` is what the 🔥 / 🙌 buttons call.

## Set up

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init AUXED app.auxed --web-dir out
npx cap add ios
npx cap add android
```

`capacitor.config.ts` in this folder points the native shell at your deployed site (`server.url`),
so the app always runs the latest web build and the session cookie works as normal.

### iOS — Live Activity

1. In Xcode: File → New → Target → **Widget Extension**, name it `AuxedLiveActivity`, tick
   "Include Live Activity". Replace its files with `ios/AuxedLiveActivity/*.swift`.
2. Add `ios/App/LiveActivityPlugin.swift` to the App target and register it.
3. App target → Info: `NSSupportsLiveActivities = YES`, and add the **Push Notifications** capability.
4. Put `AuxedActivityAttributes.swift` in **both** targets (App and widget).

From the web code, `lib/client/native.ts` → `startLiveCard(performanceId, …)` starts the activity
when someone joins a set and sends its push token to the server.

### Android — ongoing notification

Copy `android/LiveCardService.kt` into `android/app/src/main/java/app/auxed/` and declare it in
`AndroidManifest.xml`:

```xml
<service android:name=".LiveCardService" android:exported="false" android:foregroundServiceType="mediaPlayback" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

Updates arrive by FCM (`ANDROID` tokens) or from the web view while the app is open.

## Store rules to plan for

- **In-app purchases**: once AUXED is in the stores, buying tokens and AUX IN passes inside the app
  will almost certainly need Apple / Google in-app purchase (15–30% fee). The web app is unaffected.
- **Music**: personal Spotify / Apple Music / YouTube accounts are for personal use; venues need
  business music licences (SAMRO, SAMPRA, CAPASSO) before auto-play or AUX IN goes live.
