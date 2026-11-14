---
type: quickstart
title: Dictation architecture and task routing
description: Maintainer routing for Android packaging and web PWA dictation, automatic model selection, Unicode-safe stitching and synchronized transcript rows/JSON export.
tags: [quickstart, architecture, dictation, pwa, android]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-14T14:28:39.707Z
sources:
  - id: openwiki-source-4e3e538728489e7a1208c697
    resource: repo://.github/workflows/android.yml
  - id: openwiki-source-f8d10828394c4129061d5b0e
    resource: repo://index.html
  - id: openwiki-source-5b54a58d1b51cd490b0e7162
    resource: repo://package.json
  - id: openwiki-source-23775c3de52f3ab95a13cb8b
    resource: repo://README.md
  - id: openwiki-source-e39b94d6b8f037adcd800def
    resource: repo://scripts/browser-smoke.mjs
  - id: openwiki-source-74cf81c983d6b2527038d4e7
    resource: repo://src/audioRecorder.ts
  - id: openwiki-source-f1222f203d3749ae50cc7065
    resource: repo://src/deviceServices.ts
  - id: openwiki-source-cbd23dfa564a2006b104cc06
    resource: repo://src/exportTranscript.ts
  - id: openwiki-source-d4189bbeecb62806cb297b5a
    resource: repo://src/main.ts
  - id: openwiki-source-424a43a6b36c005c87f578f7
    resource: repo://src/transcriptDocument.ts
  - id: openwiki-source-8e45770d544d1a21123e3f24
    resource: repo://src/transcriptionQueue.test.ts
  - id: openwiki-source-4a2934b32d2a1b966716c653
    resource: repo://src/transcriptionQueue.ts
  - id: openwiki-source-8f984b8561327b69df85a229
    resource: repo://src/transcriptView.ts
generated: { by: "pi", at: "2026-11-14T14:28:39.707Z" }
---

# Dictation architecture and task routing

## What this repository builds

Dictation is a minimalist, mobile-first TypeScript PWA and Capacitor Android app for personal speech-to-text through Groq's `whisper-large-v3-turbo` or `whisper-large-v3`. Auto model is the default, routing English to turbo and Hindi/Hinglish to v3. It supports Hindi, English, Hinglish/code-switched speech and Auto-detect. It supports Chrome Android PWA installation and a separately packaged APK, as well as desktop browsers. Pixel 8a and HMD Fusion are target phones, not device-certification results. There is no app backend or runtime UI framework. `PRD.md` records the original requirements; implementation-specific operational details live in `README.md` and this wiki.

The original directory contained only `PRD.md` and a local environment file; no previous wiki or source architecture existed. This wiki documents the implemented Vite application, not a pre-existing framework migration. No real API key values belong in this documentation.

## Run and verify

Use Node 22.12+ and npm:

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

The existing `.env.local` is preserved. `VITE_GROQ_API_KEY` is preferred; legacy `GROQ_API_KEY` is also supported through a narrowly scoped Vite definition. With no environment key, tap Start to supply a local fallback. Android builds always exclude environment keys and require per-app user input for cloud transcription; prepared offline Whisper needs no Groq key. Browser-only keys are visible to the client and are not server secrets. For deployment, use HTTPS at the origin root; a phone's plain HTTP LAN connection to a development machine is not a trusted microphone context.

`npm test` covers audio, WAV, queues, documents, activity logging, native/browser exports and Android key-exclusion cases, including Hindi/Hinglish overlaps, NFC/matra preservation, model detection/refinement, language multipart fields and timestamp-keyed JSON contributions. `npm run test:browser` requires installed Chrome (`CHROME_PATH` override) and checks the production app with a fake microphone and mocked Groq uploads, including a forced fallback capture path, offline shell, persisted language/model selectors, prompt isolation after language changes, Auto English/Hindi model routing, timestamped UI/JSON parity, empty rows, safe Hindi/HTML-like text rendering and 320px layout. The unified JSON export update passed 76 unit tests, strict web/Android builds including a debug APK, and both browser smoke capture paths. The smoke suite also covers gear-dialog visibility/dismissal/focus restoration, busy locks, JSON Copy/Share parity, removal of Save and the JSON button and Share download fallback. Landing checks cover portrait/narrow/landscape workspace sizing, top-right settings, and default-collapsed Activity Trail with heading/inside/outside taps and Escape dismissal. These checks do not certify physical Android hardware, real Groq interoperability or transcription quality. See [development, security and PWA operations](operations/development-and-pwa.md) for full commands and device checks.

