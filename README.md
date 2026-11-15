# Dictation

A minimalist, mobile-first dictation app: a browser PWA with Groq Whisper and a Capacitor Android app with cloud/offline Whisper, local notes and GitHub syncing. No app backend or UI framework.

## Run

Use Node.js 22.12+ (tested with Node 22.23) and npm:

```sh
npm ci
npm run dev
```

Open the printed localhost URL. The existing `.env.local` is preserved. Either `VITE_GROQ_API_KEY` or legacy `GROQ_API_KEY` is accepted; the nonempty Vite-prefixed key wins. Restart Vite/rebuild after changing environment keys. If neither exists, tap Start to enter a key; it is saved in this origin's `localStorage` only. An auth failure pauses the FIFO and offers key settings (fallback mode) and Retry queue. For environment keys, edit `.env.local` and restart/rebuild instead.

**Security:** A browser-only API key is not secret: build-time keys are embedded in downloadable JavaScript, including the offline cache. Do not publicly host a build containing a personal key. Prefer a keyless build and the fallback input on trusted devices; a public/multi-user deployment needs a backend token proxy. Online audio is uploaded directly to Groq and is subject to Groq's data policies. Offline Android audio is processed on-device. Audio queues remain memory-only; notes are saved automatically (browser localStorage or an Android app-private Git repository). A fallback Groq key and language/model preferences are also stored. Clear site/app storage to remove local data; this does not remove notes or history already pushed to GitHub.

## Build and install

```sh
npm run build
npm run preview
```

Deploy `dist/` at an HTTPS origin's **root path**, not a subdirectory. A phone opening a desktop's plain HTTP LAN IP will not have microphone/service-worker access: use an HTTPS host/tunnel with a valid certificate. Localhost is trusted for desktop development.

On Chrome Android (Pixel 8a / HMD Fusion), open the HTTPS app, then use the Chrome menu → **Add to Home screen / Install app**. The manifest declares standalone display and 192/512 PNG icons; a production-only service worker caches the app shell and AudioWorklet. The shell opens offline, but transcription still requires Groq connectivity. Updates wait until existing app tabs close to avoid replacing an active dictation's build.

## Android APK

The checked-in [`android/`](android/) project packages the same UI and audio pipeline in a Capacitor WebView. It loads bundled assets from `https://localhost`, not a hosted website, so no HTTPS deployment is needed. Online transcription uses your Groq API key. Offline transcription uses a downloaded, quantized multilingual Whisper tiny model without an API key.

### Build and install

Requirements: Node.js 22.12+, **JDK 21**, Android SDK **Platform 35**, **Build Tools 35.0.0**, **NDK 27.2.12479018**, **CMake 3.22.1**, system Vulkan development headers, `glslc`, a host C/C++ compiler and Ninja on `PATH` for Vulkan shader generation, and an up-to-date Android System WebView/Chrome on the phone. On Debian/Ubuntu, install the host prerequisites with `sudo apt-get install libvulkan-dev vulkan-tools glslc build-essential ninja-build`. CMake uses system headers/tools but links each Android ABI against the NDK Vulkan stub, not the host Vulkan library. The native minimum is Android 6 (API 23); Vulkan requires Android 7 (API 24) or later and a compatible driver. Old devices also require a current WebView; validate your target phone.

Set `ANDROID_HOME` to your SDK directory (commonly `$HOME/Android/Sdk` on Linux), or set `sdk.dir=/absolute/path/to/Android/Sdk` in the ignored `android/local.properties`. Then:

