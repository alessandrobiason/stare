# iOS builds and TestFlight releases

Nothing in WSL, Docker or Linux CI can produce an iOS binary — building one
drives Xcode, and Xcode is macOS-only. The Mac here is a GitHub `macos-26`
runner, so no Mac has to be owned or borrowed.

**TestFlight is the only way a binary gets onto a phone.** There is no Metro
over the Wi-Fi and no Expo Go — no Mac to plug the phone into, and no
registered devices to install ad hoc onto. The other way to run the app is the
replay harness in a desktop browser, which is the [root README](../README.md)'s
subject.

A binary is not the same thing as the app, though. Everything under `src/` is
JavaScript, and `expo-updates` lets that half be replaced on a phone that
already has the binary, without Apple and without a macOS runner. Most changes
to this project are that half. See
[Shipping a fix without a rebuild](#shipping-a-fix-without-a-rebuild).

`ios/` is generated from `app.json` and never committed — edit `app.json`, not
the Xcode project, which the next `--clean` prebuild discards. That config pins
portrait-only orientation (the projection assumes an upright phone), the camera
and when-in-use location strings, and `UIRequiredDeviceCapabilities` for
gyroscope, magnetometer and location services.

Both workflows are `workflow_dispatch` only — no push or schedule trigger —
because macOS runners bill at 10x:

- **`.github/workflows/ios-build.yml`** — a Linux job regenerates the native
  project first (so a broken `app.json` fails fast at the 1x rate), then a
  `macos-26` runner runs `pod install` and `xcodebuild` against the simulator
  with signing off. No Apple Developer account, no secrets. It answers "does
  this still compile for iOS", not "here is an installable build".
- **`.github/workflows/ios-testflight.yml`** — a signed archive uploaded
  to App Store Connect, from which TestFlight installs it on a phone. Needs a
  paid Apple Developer account (99 EUR/year) and the seven secrets below. A run
  takes 20–30 minutes, plus a further 5–15 while Apple processes the build, and
  costs roughly 250 of the free 2,000 monthly Actions minutes. Its
  `configuration` input picks between the shipping app (`Release`) and a
  development build (`Debug`) — see below.

The third one is not a build at all, and is the one to reach for first:

- **`.github/workflows/ota-update.yml`** — publishes the JavaScript half of the
  app to phones that already have it. Runs entirely on Linux at 1x, takes about
  two minutes, needs one Expo access token and nothing from Apple.

Start any of them from the Actions tab, or `gh workflow run ios-build.yml`.

## TestFlight setup

Once, then releases are one button.

### 1. Distribution certificate

Xcode would normally generate the keypair and exchange it with Apple.
`tools/make-ios-dist-cert.sh` does the same with OpenSSL, so no Mac is involved:

```bash
./tools/make-ios-dist-cert.sh csr "Your Name" "you@example.com"
# upload .secrets/ios-dist.csr at developer.apple.com under Certificates -> +,
# pick "Apple Distribution", download the .cer it returns
./tools/make-ios-dist-cert.sh p12 ~/Downloads/distribution.cer
```

That writes `.secrets/ios-dist.p12` and prints its password. Keep
`.secrets/ios-dist.key` — the certificate is worthless without it, Apple allows
only a couple of distribution certificates per account, and they expire yearly.
`.secrets/` is gitignored.

### 2. App Store Connect API key

appstoreconnect.apple.com -> Users and Access -> Integrations -> App Store
Connect API -> generate a team key with the **App Manager** role. The `.p8`
downloads exactly once.

`altool` authenticates the upload with this key. It does no provisioning — see
"Why the release signs manually" below.

### 3. Register the identifier and the app record

Nothing in the workflow creates either, and `altool` refuses an upload without
an app record — at the very end of a 25-minute 10x job. Do both by hand:

1. developer.apple.com -> Certificates, Identifiers & Profiles -> Identifiers
   -> + -> App IDs -> App -> `com.alessandrobiason.stare`. No capabilities
   need enabling; camera, location and motion are Info.plist strings, not
   entitlements.
2. appstoreconnect.apple.com -> Apps -> + -> New App: iOS, bundle ID
   `com.alessandrobiason.stare`, any SKU. Names are unique across the whole App
   Store, and plain "Stare" was not available, so the record is **"Stare -
   Watch the Satellites"**. That name is only the store listing: uploads are
   matched by bundle identifier, and the name under the icon comes from
   `expo.name` in `app.json`, which stays "Stare".

The identifier lives in `app.json` as `expo.ios.bundleIdentifier`, and the
Linux gate compares the provisioning profile against it — so all three have to
agree, and changing one means changing all of them.

### 4. App Store provisioning profile

developer.apple.com -> Profiles -> + -> **App Store Connect** (under
Distribution, *not* iOS App Development) -> the `com.alessandrobiason.stare`
App ID -> the distribution certificate from step 1 -> name it plain text, no
`&` or quotes, which the workflow rejects because the name goes into an XML
plist -> Generate -> Download.

An App Store profile lists no devices and expires with the certificate that
signs it, so this and the `.p12` are regenerated together, roughly yearly.

### 5. Repository secrets

Settings -> Secrets and variables -> Actions:

| Secret | Where it comes from |
| --- | --- |
| `APPLE_TEAM_ID` | developer.apple.com -> Membership details |
| `APPLE_DIST_CERT_P12_BASE64` | `.secrets/ios-dist.p12.base64` from step 1 |
| `APPLE_DIST_CERT_PASSWORD` | printed by step 1 |
| `APPSTORE_KEY_ID` | shown next to the key from step 2 |
| `APPSTORE_ISSUER_ID` | shown above the key list from step 2 |
| `APPSTORE_API_KEY_P8_BASE64` | `base64 -w0 < AuthKey_XXXXXXXXXX.p8` |
| `APPLE_DIST_PROFILE_BASE64` | `base64 -w0 < Stare.mobileprovision` from step 4 |

Every base64 secret is the base64 *of the file*, not the file's own text: the
`.p8` already looks like text, so pasting its `-----BEGIN PRIVATE KEY-----`
straight into the box is the easy mistake. Run the command in WSL rather than
reaching for `certutil -encode`, which wraps its output in `BEGIN CERTIFICATE`
lines that are not part of the key. The Linux gate decodes all of them and
names the offender before any macOS minutes are spent — including whether the
profile is the right type, for this bundle identifier, from this team, and
still in date.

### 6. Accept the agreements

A newly paid account usually has an unsigned Program License Agreement waiting
at developer.apple.com -> Agreements. Unsigned, it surfaces much later as an
opaque authentication failure. TestFlight needs no tax or banking details.

### 7. Release

Run the workflow from the Actions tab. Once the build appears in App Store
Connect, add yourself under TestFlight -> Internal Testing — internal testers
need no Apple review, external ones do — and install through the TestFlight app
on the phone.

First launch still downloads the 95 MB segmentation model before anything is
detected, so give it a minute on Wi-Fi before pointing it at the sky.

Once a build made after the updates setup below is installed, most later fixes
do not come this way at all — see
[Shipping a fix without a rebuild](#shipping-a-fix-without-a-rebuild).

## Native patches to dependencies

`patches/` holds patches applied to `node_modules` by `patch-package`, from the
`postinstall` script, on every install — locally and in every workflow, all of
which run a plain `npm ci` with dev dependencies.

There is currently one, and it is worth knowing why it exists rather than only
that it does.

`patches/expo-camera+57.0.4.patch` disables automatic deferred photo delivery
on the camera's photo output. On hardware that supports deferred delivery — an
iPhone 15 does, an iPhone 12 mini does not — AVFoundation calls
`didFinishCapturingDeferredPhotoProxy` instead of `didFinishProcessingPhoto`,
and `expo-camera` implements only the latter, so every `takePictureAsync` comes
back as

```
CameraImageCaptureException: Image could not be captured
(at ExpoCamera/CameraPhotoCapture.swift:130)
```

which on this app is the sky mask failing every pass and the view going back to
the boot screen. Expo hit the same thing in 57.0.1 ([expo/expo#47728]) and
fixed it in 57.0.3, but inside the responsive-capture guard — which is read
mid-`beginConfiguration`, before the session runs, and can still be false on
hardware that supports the feature once the configuration settles. The patch
moves the disable out of that guard and repeats it after `startRunning`, where
the flags describe the configuration that will actually be captured under.

[expo/expo#47728]: https://github.com/expo/expo/issues/47728

**A patch is native code, so it ships in a binary and not in an update.** This
is the distinction the next section is about: three attempts were made at that
capture failure in JavaScript alone, each shipped over the air, and none of them
could have worked, because nothing the bundle can reach configures the photo
output. If the same error is ever reported again, check first whether the phone
is running a build made after the patch landed rather than an update layered
onto an older one.

The same patch also makes a capture failure say what went wrong.
`CameraImageCaptureException` has one fixed reason string — "Image could not be
captured" — for every possible cause, and `expo-camera` discards the `NSError`
AVFoundation handed it. The patch keeps it, so the message that reaches the
error screen now reads

```
Image could not be captured: <domain> <code> <description>,
iOS=26.6.1, app=active, running=1, interrupted=0,
preset=AVCaptureSessionPresetPhoto, preview=390x520,
lastInterruption=none, interruptions=0, startAttempts=1, runtimeError=none,
connection=on/active, device=Back Camera, activeFormat=4032x3024,
maxPhotoDimensions=WxH, deferred=0, responsive=1, fastPriority=1,
zeroShutterLag=1
```

Every term there separates causes that the bare string does not:
`interrupted=1` or `connection=on/inactive` is a session that has lost the
camera; `preview=0x0` is a preview layer that was never laid out; a mismatch
between `activeFormat` and `maxPhotoDimensions` is the settings combination
AVFoundation refuses; and the domain and code name the rest outright.

**The capture session, and the three ways `expo-camera` let it stay stopped.**
That diagnostic came back from an iPhone 15 reading `AVFoundationErrorDomain
-11803 Cannot Record, running=0, interrupted=1`, with the requested photo
dimensions matching the active format exactly. -11803 is
`AVErrorSessionNotRunning`: nothing was wrong with the request, the session was
not running, and it never started again. Three separate defects hold it there,
and the patch closes all three.

`startRunning()` is not a call that succeeds or fails. It returns having done
nothing when the session cannot run, and `updateCameraIsActive` — the one caller
— never looked afterwards. A session asked to start in a moment when the camera
is not available stayed stopped for the life of the view. It is now asked again
on a bounded ladder, and a session that will not start after it says so through
`onMountError` instead of showing black in silence.

`AVCaptureSessionWasInterrupted` and `AVCaptureSessionInterruptionEnded` were
not observed at all — only `AVCaptureSessionRuntimeError`, and only for
`mediaServicesWereReset`. iOS interrupts a session for reasons that have nothing
to do with the app, and nobody restarted it when the interruption ended. Both
notifications are now observed, the reason is kept for the failure text as
`lastInterruption`, and the end of an interruption restarts the session on the
session queue.

`onCameraReady` was sent unconditionally, one queue hop after asking the session
to start and without looking at whether it had. On a phone where the session
would not start, the only event that says "the camera is usable" said so anyway:
the camera lab reported `onCameraReady=yes` for all 21 of the captures it then
watched fail. It is now sent from a key-value observation on `isRunning`, so it
arrives when the session is genuinely running and not before — on the first
start, on a rung of the retry ladder, or on an interruption ending minutes
later.

A capture that arrives while the session is stopped starts it first, on the
session queue. Not on the calling thread: a view's async functions are
dispatched on the main actor, and `startRunning()` blocks until the capture
graph is up.

`postinstall` runs `patch-package --error-on-fail`, so an install whose patch no
longer applies fails the job rather than quietly producing an unpatched binary.
Both iOS workflows then grep the patched sources in `node_modules` before
anything expensive runs, which catches the other half: a `postinstall` that
never ran at all. A build that reaches `pod install` has the patch in the
sources CocoaPods compiles.

**Which build is on the phone.** The release workflow stamps
`ios.buildNumber` as `<run_number>.<run_attempt>`, so the build number
TestFlight shows is the GitHub Actions run number. When a fix appears not to
have worked, check that first: the number in TestFlight against the number of
the run that was supposed to carry it. A native fix reaching a phone that is
still on the previous binary looks exactly like a native fix that does not
work, and telling those apart by reasoning is not possible.

That string doubles as a check on which binary is running: if a phone reports
the bare "Image could not be captured" with nothing after the colon, it is
running a build from before this patch, and whatever was shipped since reached
it as a JavaScript update over an older binary.

Drop the patch when `expo-camera` ships a version that disables deferred
delivery unconditionally and reports the underlying error: delete the file, and
`npm ci` will stop applying it. `patch-package` fails loudly if the package
version moves and the patch no longer applies, so an upgrade cannot silently
drop it.

## Shipping a fix without a rebuild

A release costs 20-30 minutes of macOS runner, roughly an eighth of the free
monthly allowance, and another 5-15 minutes of Apple processing before the
build is installable. That is the right price for a change to the native app.
It is a ridiculous price for a changed constant in `src/constants.ts`, which is
most of what this project actually changes.

`expo-updates` splits the two apart. The binary on the phone contains the
compiled native code and a copy of the JavaScript bundle; on every launch it
asks the update server whether there is a newer bundle for it, downloads one in
the background if so, and runs it from the *next* launch. So a JavaScript fix
reaches the phone in about two minutes of Linux CI, and the phone shows it on
the second launch after that. Nothing is submitted to Apple, because nothing
Apple reviewed has changed.

### The two things this adds, and how they differ

They are not alternatives, and neither replaces the other:

- **`expo-updates`** is the delivery mechanism, and it is in every build the
  release workflow makes from now on. It is what makes a fix to `src/`
  something you publish rather than something you rebuild. This is the one that
  matters day to day.
- **`expo-dev-client`** is a debugging tool. It is a launcher screen compiled
  into a *development* build, from which you can load any published update
  branch by hand instead of being stuck with whichever one the binary listens
  on, and which shows a real error overlay when JavaScript throws — the full
  message, rather than the truncated one line a release build puts in a status
  panel. Its podspecs are marked `debugOnly`, so a `Release` archive contains
  none of it and the shipping app is unaffected by its presence in
  `package.json`.

The dev client is worth having when a bug is hard to see from the outside. It
is not part of the normal loop, and it is not needed to ship anything.

### One-time setup

An Expo account, which is free, and no involvement from Apple.

The package is `eas-cli`, and the command it installs is `eas`. `npx eas ...`
does not run it: there is an unrelated package on npm called `eas`, npx finds
that one, and it has no executable at all — `could not determine executable to
run`. Either install it globally (`npm i -g eas-cli`) and then use plain `eas`,
or spell the package out as below.

1. `npx eas-cli login` — create the account first at expo.dev if there is not one.
2. `npx eas-cli init` — creates the project on Expo's side and writes its id into
   `app.json` as `extra.eas.projectId`.
3. `npx eas-cli update:configure` — writes `updates.url` to match that id.
4. `npx eas-cli channel:create production` if `npx eas-cli channel:view production`
   says there is none. The channel is what the binary asks for by name; the
   branch is what an update is published to; they are linked by having the
   same name here.
5. expo.dev -> account settings -> access tokens -> create one, and put it in
   the repository as the `EXPO_TOKEN` secret. It is the only credential
   `ota-update.yml` needs.
6. Run `ios-testflight.yml` once. **Updates only reach a build that was made
   with this configuration in place**, so the currently installed app cannot
   receive them — it was compiled before any of this existed.

`node tools/check-eas-updates.mjs` checks steps 2 to 4 and runs in the Linux
gate of every release, because a build pointed at a project that does not exist
installs and runs perfectly well and simply never updates, which is not a thing
you find out by looking at it.

### The loop, afterwards

Commit the change, then Actions -> **OTA update** -> Run workflow, with a
message saying what it changes. It typechecks, lints and tests before
publishing, since an update goes onto a phone with nothing in between to catch
it. Then relaunch the app twice.

To check beforehand whether a change can go out this way at all:

```bash
npm run runtime-version
```

Same hash before and after the change means it is JavaScript as far as the
native build is concerned, and an update carries it. A different hash means it
is not, and it needs `ios-testflight.yml`.

### What decides that, and why it cannot be got wrong

The `runtimeVersion` in `app.json` is the `fingerprint` policy: a hash over
everything the native build depends on — `app.json`, every config plugin, every
autolinked package, the autolinking configuration itself. `expo-updates`
computes it at build time and compiles it into the binary, and `eas update`
computes it again when publishing. **A phone only accepts an update whose
fingerprint matches its own.**

So publishing a native change is not dangerous, only useless: the update is
built, stored, and never offered to anything. The failure mode is a fix that
does not arrive, not a binary running JavaScript it cannot support. Both
workflows print the fingerprint into their run summary, so comparing them is
how you tell which of those happened.

`fingerprint.config.js` excludes exactly one thing from that hash, and it is
not a matter of taste: `ios-testflight.yml` stamps `ios.buildNumber` into
`app.json` before prebuild, so with version strings included the fingerprint
compiled into the binary would be one no checkout of this repository could
reproduce, and every update afterwards would silently miss it. Version strings
never reach compiled code. Nothing else is excluded, and nothing else should
be: the two mistakes are not symmetric, and the file says so at more length.

### Development builds

Actions -> iOS TestFlight -> Run workflow -> `configuration: Debug`. Same
signing, same upload, same TestFlight; the difference is that the dev client's
launcher is compiled in, and that a Debug build carries no embedded JavaScript
bundle, so the launcher is what you get on opening it. From there you can load
any published update branch.

Two things to know before running it. It installs over the release build —
same bundle identifier, so the phone holds one or the other — and a Debug
archive is an unusual thing to send App Store Connect, so if Apple's processing
rejects it, that is why, and the answer is to go back to `Release`.

## Why the release signs manually

Automatic signing is the obvious choice for CI and it cannot work here, which
costs a 10x job each time someone rediscovers that.

`xcodebuild archive` under automatic signing signs the archive **for
development** and leaves distribution to the export that re-signs it. A
development profile is minted from a registered device list and pairs with an
Apple Development certificate. This account has no devices — TestFlight is how
the app reaches the phone, so there was never a reason to register one — and no
development certificate. Apple therefore refuses with *"Your team has no
devices from which to generate a provisioning profile"*.

Nothing about that decision follows from `CODE_SIGN_IDENTITY`. Setting it to
`Apple Distribution` while the style stays automatic earns *"automatically
signed for development, but a conflicting code signing identity Apple
Distribution has been manually specified"* instead.

So the release signs manually, with the profile from step 4, and:

- `tools/set-ios-signing.mjs` writes `CODE_SIGN_STYLE`, the identity, the team
  and `PROVISIONING_PROFILE_SPECIFIER` onto the **app target** after
  `pod install`. Not onto the xcodebuild command line: a setting passed there
  reaches every target in the build, CocoaPods' included, and a pod that cannot
  carry a provisioning profile fails the build. It rewrites the generated
  project, which `--clean` prebuild recreates each run, so `app.json` stays the
  source of truth.
- The Archive and Export steps pass no signing settings, no
  `-allowProvisioningUpdates` and no API key: there is nothing left to ask
  Apple. The key is installed anyway, because `altool` uploads with it.
- The export options repeat the profile by name under `provisioningProfiles`,
  and `signingStyle` is `manual` there too — automatic would send the export
  back to Apple for the profile it cannot mint.

## Things the workflow handles for you

- **Build numbers.** `CFBundleVersion` must be unique per version string and
  rising, so it is stamped from `<run_number>.<run_attempt>` into `app.json`
  before prebuild. Re-running a failed release therefore gets a fresh number
  rather than colliding with the build it already uploaded. That stamp is also
  why `fingerprint.config.js` keeps version strings out of the update
  fingerprint — see "What decides that, and why it cannot be got wrong".
- **Icon alpha.** App Store Connect rejects an icon carrying an alpha channel
  (ITMS-90717), and the icon Expo falls back on when `app.json` names none is
  RGBA. `assets/icon.png` is opaque RGB, and `tools/check-icon-opaque.mjs` fails
  the Linux gate if that stops being true — a minute wasted instead of an hour.
  It is placeholder art from `tools/make-placeholder-icon.py`; replace it with
  something real before external testers see it.
- **Export compliance.** `ITSAppUsesNonExemptEncryption` is `false` in
  `app.json`, since the app only makes ordinary HTTPS requests. Without it, App
  Store Connect asks the question again on every single upload.

## When a release fails

`xcodebuild: error: Invalid authentication key credential specified
(CryptoKit.CryptoKitASN1Error.invalidPEMDocument)` in the Archive step means
`APPSTORE_API_KEY_P8_BASE64` decoded to something that is not a PEM private
key — the wrong secret pasted into the box, the `.p8` text pasted instead of
its base64, or a Windows round-trip that left `\r` on the header line. Redo the
secret with `base64 -w0 < AuthKey_XXXXXXXXXX.p8`. The gate now catches this in
the 1x job, so seeing it from the 10x one again means that job was re-run
alone.

Anything about provisioning profiles or conflicting signing settings —
`Your team has no devices from which to generate a provisioning profile`,
`No profiles for 'com.alessandrobiason.stare' were found`, `automatically
signed for development, but a conflicting code signing identity ... has been
manually specified` — means the archive went back to automatic signing. Read "Why the
release signs manually" above: all three of those are what automatic signing
does on an account with no devices, and each costs a 10x run to rediscover.

`does not support provisioning profiles, but provisioning profile ... has been
manually specified`, naming a pod or a package rather than the app, means the
signing settings reached targets they should not have. They belong on the app
target, which is what `tools/set-ios-signing.mjs` does; passing them to
`xcodebuild` applies them to everything it builds.

`No suitable application records were found` from `altool` is the missing app
record — step 3 above, and the only failure here that wastes a full run.

The Archive step is also where an unsigned Program License Agreement lands, as
an authentication failure rather than anything mentioning agreements — step 6
above. A failed run costs nothing on Apple's side and the next one gets a fresh
build number, so re-running after fixing any of this is safe.