For a debug APK, install JDK 21 plus Android SDK Platform 35/Build Tools 35.0.0, NDK 27.2.12479018 and CMake 3.22.1, set `ANDROID_HOME`, and run `npm run android:apk`. Install `android/app/build/outputs/apk/debug/app-debug.apk` with `adb install -r`, or transfer/open it on the phone. `npm run android:open` syncs assets and opens Android Studio; `android:bundle` produces an unsigned release AAB needing release signing. The Android APK GitHub workflow publishes a downloadable debug artifact. See [packaged Android operations](operations/development-and-pwa.md#packaged-android-app) for permissions, signing, key/cache security and device checks.

## Runtime map

```text
index.html → src/main.ts + src/style.css
                 │
                 ├─ AudioRecorder: microphone / worklet / wake lock
                 │    └─ PcmResampler → SlidingWindowSlicer → WAV AudioChunk
                 │                                              │
                 ├─ TranscriptionQueue ←──────────────────────────┘
                 │    └─ cloud Groq or native offline Whisper + retry/pause
                 │          └─ TranscriptDocument (stitchTranscript)
                 │                ├─ shared entries → timestamped UI / JSON Copy / Share
                 │                └─ plain text → prompt
                 ├─ serializeTranscript → shared JSON serialization
                 ├─ shareTranscript → native JSON cache + chooser / Web Share / download
                 └─ browser production service worker → offline app shell only

capacitor.config.ts → android/ → bundled dist-android/ at https://localhost
```

`src/main.ts` owns recording/transition flags, key resolution and DOM controls, and reads text directly from a saved/restored `TranscriptDocument` for prompt context. The document owns stitched text and deduplicated chunk contributions shared by UI and JSON export. `src/transcriptView.ts` renders keyed timestamp rows from `toJSON()` snapshots, reusing existing DOM rows and assigning literal text via `textContent`. Capture emits independent chunks via a callback; the queue does not own microphone resources. The queue reads committed text for context and invokes a synchronous merge before advancing. The pure stitcher compares boundary tokens without normalizing the displayed output.

The compact landing UI has a status bar with Online/Offline Mode, a gear button opening Transcription settings and a rightmost Android Ready-state Sync control, a viewport-filling scrollable timestamped transcript list with Copy/Share/Clear, and Start/Pause/Continue/Stop controls. Marketing taglines and duplicate recording copy are removed; audio/transcript handling information is in Settings. Activity Trail starts collapsed, toggles on heading taps, stays open on inside taps, and collapses on outside pointer taps or Escape. Events continue accumulating while collapsed. The dialog contains labeled language/model selects; Done or Escape dismisses it and restores focus. Language choices are Auto (omit the request's `language` field), Hindi (हिन्दी), English and Hinglish; Hindi/Hinglish send `hi`, English sends `en`. The model defaults to Auto: English uses turbo, Hindi/Hinglish uses v3, and explicit model choices override routing. With Auto language, Groq `verbose_json` metadata drives model selection; a detected model change retranscribes the same head before committing once, adding API cost/latency. A hint inside the gear dialog shows the detected language and model used. Preferences are validated and persisted in localStorage. Both selects are disabled during recording, capture transitions or queued work. Error recovery controls and a fallback-key dialog appear only when relevant. Clear is disabled while capture is active/transitioning or the queue is nonempty, preserving sequence and prompt consistency. Text is assigned with `textContent`, never interpreted as HTML. The transcript uses `lang=hi` for Hindi/Hinglish, `en` for English or the detected language in Auto (`und` until known), plus a Devanagari-capable font stack.

Copy and Share export timestamp-keyed JSON including empty entries; there is no separate Save or JSON button. The retained internal save utility still supports browser download and Android's document picker but is no longer wired to a UI control. Native Share opens the chooser with a cached JSON file; browser Share uses a JSON file if supported, otherwise JSON text, or a download without Web Share. Cancellation/failure keeps the transcript intact without fallback downloads. Share requires an idle recorder/queue/export state and entries; Copy works on any committed snapshot. The header, PWA and Android launcher use the same purple wave source, `public/icon.svg`; regenerate with `node scripts/generate-icons.mjs` (ImageMagick `convert` required), then sync Android.

JSON exports (browser download or Android share sheet) a UTF-8 object such as `{"00:00":"First text","00:08":"Next text","00:16":"More text"}` after the queue drains. Keys use captured chunk starts relative to the first audio window, not response time; values omit already-stitched overlap. The UI displays exactly the same timestamp/value pairs, with empty silence/duplicate entries shown as timestamped “No new text” hints (their JSON values remain empty). Copy serializes those same timestamp keys and values as JSON. Separate recordings retain elapsed pauses; same-second contributions join. These are chunk markers, not word-accurate subtitles or video-file import. Clear resets text, JSON and timeline.

## Task routing

| If you are changing… | Read first | Primary code / tests |
| --- | --- | --- |
| Android connectivity, offline model preparation or JNI inference | [Device services](architecture/device-services.md) | `src/deviceServices.ts`, `DictationDevicePlugin.java`, `whisper-jni.cpp`, `src/offlineTranscription.test.ts` |
| Local note persistence, GitHub credentials or pending sync | [Private Git notes](architecture/device-services.md#private-notes-and-git-synchronization) | `NotesRepository.java`, `NotesSyncWorker.java`, `src/main.ts`, `NotesRepositoryTest.java` |
| Microphone, resampling, windows, overlap or stop | [Audio pipeline](architecture/audio-pipeline.md) | `src/audioRecorder.ts`, `public/audio-worklet.js`, `src/audioRecorder.test.ts` |
| WAV bytes or recording timestamps | [WAV and chronological filenames](architecture/audio-pipeline.md#wav-and-chronological-filenames) | `src/wavEncoder.ts`, `src/wavEncoder.test.ts` |
| Upload ordering, retries, auth or context prompt | [Sequential transcription](architecture/transcription.md) | `src/transcriptionQueue.ts`, `src/transcriptionQueue.test.ts` |
| Language, Hinglish mapping, Whisper model or prompt context | [Multilingual request contract](architecture/transcription.md#groq-request-contract) | `src/transcriptionQueue.ts`, `src/main.ts`, `src/transcriptionQueue.test.ts` |
| Automatic English/Hindi model selection or refinement | [Audio language detection](architecture/transcription.md#audio-language-detection-and-automatic-models) | `src/transcriptionQueue.ts`, `src/transcriptionQueue.test.ts` |
| Timestamp-keyed JSON download or transcript ownership | [JSON export](architecture/transcription.md#timestamp-keyed-json-download) | `src/transcriptDocument.ts`, `src/transcriptDocument.test.ts`, `src/main.ts` |
| Timestamped rows, empty hints or UI/JSON consistency | [UI integration](architecture/transcription.md#ui-integration-and-persistence) | `src/transcriptView.ts`, `src/main.ts`, `scripts/browser-smoke.mjs` |
| Missing Hindi punctuation or future restoration | [Punctuation boundaries](architecture/transcription.md#hindi-punctuation-boundaries) | `src/transcriptionQueue.ts`, `src/transcriptStitcher.ts`, `README.md` |
| Duplicated words, Hindi matras or boundary punctuation | [Deterministic stitching](architecture/transcription.md#deterministic-word-boundary-stitching) | `src/transcriptStitcher.ts`, `src/transcriptStitcher.test.ts` |
| Android APK/AAB, permissions, JSON sharing, launcher icons or signing | [Packaged Android](operations/development-and-pwa.md#packaged-android-app) | `capacitor.config.ts`, `android/`, `src/exportTranscript.ts`, `.github/workflows/android.yml` |
| Key handling, installability, offline behavior or release verification | [Operations and PWA](operations/development-and-pwa.md) | `vite.config.ts`, `public/sw.js`, manifest, `scripts/browser-smoke.mjs` |
| Landing layout, settings placement, Activity Trail, status or transcript presentation | [UI integration](architecture/transcription.md#ui-integration-and-persistence) | `src/main.ts`, `index.html`, `src/style.css` |

## Invariants to preserve

- Mono signed 16-bit PCM at 16 kHz; full 160,000-sample windows advance by 128,000 samples (10 seconds, 8-second stride, 2-second overlap).
- Stop flushes at least 8,000 residual samples when fresh data exists; overlap-only data is not uploaded twice.
- A single queue worker retains the head across retries and does not start the next chunk's request until the prior text is merged, including any model-refinement upload.
- Prompt context is up to the trailing 200 characters of committed current-language-session text, omitted when empty. Changing language keeps displayed text but resets context; there is no English-only seed prompt.
- Suffix-boundary deduplication searches at most 15 normalized words; an exact-restart fallback checks the last 32 committed tokens for a 5–15-word incoming prefix ending up to 16 tokens before the tail, with three distinct content anchors and conservative negation/lookahead guards. Comparison uses NFC and preserves Unicode letters, numbers and combining marks, including Hindi matras/nukta. Hindi and English stopwords prevent common-word-only clipping. Surviving original punctuation and text remain unchanged.
- UI rows and JSON export share the document's timestamp/value entries; rendering must not invent text or punctuation independently. Hindi punctuation returned by Groq is preserved, but no punctuation-restoration pass or forced chunk-ending danda is enabled.
- Audio and the transcription FIFO are memory-only; merged/edited/Cleared notes are serialized into browser localStorage or Android private Git commits and restored on startup. Chunk-start timestamps, not response completion, determine new JSON keys. Fallback Groq keys and preferences remain localStorage; GitHub PATs are explicitly imported and encrypted with Android Keystore. Clearing notes does not erase committed Git history. Explicit native JSON export writes a private cache file that can remain until cleared. Browser workers cache the shell, not API audio/results, and browser shell JavaScript can contain an environment key. Android uses bundled assets, excludes environment keys and skips service-worker registration.

Keep the app/tab open until queued work finishes. Wake lock, visibility recovery and unload warnings are best-effort; none prevent OS process termination or guarantee background recording. Unavailable/slow transcription grows queued Blob memory. Browser offline installation supplies only an app shell; Android additionally supports prepared local Whisper and durable network-constrained Git retries.

## Android offline and sync setup

Open Settings while online and download the verified 32 MB multilingual tiny q5_1 model before going offline. The native plugin monitors validated active-network capabilities, not Wi-Fi association alone. Offline heads and connection-loss upload recovery use the same FIFO/merge path without cloud audio requests or a Groq key. Inference has device-dependent computation latency and retains the existing ten-second windows; it is not zero-latency or certified real-time on every phone.

Create a dedicated private GitHub repository on `main`, grant a repository-scoped PAT Contents read/write, then import `.git_credentials` and enter `owner/repository` in Settings. The build never consumes developer credentials. Every changed native snapshot commits `notes/<device-uuid>.json` locally and schedules background retry; Sync is available at the header right edge when Ready. Fetch/merge/non-force-push preserves rejected/conflicting commits for recovery, and pending state survives restarts. Other devices' files are not displayed and no in-app merge resolver exists. See [native ownership and limitations](architecture/device-services.md).

The implementation passes 93 app unit tests, both browser smoke paths and full ARM64/x86-64 debug APK compilation. Instrumentation sources compile but no connected device was available; actual local inference, GitHub auth/push and background connectivity behavior remain device-verification gaps.

When modifying these contracts, update relevant tests, README operational guidance and the corresponding wiki pages/Claims together. Generated indexes, provenance and Claim metadata are owned by the OpenWiki lifecycle rather than edited by hand.