```sh
npm ci
npm run android:apk
# APK: android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Alternatively, copy the APK to your phone, open it and allow installation from that source when Android prompts. This is a **debug-signed APK for personal testing**, not a Play Store release. A debug APK can replace an earlier build only when signed with the same debug key; GitHub-hosted CI builds may have different keys. Uninstalling to resolve a signature conflict clears the app's saved settings/key.

For Android Studio, run `npm run android:prepare-whisper` then `npm run android:open`. After web source or plugin changes, run `npm run android:sync` to rebuild `dist-android/` and copy assets/update native plugin registration. `android:apk` and `android:bundle` already do this. `dist/` remains the independent browser/PWA output.

Without a local SDK, run the **Android APK** workflow in GitHub Actions and download the `dictation-android-debug` artifact from the completed run. The workflow also runs on relevant pull requests and pushes to `main`/`master`. Unzip the artifact to get `app-debug.apk`.

### On the phone

1. Open **Dictation**, tap **Start**, and enter your Groq key.
2. Allow the microphone permission. If denied permanently, enable it in Android Settings → Apps → Dictation → Permissions, then try again.
3. Keep the app foregrounded while recording and until the queue drains. The Android window stays awake while visible; **background/locked-screen recording is not supported or guaranteed**. There is no foreground recording service.
4. Tap the **gear icon** for language detection and model selection. The last detected language/model is shown there too; settings lock while recording or audio is queued.
5. **Share** opens the standard Android share sheet with timestamp-keyed `transcript.json`; choose an installed save/share destination there. **Copy** copies the same JSON object to the clipboard. Share becomes available after recording and queued transcription finish. There is no separate Save or JSON export button.
6. The landing screen prioritizes the transcript workspace, with settings at the top right. **Activity Trail** starts collapsed; tap its heading to expand or toggle it closed, or tap outside to collapse it. Escape also collapses it when using a keyboard.

The Android build **always excludes both `VITE_GROQ_API_KEY` and `GROQ_API_KEY`**, even when `.env.local` contains one. The entered key lives in this app's WebView local storage, separately from Chrome/PWA data; it is not encrypted secure-keystore storage. Clear the app's storage to remove it. Android backup is disabled. Share explicitly writes the latest `transcript.json` into the app's private cache for sharing; it may remain until Android clears the cache or you clear app storage. Audio remains memory-only. Transcripts are committed automatically to an app-private Git repository; clearing notes commits an empty snapshot but does not erase Git history. Native builds do not register the PWA service worker: APK updates replace the bundled shell. Optional `VITE_ACTIVITY_LOG_URL` still applies; a collector must allow the native origin `https://localhost` via CORS as well as your web origin.

### Release distribution

Run `npm run android:bundle` for `android/app/build/outputs/bundle/release/app-release.aab`. Release output is **unsigned** by default. In Android Studio use **Build → Generate Signed App Bundle / APK**, create/store your private keystore securely outside version control, and sign for distribution. Never distribute debug builds as production releases. Before publishing, choose your permanent application ID in both `capacitor.config.ts` and `android/app/build.gradle` (and rename the Java package/namespace consistently), increment `versionCode`/`versionName`, meet the store's current target-SDK requirements, and supply privacy/data-safety disclosures for microphone audio sent to Groq and any configured activity collector. The current target/compile SDK is 35.

### Device verification checklist

Automated web tests and APK compilation do not validate device hardware or Android permission/lifecycle behavior. On your target phone test first-launch permission allow/deny and retry, Hindi/Hinglish/English recording, Pause/Continue/Stop and final-tail transcription, gear settings (including disabled controls while busy), JSON Copy, Share/cancel and available share-sheet destinations, collapsed/expanded Activity Trail and outside-tap dismissal, offline queue recovery, rotation, and returning from background. Also test a cold launch offline after downloading the model (dictation must succeed with no Groq key), airplane-mode transitions during cloud uploads, model download failure/retry, encrypted credential import, Ready-state Sync, background reconnect, app restart with pending commits, denied GitHub permissions, rejected pushes and merge conflicts. Use `./gradlew connectedDebugAndroidTest` to run the native repository persistence/security test on a test device. Export important text when a local save error appears; process termination can still discard queued audio, and unload warnings are unreliable in a WebView.

## GitHub sync and offline Android dictation

### Connect a notes repository

1. Create a **private GitHub repository** dedicated to notes. Use `main` as its default branch (an empty repository is supported). The app does not create remote repositories or guess your account/destination.
2. Create a fine-grained PAT limited to that repository, granting **Contents: read/write**. Organization accounts may require approval/SSO authorization. OAuth is not implemented.
3. Place `GITHUB_PERSONAL_ACCESS_TOKEN=your_token` in a `.git_credentials` file (see `.git_credentials.example`), or use Git's `https://username:token@github.com` credential format. Transfer it privately to the phone.
4. Open the gear dialog, enter `owner/repository`, select the credential file and tap **Connect repository**. Delete the transferred plaintext file afterward. The app encrypts the token using Android Keystore; it is not included in `.git/config`, commits, logs, JavaScript assets or APKs. Never check this file into source control. Developer credentials are never read by the build.
5. **Sync** is in the header's top-right corner and enabled when Ready and local saves finish. Offline it reads **Queue sync**. Every saved Android snapshot creates a local commit and schedules network-constrained WorkManager work; the button also initiates an immediate sync or queues it offline. Android may defer background work under battery restrictions. App restarts retain pending work; the header refreshes background sync status periodically.

