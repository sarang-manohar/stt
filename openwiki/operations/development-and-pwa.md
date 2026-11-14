---
type: operations
title: Configuration, Android packaging, PWA deployment and verification
description: Separate PWA and packaged Android builds, key exclusion, native sharing and permissions, HTTPS deployment, offline shells and device verification boundaries.
tags: [configuration, security, pwa, android, deployment, testing]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-14T14:28:39.707Z
sources:
  - id: openwiki-source-b849f76e187ecb8ae7a3ed77
    resource: repo://android/app/src/main/AndroidManifest.xml
  - id: openwiki-source-7f3c3e3c401e7be9b6c6d723
    resource: repo://capacitor.config.ts
  - id: openwiki-source-f8d10828394c4129061d5b0e
    resource: repo://index.html
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-a0de442c21f7f0d51df88b4f
    resource: repo://public/icon.svg
  - id: openwiki-source-e21de4e070e82eb7a1025ce0
    resource: repo://public/manifest.webmanifest
  - id: openwiki-source-d9a126c7b65e7504a3f0c163
    resource: repo://public/sw.js
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-e39b94d6b8f037adcd800def
    resource: repo://scripts/browser-smoke.mjs
  - id: openwiki-source-bdb951d21aadf79de1168785
    resource: repo://scripts/generate-icons.mjs
  - id: openwiki-source-e202f83d20831c0b9638b8d3
    resource: repo://src/androidBuild.test.ts
  - id: openwiki-source-7d90f82caec53f32de792b89
    resource: repo://src/exportTranscript.test.ts
  - id: openwiki-source-cbd23dfa564a2006b104cc06
    resource: repo://src/exportTranscript.ts
  - id: openwiki-source-d4189bbeecb62806cb297b5a
    resource: repo://src/main.ts
  - id: openwiki-source-5e1b077422a94ae165e88e4e
    resource: repo://vite.config.ts
generated: { by: "pi", at: "2026-11-14T14:28:39.707Z" }
---

# Configuration, Android packaging, PWA deployment and verification

## Local workflow

The UI is vanilla TypeScript with Vite and no UI framework; Capacitor supplies the packaged Android shell and native export plugins. `index.html` loads `src/main.ts`, which imports CSS and wires the recorder, queue and stitcher. Use Node 22.12+ and npm; the implementation was verified with Node 22.23. `package-lock.json` pins dependencies. `.npmrc` enables legacy peer resolution to avoid npm 10's optional-peer resolution crash with Vitest 4.

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

Dev and preview bind all interfaces; the microphone still requires a secure context. `npm run build` first runs strict TypeScript checking, then produces `dist/`. Do not commit `node_modules/`, `dist/` or `.env.local`; the repository's `.gitignore` excludes these and permits `.env.example`.

## Key configuration and security

`vite.config.ts` reads environment files for the current mode. For browser builds it defines the client expression `import.meta.env.VITE_GROQ_API_KEY` from the first nonempty trimmed value of `VITE_GROQ_API_KEY`, then legacy `GROQ_API_KEY`, then an empty string. In `android` mode the expression is always empty, even if environment files contain a personal key; `src/androidBuild.test.ts` protects this distinction. It does not expose all unprefixed environment values. The existing `.env.local` is not rewritten. Restart development or rebuild production after changing keys.

If no environment key exists, tapping Start while online opens an HTML dialog rather than interrupting initial page load. Prepared Android offline Whisper does not require a Groq key. `main.ts` saves the supplied key under localStorage key `groq-api-key`; the current environment key always takes precedence. Storage access failures are caught, leaving a usable key in page memory. An auth pause exposes fallback key settings only if no environment key is present. Saving a fallback key resumes the paused queue; it does not automatically begin microphone recording.

**A client-side key is not a secret.** Build-time keys appear in downloadable JavaScript and therefore also in the offline app cache. A localStorage key is accessible to same-origin JavaScript and anyone controlling this browser profile. Never publicly host a personal-key build. A keyless static build with per-device input is safer for this personal-use design; a public or multi-user application needs a backend proxy/token strategy. Clear site storage to remove saved keys and the offline shell. Do not copy real values into source, screenshots, tests, logs or wiki Claims.