The app initializes its own Git repository under private app storage, independent of this source checkout. Each device writes `notes/<device-uuid>.json` so normal multi-device changes do not overwrite one another. Sync fetches/merges remote `main`, then pushes without force. It does not display other devices' files. Tokens can be updated for the same destination; changing destinations is intentionally blocked to prevent accidentally publishing existing private history elsewhere. Clone the remote on a computer to resolve exceptional same-file merge conflicts; export local notes before clearing/reinstalling an app with unresolved conflicts. A missing/inaccessible repository or rejected push leaves local commits pending. Clearing displayed notes does **not** scrub previous commits on-device or on GitHub.

### Prepare offline Whisper

While online, open Settings and tap **Download tiny model (32 MB)**. The native plugin follows HTTPS redirects to download `ggerganov/whisper.cpp`'s `ggml-tiny-q5_1.bin` from pinned revision `5359861c739e955e79d9a303bcbc70fb988958b1`, verifies its 32,152,673-byte size and SHA-256 `818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7`, then atomically installs it into private app storage. The installed model is verified again at startup; download it again if verification fails. The revision, size and digest must be updated together to deliberately change models. No model is bundled in the APK; first-use offline dictation requires this preparation. Failed downloads leave an existing model intact and can be retried.

The header uses Android's validated default-network capabilities, not merely Wi-Fi association: captive portals/no internet show **Offline Mode**. Cloud audio is used only in **Online Mode**. Each offline FIFO head passes the existing mono 16 kHz PCM WAV into JNI/whisper.cpp; native inference runs off the UI thread, caches the model, prefers the Vulkan backend and falls back to up to four CPU threads when Vulkan is unavailable. The settings detection hint shows Vulkan or CPU after local inference; Vulkan may itself be software-rendered in virtualized environments such as Waydroid. Missing models/inference errors pause rather than discard queued audio. Downloading a missing model or reconnecting allows recovery. Browser network status uses `navigator.onLine` and is only a hint; browser offline speech recognition and Git sync are not implemented.

Offline inference eliminates network round trips, **not computation or chunking latency**: recording currently emits 10-second windows with an eight-second stride. Tiny's multilingual accuracy, especially Hindi/Hinglish, is lower than cloud large-v3; sustained real-time performance depends on hardware. The APK builds `arm64-v8a` and `x86_64` only. `npm run android:prepare-whisper`, automatically run by the APK/bundle scripts, fetches pinned whisper.cpp v1.7.6 commit `a8d002cfd879315632a579e73f0148d06959de36`. Keep upstream license notices with distributions; model weights are derived from OpenAI Whisper (MIT).

Notes are restored on startup. When Ready, edit a transcript row and move focus away to save it; Copy/Share and subsequent transcription use the edited snapshot. Never rely on local save succeeding after process termination: export important notes if the app reports a save error. Device storage, downloaded models and token encryption keys are lost on uninstall/clear storage.

## Use and limitations

- Tap the **gear icon** to choose a language: **Auto** (default, Groq detects the language), **Hindi (हिन्दी)**, **English**, or **Hinglish** for Hindi-English code-switched speech. Hindi and Hinglish both send `language=hi`; English sends `en`; Auto omits the field. The queue also accepts other explicit ISO-639-1 codes through `getLanguage`.
- **Auto model** is the default: English uses **v3-turbo** (`whisper-large-v3-turbo`), while Hindi/Hinglish uses **v3** (`whisper-large-v3`). In Auto language mode the first chunk starts with turbo and Groq's `verbose_json` language metadata determines the preferred model. If needed, that same chunk is retranscribed with the preferred model before committing; later chunks reuse it and can switch again when language changes. A language switch can therefore cost an extra upload. Silence/missing or unsupported language metadata does not change the model. Detection is based on Groq's audio result, not a guess from script or browser locale; its accuracy is not guaranteed.
- You can still select **v3-turbo** for speed or **v3** for multilingual accuracy manually; explicit choices override automatic routing. Saved manual preferences are preserved—choose Auto model to enable routing on an existing installation. Language/model preferences persist in this browser; controls are locked while recording, starting/stopping, or audio remains queued.
- Changing language keeps displayed text but starts fresh prompt context, avoiding earlier English conditioning in a new Hindi session. Clear also resets context. Fresh sessions send no prompt; subsequent requests use up to 200 trailing characters of committed session text, with no English-only seed. The transcript uses `lang=hi` for Hindi/Hinglish, `en` for English and the detected language in Auto (`und` until known), plus a Devanagari-capable font stack (Noto Sans Devanagari when installed, otherwise system fonts).
- Tap **Start** to reveal **Pause** and **Stop**. Pause flushes the current tail, releases the microphone and freezes the recording timer; queued transcription continues. **Continue** reopens the microphone within the same logical session, preserving language detection and transcript context. Each continuation starts a fresh audio window at the current wall-clock time, so no paused audio or overlap crosses the gap. Stop ends the session (including from paused) and returns to Start. Full 10-second chunks upload while recording. Pause/Stop flush trailing audio of at least half a second, including retained boundary overlap when new audio exists; shorter tails are discarded.
- Status shows recording time, queue processing, retry countdown or paused errors. The gear dialog shows the detected language and model used. The transcript displays timestamped rows (`00:00`, `00:08`, `00:16`, …) directly from the same entries as JSON export. **Copy** and **Share** serialize those exact timestamp/value entries as JSON, including empty rows. Copy works on the committed snapshot while recording. After recording/queue processing finishes, Share opens the platform share chooser: Android shares a cached JSON file; browsers share the JSON file when supported, otherwise JSON text. Browsers without Web Share download `transcript.json` instead. Cancelling a chooser does not trigger a fallback download. There is no separate JSON button. Clear resets text, rows, JSON entries and timeline.
- Keep the tab/app open until the queue drains. Audio and queue are in memory and disappear on reload, close, crash or OS process termination. Successfully saved transcript snapshots survive; pending audio does not. The unload warning is best-effort, particularly on Android.
- Screen wake lock is best-effort and reacquired on returning to the visible app. It cannot guarantee background recording through Android battery/process policies, phone calls or microphone revocation. Keep the app foregrounded.
- Network failures, timeouts, 408/429 and 5xx retry indefinitely at the FIFO head. On Android, network loss routes subsequent requests to local Whisper. If local inference cannot run or keep up, queued audio grows (~320 KB per full chunk); stop recording to limit memory use. Browser outages still require network recovery. Other HTTP failures pause rather than dropping audio.
- Boundary stitching compares the last/first 15 NFC-normalized tokens, preserving Hindi matras/nukta and the original displayed punctuation (including danda). Exact and single-substitution matching is supplemented by long-overlap alignment: boundaries of at least eight tokens may contain up to two substitutions/insertions/deletions, with at least 80% similarity, three distinct matching content words, an exact final three-token anchor and unchanged negation tokens. This handles shared audio transcribed slightly differently, such as “वहाँ आप प्रदेश…” vs “जहाँ उत्तर प्रदेश…”, without repeating the sentence. An exact-restart fallback also checks the last 32 tokens for an incoming prefix of 5–15 words that ends up to 16 words before the committed tail. It requires three distinct content-word anchors, rejects divergent continuations containing negation and does not truncate a longer exact run at the search limit. This handles a chunk adding a misrecognized tail before the next chunk restarts at an earlier phrase, such as “one ordinary looking merchant is…”. English and Hindi function-word guards prevent common-word-only overlaps from deleting text. Existing committed text is retained (including any recognition errors); only the incoming repeated prefix is removed. It is deterministic and conservative, not semantic correction or silence detection. Genuine repeated phrases and larger recognition differences may still be ambiguous; verify important text. Sub-half-second recordings are intentionally not uploaded.

## Monitoring activity trail

The on-screen activity trail is collapsed on launch. Tap **Activity Trail** to expand it; tap the heading again, tap outside the block, or press Escape to collapse it. Events continue accumulating while collapsed. It shows the latest 200 events for this tab, including initial/restored model and language choices, selection changes, recording lifecycle, every transcription request (including automatic model refinement), completion, errors, automatic retry delays and manual queue recovery. It is separate from the transcript and clearing the transcript does not clear the trail. The same events are written as JSON to the browser console with the `[dictation]` prefix.