Audio goes directly to Groq with a bearer header; the app has no backend. Groq controls its own processing/data policies. Audio and its FIFO are memory-only; notes are saved automatically in browser localStorage or Android private Git storage. Explicit Android JSON sharing also writes a cache file that may remain on disk. GitHub PATs receive native Keystore encryption, unlike Groq localStorage keys; see [device-service security](../architecture/device-services.md#private-notes-and-git-synchronization). These guarantees do not imply that Groq receives no audio or that localStorage is encrypted.

## Language and model configuration

The header gear button beside Android's rightmost Sync control opens the Transcription settings dialog, containing language/model controls and the last detected language/model hint. Done or Escape closes it and restores focus. Controls default to Auto language and Auto model. Choose Hindi (हिन्दी), English or Hinglish for Hindi-English code-switched audio; Hindi and Hinglish both send `language=hi`, English sends `en`, and Auto omits `language` for Groq detection. With Auto model, English uses `whisper-large-v3-turbo` and Hindi/Hinglish uses `whisper-large-v3`. Explicit language selections choose the appropriate model immediately. Auto language starts with turbo, consumes Groq's `verbose_json` language metadata and, if needed, uploads the same chunk with the preferred model before committing once. Later language changes can trigger another refinement; these add API cost and latency. Silence or absent/unsupported metadata does not change the routing hint.

Manual `v3-turbo` and `v3` choices remain available and override routing. Previously saved manual preferences are preserved; select Auto model to enable the new behavior on an existing installation. A hint in the gear dialog shows the detected language and model actually used. Auto mode relies on Groq's recognition, not browser locale or script guessing.

`main.ts` persists validated selections under localStorage keys `transcription-language` and `transcription-model`; unavailable storage leaves usable tab-local settings. These preferences and the optional fallback key are persisted application settings; explicit Android JSON exports additionally write a private cache file. Language/model controls are disabled during recording, start/stop transitions or queued work, so settings cannot reinterpret pending audio. A language change keeps displayed text but resets prompt context; a fresh session omits the prompt rather than supplying earlier English text. Later requests use at most 200 trailing characters of committed session context.

The transcript explicitly uses `lang=hi` for Hindi/Hinglish, `en` for English and the detected `hi`/`en` in Auto (`und` until known), with `'Noto Sans Devanagari', system-ui, sans-serif`. Noto is used when installed; no external font service is required. See [multilingual request and Unicode stitching rules](../architecture/transcription.md).

## JSON Save and Share

Copy and Share serialize the same timestamp-keyed document entries, including empty values, with shared `serializeTranscript`. The on-screen view remains timestamped rows. There is no separate Save or JSON button. Copy is available with committed entries, even during recording; Share requires entries and an idle recorder/queue/export state.

The retained internal save utility is no longer wired to the UI. It writes UTF-8 `transcript.json`: browsers download it, while Android's `DocumentSavePlugin` uses `ACTION_CREATE_DOCUMENT`/`CATEGORY_OPENABLE` with `application/json` to choose a durable local/cloud destination without broad storage permission. UTF-8 writes resolve after stream closure; cancellation is distinct from success.

Native Share writes JSON into private cache and opens Capacitor's standard share chooser with that file URI. Browsers use Web Share for a JSON file if supported, otherwise JSON text; without Web Share they download `transcript.json`. Cancellation/failure does not cause a fallback download and leaves the document intact. Receiving targets determine file/text handling. This is explicit export, not automatic session persistence.

## JSON transcript download

The live transcript is a list of timestamped rows from `TranscriptDocument.toJSON()`, the same snapshot used for download. Each row displays the exact key and text value. Silent or fully repeated windows show a timestamp and a “No new text” hint while their JSON value stays empty. Copy writes JSON with those same timestamp keys and values. Clear removes all rows as well as export entries. Text and time labels are inserted with `textContent`, never HTML; long Hindi/Latin text wraps in the responsive two-column layout.

After recording stops and the queue drains, Share exports `transcript.json` (browser download/share or Android share sheet) with UTF-8 values and chunk-start keys such as `{"00:00":"First text","00:08":"Next text","00:16":"More text"}`. `TranscriptDocument` stores only newly appended stitched text per window, retaining empty values for silent/fully overlapped chunks. Timestamp origin is the first captured audio window, independent of upload delays; full windows advance eight seconds. Separate recordings retain elapsed pauses, and same-second contributions join rather than overwrite. Minutes can exceed 59. These are chunk markers, not word-accurate subtitles or imported-video timecodes.

Clear resets transcript, JSON entries and timeline, including after silence-only capture, and saves an empty snapshot. Successful automatic saves restore notes on reload; browser storage uses `dictation-notes` and Android uses device-specific Git files. Ready-state row edits save on focus loss. Downloads, selected documents, cached share files and GitHub note history all contain potentially sensitive text; clearing the displayed snapshot does not scrub Git history. This feature exports JSON; it does not import it or accept video uploads. See [timestamp format and ownership](../architecture/transcription.md#timestamp-keyed-json-download).

## Missing Hindi punctuation

The app preserves punctuation returned by Groq but has no automatic punctuation-restoration pass. Hindi/Hinglish with Auto model selects v3; this can help recognition, not guarantee sentence punctuation. The prompt contains only recent committed text and no punctuation-specific example. No danda is added at chunk boundaries, because windows can end mid-sentence.

For known Hindi speech, use explicit Hindi/Hinglish and v3. A punctuated Hindi style example is a possible prompt experiment but is not enabled and can leak seed text. The recommended stronger future option is an opt-in punctuation-restoration pass over stitched sentence context, constrained to retain original words, script and timestamp keys. It would require lexical-integrity validation and real-audio evaluation, incur extra API cost/latency and update the underlying document so UI and JSON remain synchronized. See [current behavior and extension boundary](../architecture/transcription.md#hindi-punctuation-boundaries).

## HTTPS deployment and Android installation

Deploy the complete `dist/` directory atomically at an HTTPS origin's **root path**. App, manifest, worklet and worker URLs are root-relative; subdirectory hosting is not currently supported. Localhost is trusted for desktop tests. A phone visiting a desktop's plain HTTP LAN IP will not have secure microphone/service-worker access; use an HTTPS deployment or a valid-certificate tunnel.

`public/manifest.webmanifest` declares scope/start URL `/`, standalone display, app colors and 192/512 PNG icons, including a separate maskable declaration. Open the HTTPS app in Chrome Android and choose **Add to Home screen / Install app** from the browser menu. Exact prompt text and timing depend on Chrome and device policy; the UI has no custom install prompt.

Target devices are Google Pixel 8a and HMD Fusion, plus desktop browsers. Physical-device checks remain necessary: installation, real microphone permissions and quality, long dictation, screen lock, background/foreground transitions, phone interruption, auth rejection and reconnect after a network loss. A wake lock is best-effort, not an Android background recording service. Keep the app foregrounded and do not close it until the queue drains.

## Packaged Android app

`capacitor.config.ts` selects app ID `app.personaldictation.mobile`, label Dictation, `dist-android/` assets, a secure local `https://localhost` origin, blocked mixed content and automatic system-bar margins on Android edge-to-edge displays. The native build uses JDK 21, Java 17 app source/target compatibility with core-library desugaring, minimum API 23 and compile/target API 35. A modern Android System WebView is still required; the manifest minimum alone does not guarantee web API compatibility on old devices.

Install JDK 21, SDK Platform 35, Build Tools 35.0.0, NDK 27.2.12479018 and CMake 3.22.1; point `ANDROID_HOME` or ignored `android/local.properties` at the SDK. Then:

```sh
npm ci
npm run android:apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
# Or prepare native source and open Android Studio:
npm run android:prepare-whisper
npm run android:open
```

`build:android` type-checks and runs Vite in `android` mode into `dist-android/`, leaving `dist/` independent. `android:sync` builds and runs `cap sync android`; `android:apk` and `android:bundle` first prepare pinned whisper.cpp v1.7.6 source and then assemble a debug APK or unsigned release AAB. Native CMake compiles ARM64/x86-64 CPU Whisper; the vendor checkout is ignored and excluded from Vitest's app-only test discovery. Re-sync after web/plugin changes. Use Android Studio's signed-bundle/APK flow for release distribution, secure the private keystore outside Git, select a permanent ID, increment versions and meet current store SDK/privacy requirements before publishing. See the [README Android guide](../../README.md#android-apk).

The manifest declares Internet, network-state, recording and audio-settings permissions and a required microphone; Capacitor's WebView bridge prompts at first `getUserMedia`. If permission is permanently denied, enable it in Android app settings. Backup is disabled to avoid backing up WebView-local keys/settings. Entered keys are still ordinary localStorage, not encrypted keystore storage, and are separate from Chrome's origin storage. Clear app data to remove them.

`MainActivity` holds `FLAG_KEEP_SCREEN_ON` while the activity is visible; no foreground recording service or guaranteed background/locked-screen capture exists. Process termination and Back can discard memory-only work, and WebView unload warnings are unreliable. JSON export uses Filesystem's UTF-8 private cache and Share's native file-URI handling rather than unreliable WebView Blob downloads. It needs no broad external-storage permission. The latest cached `transcript.json` can remain until cache/app data is cleared; selected share targets control their own copies.

`.github/workflows/android.yml` builds a debug APK on relevant pull requests, pushes to main/master or manual dispatch and uploads `dictation-android-debug` for 14 days. It uses Node 22, JDK 21, SDK 35, `npm ci`, unit tests and `android:apk`. Debug signing is for testing; different CI debug keys can prevent in-place updates. Native assets are bundled and the PWA worker is not registered, so no hosting or initial online shell fetch is needed. Groq transcription still needs connectivity; prepared local Whisper runs without it. Download the 32 MB verified multilingual tiny model through Settings before going offline. Connect an existing private `owner/repository` on `main` with a Contents read/write PAT imported from `.git_credentials`; remote creation/OAuth are not implemented. Every changed snapshot schedules background Git retry, and the top-right Ready-state button syncs immediately or queues offline. See [native setup and failure semantics](../architecture/device-services.md). A configured activity collector must allow `https://localhost` via CORS.

The app header, PWA icons and Android launcher icons use the same purple wave artwork from `public/icon.svg`. After editing it, run `node scripts/generate-icons.mjs` (requires ImageMagick's `convert`), then `npm run android:sync`. The generator updates 192/512 PWA PNGs, a full-background maskable icon, legacy square/round launchers and transparent adaptive foregrounds for all densities, the purple adaptive background color, and fallback drawable resources.

Device validation remains manual: microphone allow/deny and retry, real Hindi/Hinglish/English clips, Pause/Continue/Stop and final tails, gear settings and busy locks, JSON Copy, Share/cancel and available share-sheet destinations, Activity Trail expansion/outside-tap dismissal, launcher icon appearance, network recovery, rotation, background return and offline cold launch. Mocked plugin tests and desktop Chrome smoke tests do not certify Android hardware or WebView lifecycle behavior.

## Offline shell and update lifecycle

`main.ts` registers `/sw.js` only in production browser builds, after window load; native platforms skip registration. Registration failure shows an unobtrusive notice without blocking online dictation. The Vite `version-offline-shell` plugin hashes the output bundle, worker source and worklet source and emits a worker with a build-specific `dictation-shell-…` cache name. Changes to entry content or capture code thus change the worker/cache version.

At installation the worker caches `/`, `/index.html`, manifest, PNG icons and the worklet. It extracts fingerprinted `/assets/` script and stylesheet URLs from built HTML and caches those too. Installation must finish successfully before that shell is available offline. Navigation is network-first with cached index fallback; other same-origin GETs are cache-first with network fallback. The worker does not intercept non-GET or cross-origin requests, so Groq requests/responses and uploaded microphone audio are never API-cached. The cached JavaScript can still contain an environment key, as noted above.

There is deliberately no `skipWaiting()`: a newly installed worker waits for old clients to close before activating. Activation deletes older caches with this app's prefix and claims clients. This avoids replacing the worker underneath an active recording. Keep old fingerprinted deployment assets available during transitions where practical. The offline shell is **not offline transcription**: Groq access still requires connectivity, failed chunks retry only while this page remains alive, and no background sync/IndexedDB queue exists.

## Verification

- `npm test`: audio, WAV, stitching, FIFO/model detection, transcript document and activity-log tests, plus native/browser export and Android build-key exclusion tests. See [audio invariants](../architecture/audio-pipeline.md#verification-and-extension-seams) and [FIFO/stitching tests](../architecture/transcription.md#focused-tests).
- `npm run build`: strict type checking plus production asset/worker generation.
- `npm audit`: dependency vulnerability check; zero vulnerabilities at implementation verification.
- `npm run test:browser`: rebuilds, starts local production preview on port 4173, and runs `scripts/browser-smoke.mjs`. It requires installed Chrome at `/usr/bin/google-chrome`, or `CHROME_PATH` pointing to a compatible binary. `playwright-core` does not install a browser.

The browser smoke test uses a 393×852 mobile viewport, a synthetic microphone, real browser AudioWorklet/resampling/WAV production and intercepted/mocked Groq responses. It verifies a ten-second window plus trailing stop flush, sequential requests, stitched text, forced ScriptProcessor fallback, Copy/Clear, lack of horizontal overflow and offline reload through the installed worker. It also checks persisted Hindi/Hinglish and model settings, controls disabled while recording, transcript language attributes, Auto omitting `language`, and a language switch starting without the prior transcript's prompt. It also verifies Auto English→turbo and Hindi→v3 routing (including same-head refinement), compares rendered row keys/text with a downloaded JSON file (`00:00`/`00:08` deduplicated values and empty duplicate windows), verifies timestamp-keyed Clipboard JSON and checks Clear disables export. It also checks literal Hindi/HTML-like text does not create an image element and that the UI fits a 320px viewport. Landing checks cover 393×852, 320×720 and 852×393 viewports: the workspace occupies most of the screen, settings align top-right, and the default-collapsed Activity Trail expands on heading tap, stays open for inside taps, and closes on outside taps, repeated heading taps or Escape. It asserts no browser page errors and never bills Groq. It does not certify physical Android behavior, actual Groq CORS/auth/service availability, or transcription accuracy.

To additionally exercise the fallback dialog even if `.env.local` contains a key:

```sh
VITE_GROQ_API_KEY='' GROQ_API_KEY='' npm run test:browser
npm run build  # restore normal environment configuration
```

The unified JSON export update passed 76 unit tests, TypeScript/Vite production and Android APK builds, and both AudioWorklet and ScriptProcessor browser smoke paths. Smoke coverage includes hidden settings, dialog dismissal/focus restoration, busy locks, JSON Copy/Share parity, removal of Save and the JSON button and Share download fallback. The compact landing-screen update also passed unit tests, production browser checks and the Android web-asset build; this does not assert a new APK/device test. Native export unit tests mock the DocumentSave/Filesystem/Share bridges and are not device tests. Original implementation checks also exercised configured-key and keyless modes. Real microphone audio and real API requests were not used for these checks. Manually compare Hindi, English and Hinglish clips in Auto and explicit-language modes, with both models, including matras/danda, code-switch boundaries, regional accents and silence; mocked transport checks do not certify Groq's recognition quality.

## Operational failure boundaries

Queue/audio state is memory-only. Reload, crash, closure or Android process termination loses outstanding audio. Saved notes and native pending Git work survive; local-save failure requires exporting important notes. The unload warning is best-effort. Offline Android transcription uses prepared local Whisper; unavailable/slow local inference or browser cloud outages grow queued Blob memory (~320 KB per full chunk), so stop capture to bound memory. A transient failure never allows a later chunk to overtake the current head; nonretryable failures require explicit recovery. Environment-key recovery involves a rebuild/reload and therefore cannot preserve an existing in-memory queue.

The connectivity/Git/offline implementation passes 93 app unit tests, both production browser smoke paths and full debug APK compilation for ARM64/x86-64. Android repository instrumentation sources compile, but no connected device was available to run them or certify inference/authentication/background retry. `connectedDebugAndroidTest` and the README device checklist remain required for hardware validation.

See also: [Android device services](../architecture/device-services.md), [quickstart task routing](../quickstart.md), [audio lifecycle](../architecture/audio-pipeline.md), [upload and retry contracts](../architecture/transcription.md).