For backend monitoring, set `VITE_ACTIVITY_LOG_URL` to your collector URL and restart Vite/rebuild. The app POSTs one JSON object per event, for example:

```json
{
  "event": "transcription.error",
  "message": "Groq request failed (503).",
  "level": "error",
  "timestamp": "2026-01-01T10:20:30.000Z",
  "sessionId": "random-per-page-load-uuid",
  "sequence": 7,
  "details": { "chunkTimestamp": 1767262820000, "attempt": 1, "retryable": true, "status": 503 }
}
```

`timestamp` is UTC ISO 8601 from the client clock. `sessionId` correlates a page lifetime (including multiple recordings); `sequence` provides client-side event order. Event names use `settings.*`, `recording.*` and `transcription.*`; details include model/language, chunk capture timestamp and retry metadata as applicable. No API keys, raw server response bodies, audio or transcript text are logged. Chunk timestamps and session metadata are still usage data—apply appropriate retention/access policies.

**Collector not included:** web and Android builds both send requests directly from the client. Configure a trusted HTTPS ingestion service (or same-origin reverse proxy); cross-origin collectors must allow your app origin, POST and the `Content-Type` header via CORS. Requests send no cookies or authorization headers. Do not put secret ingestion credentials in Vite environment variables. Protect public ingestion server-side with validation, size/rate limits and abuse controls; client events are untrusted and may be forged. With no endpoint configured, no monitoring requests are sent.

Delivery is **best effort**, non-blocking, with `keepalive` for page exit where supported. There is no durable buffer, delivery retry or backend acknowledgement tracking; offline/failed requests may be lost, and concurrent POSTs can arrive out of order. Monitoring failures do not interrupt dictation. Use server-side request logs/traces for authoritative Groq/backend diagnostics; this trail reports browser-observed behavior, not backend-internal operations.

## Timestamp-keyed JSON download

**Copy** and **Share** export the same UTF-8 JSON object, with timestamps as keys and newly transcribed text as values, such as:

```json
{
  "00:00": "आज हमारी team meeting है।",
  "00:08": "फिर lunch करेंगे।",
  "00:16": "See you tomorrow."
}
```

The UI renders these exact timestamp/value pairs as rows, not a separately formatted transcript. Empty values remain visible as timestamped “No new text” rows; that label is a display hint, not exported text. Hindi, Hinglish and punctuation are rendered literally using `textContent`, never HTML. Existing rows are reused across updates, including same-second contributions.

Keys are captured chunk start times relative to the first audio window, not upload/response times. Full windows advance by eight seconds. Values contain only newly added stitched text, not the repeated two-second overlap; silent/fully duplicated windows retain an empty string. These are **chunk-level** timestamps, not word-accurate subtitles: removing an overlap does not retime the remaining words. Pauses and separate Start/Stop sessions retain the elapsed pause on the timeline; same-second starts combine contributions without overwriting. Minutes can exceed 59. Clear starts the next export at `00:00`. JSON notes are saved automatically; audio remains memory-only. This feature does not import JSON or upload video files.

## Hindi punctuation

The app preserves punctuation supplied by Groq (including `।`, commas and question marks), but does not restore missing punctuation. It also never adds a danda simply because an eight-second window ended: audio chunks are not sentence boundaries. Hindi/Hinglish with Auto model already uses v3, which can improve recognition but does not guarantee punctuation. The request prompt contains only recent committed context; it has no punctuation-specific seed and can carry forward an unpunctuated style.

For better results, use explicit Hindi/Hinglish plus v3 for known Hindi audio. A short, correctly punctuated Hindi style example in the Whisper prompt could encourage punctuation, but would need real-audio evaluation: Whisper prompts condition continuation rather than reliably execute instructions, and seed text can leak into output. The stronger optional approach is a punctuation-restoration pass over committed, stitched text with sentence context across windows, constrained to preserve the original words, script and timestamp keys. Such a pass would add API cost/latency and could change meaning, so it should be opt-in, validated and update the underlying document before rendering/export—not decorate only the UI. Neither a style seed nor a restoration API pass is currently enabled.

## Verify

```sh
npm test                 # PCM windows/resampling, WAV, multilingual stitching, Groq fields, FIFO/retries
npm run build            # strict TypeScript + Vite production build
npm audit
npm run test:browser     # production smoke test; requires installed Chrome
```

`test:browser` uses `playwright-core` with `/usr/bin/google-chrome` (override via `CHROME_PATH`), a synthetic microphone and mocked Groq responses—no paid API calls. It checks portrait/narrow/landscape landing layout, top-right gear placement, collapsed Activity Trail and tap/keyboard dismissal, gear dialog visibility/dismissal/focus restoration, persisted Hindi/Hinglish and model selectors, settings locked during recording, Share payloads and JSON download fallback, 10s+tail upload, sequential requests, stitching, ScriptProcessor fallback, Auto English/Hindi model routing, timestamped UI/JSON parity (including empty rows), literal Hindi/HTML-like text rendering, 320px layout, JSON Copy/Clear and offline reload. To test keyless fallback despite an existing `.env.local`:

```sh
VITE_GROQ_API_KEY='' GROQ_API_KEY='' npm run test:browser
npm run build  # restore normal environment configuration
```

`.npmrc` works around npm 10's optional-peer resolution crash with Vitest 4. Physical Android microphone quality, wake-lock behavior, install prompts and real Groq interoperability require manual validation; automated smoke tests do not certify those devices.

## Modules and architectural memory

- `src/audioRecorder.ts`: streaming resampler, fixed PCM ring/slicer, capture and wake-lock lifecycle.
- `public/audio-worklet.js`: mono audio capture, transferred blocks, stop acknowledgement.
- `src/wavEncoder.ts`: PCM RIFF/WAVE encoding and slice-time filenames.
- `src/transcriptionQueue.ts`: single-worker FIFO, multipart Groq contract, retry/pause policy.
- `src/transcriptStitcher.ts`: pure normalized word-overlap merging.
- `src/transcriptDocument.ts`: stitched text, restoration/edits and shared timestamp-keyed UI/JSON contributions.
- `src/deviceServices.ts`: typed native bridge, connectivity monitoring, credential import and local transcription routing.
- `android/app/src/main/java/app/personaldictation/mobile/DictationDevicePlugin.java`: validated connectivity, model download/verification and off-thread inference.
- `android/app/src/main/java/app/personaldictation/mobile/NotesRepository.java` / `NotesSyncWorker.java`: private JGit commits, Keystore tokens, non-force sync and durable background retry.
- `android/app/src/main/cpp/`: whisper.cpp CMake integration and JNI mono PCM inference.
- `src/transcriptView.ts`: safe timestamped rows rendered from the document's JSON snapshot.
- `src/activityLog.ts`: structured UTC events, bounded UI trail and optional best-effort monitoring delivery.
- `src/main.ts` / `src/style.css`: responsive UI, Start/Pause/Continue/Stop and volatile transcript/key integration.
- `src/exportTranscript.ts`: shared JSON serialization, browser JSON download/file-or-text sharing, native JSON document Save and cached JSON file sharing.
- `android/app/src/main/java/app/personaldictation/mobile/DocumentSavePlugin.java`: UTF-8 document writing through Android's system document picker; cancellation leaves the transcript intact.
- `public/icon.svg`: shared purple wave brand mark used in the UI and as the source for PWA and Android launcher icons. Run `node scripts/generate-icons.mjs` (requires ImageMagick `convert`) after changing it, then `npm run android:sync`.
- `capacitor.config.ts` / `android/`: packaged Android shell, permissions, icons and Gradle build.
- `.github/workflows/android.yml`: tests and downloadable debug APK build.
- `public/sw.js` / `public/manifest.webmanifest`: offline shell/installability; Vite versions the worker per build.

See [OpenWiki quickstart](openwiki/quickstart.md) for architecture, operational boundaries and test routing. Generated pages may lag source changes: the last recorded local run completed on 2026-11-14 before these device-service changes. After committing source changes, refresh through the documented `.github/workflows/openwiki-update.yml` workflow (`openwiki code --update --print`, with configured provider secrets), or the resumable OpenWiki update lifecycle; do not hand-edit generated pages. The workflow is scheduled/manual, not a source-change push hook, so automatic freshness is not assumed.
