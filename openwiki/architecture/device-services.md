---
type: architecture
title: Android connectivity, offline Whisper and GitHub notes sync
description: Native ownership of validated connectivity, prepared multilingual Whisper inference, app-private Git notes, encrypted GitHub credentials and background retry.
tags: [android, whisper, offline, github, git, connectivity, persistence, security]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-14T14:28:39.707Z
sources:
  - id: openwiki-source-ea70eb6c045047448e446296
    resource: repo://.gitignore
  - id: openwiki-source-74fb5fcc3ade143ba4a2d79e
    resource: repo://android/app/src/main/cpp/whisper-jni.cpp
  - id: openwiki-source-5c6d9138ae22132acb05abf5
    resource: repo://android/app/src/main/java/app/personaldictation/mobile/DictationDevicePlugin.java
  - id: openwiki-source-59736589ac27b80e65411517
    resource: repo://android/app/src/main/java/app/personaldictation/mobile/NotesRepository.java
  - id: openwiki-source-3585f8ebac2e4c3085d37d5a
    resource: repo://android/app/src/main/java/app/personaldictation/mobile/NotesSyncWorker.java
  - id: openwiki-source-f1222f203d3749ae50cc7065
    resource: repo://src/deviceServices.ts
  - id: openwiki-source-d4189bbeecb62806cb297b5a
    resource: repo://src/main.ts
generated: { by: "pi", at: "2026-11-14T14:28:39.707Z" }
---

# Android connectivity, offline Whisper and GitHub notes sync

## Service ownership

`src/deviceServices.ts` defines the typed Capacitor `DictationDevice` bridge. `MainActivity` registers `DictationDevicePlugin` before bridge creation. The plugin owns a single-thread I/O executor for notes, Git configuration, explicit sync and model downloads, and a separate single-thread inference executor. Background Git work is owned by WorkManager's `NotesSyncWorker`; `NotesRepository.LOCK` serializes its mutations with foreground work. Neither executor captures microphone audio: the [existing recorder](audio-pipeline.md) still emits canonical 16 kHz mono PCM WAV chunks.

`main.ts` waits for saved-note/network initialization before enabling recording. It connects the bridge to [FIFO transcription](transcription.md), local persistence, settings and the top-right Sync control. Browser builds hide native settings/Sync and persist notes in localStorage instead.

## Validated connectivity and engine routing

Android connectivity requires both `NET_CAPABILITY_INTERNET` and `NET_CAPABILITY_VALIDATED` on the active network. The plugin registers a default-network callback on API 24+, with a network-request callback fallback on API 23, and publishes `networkChanged` events. The bridge registers the listener before querying initial status. Wi-Fi association alone is insufficient; captive portals or unvalidated networks show Offline Mode. Browser status uses `navigator.onLine`, which is a hint rather than proof of reachable internet.

The queue checks connectivity per head and before each cloud request. Offline heads use `offlineTranscribe`, which base64-encodes the WAV and maps Hinglish to `hi`. A failed cloud upload that coincides with lost connectivity falls back locally on the same head before merging. Local results use model identifier `whisper-tiny-local`, preserving the shared stitching, timestamp and export path. A missing/inoperable model pauses and retains captured audio; installing the model resumes the queue. Connectivity changes also resume paused work. No offline Groq key is required.

## Model preparation and JNI inference

The Settings download is required once while online: the APK contains native code, not weights. The plugin streams multilingual `ggml-tiny-q5_1.bin` from Hugging Face into a temporary private file, limits it to 32,152,673 bytes, verifies pinned SHA-256 `818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7`, syncs the file and renames it into place. Failed downloads remove the temporary file without replacing an existing model. Startup readiness checks the installed file's expected size; full hashing occurs at download, not every startup.

`whisper-jni.cpp` validates the canonical WAV layout, mono PCM16 and 16 kHz rate, converts little-endian samples to floats and lazily caches a CPU-only Whisper context under a mutex. It uses greedy decoding, up to four CPU threads, no translation and no prior native context, returning combined segment text and detected language as UTF-8 JSON. Native inference runs away from the UI and recording threads; inference errors keep the FIFO head. The context is retained for the native library lifetime and freed on unload.

Offline removes network round trips, not chunking/computation latency. Full windows are ten seconds long with an eight-second stride. Tiny multilingual accuracy and sustained processing speed depend on the device, especially for Hindi/Hinglish. APK builds include ARM64 and x86-64, not 32-bit ARM. See [build/setup operations](../operations/development-and-pwa.md#packaged-android-app).

## Private notes and Git synchronization

`NotesRepository` creates `filesDir/notes-repository` on branch `main` and sets a local Dictation author identity. This is independent of the source checkout. Each device has a persisted UUID and owns `notes/<uuid>.json`; other devices' files can merge into the repository but are not displayed in this device's UI. Snapshot saves sync a temporary file, replace the device file, stage notes and commit only changed content. Pending intent is persisted before commit; startup can recover a dirty device snapshot by saving/committing it again. The JavaScript save chain preserves snapshot ordering and surfaces local-save failure rather than silently claiming success.

Configuration accepts an existing `owner/repository` on github.com and a PAT. Remote creation and OAuth are not implemented. The settings import supports a `GITHUB_PERSONAL_ACCESS_TOKEN` field, credential-protocol password/token fields, a Git credential URL or a recognized raw token. `.git_credentials` is ignored and never read by the build. Imported plaintext files remain the user's responsibility to delete.

The remote URL contains no token. Tokens are AES-GCM encrypted using an Android Keystore key before storage in private preferences, and the app disables Android backup. Reconfiguration can update credentials for the same destination but blocks switching destinations, reducing accidental publication of existing note history. Groq keys remain WebView localStorage and are not given the same Keystore protection.

Every changed snapshot marks sync pending and schedules unique network-constrained WorkManager work. The Ready-state top-right control invokes an immediate sync online or queues it offline; Android battery policy may delay background work. Explicit and background synchronization share the repository lock. Sync requires validated internet, fetches `origin/main`, merges if present and pushes `main` without force. Pending clears only after accepted/up-to-date updates. Transport failures are sanitized, and rejected pushes/conflicts retain pending local notes. Background failures use exponential WorkManager retries; foreground errors are displayed by the UI. The header polls pending/configured status every five seconds.

A dedicated private remote with default branch `main` is recommended; an empty remote is supported. Device-specific filenames avoid usual multi-device conflicts but exceptional same-file edits can still conflict. There is no in-app conflict resolver. Export local notes before clearing/reinstalling to recover from a conflict. Clearing displayed notes commits an empty snapshot, **not** removal of Git history or GitHub copies. Uninstall/clear storage removes local notes, model, credentials and Keystore access.

## Tests and operational boundaries

`src/offlineTranscription.test.ts` verifies keyless/no-cloud offline FIFO processing, same-head upload-loss fallback, missing-model recovery and later cloud routing after reconnect. `src/deviceServices.test.ts` checks credential formats/rejection, browser listener cleanup and document restoration/edit consistency. `NotesRepositoryTest` is an Android instrumentation test for actual local commits, restoration, pending state and absence of plaintext tokens in preferences/Git config; run it with `connectedDebugAndroidTest` on a test device.

The full debug APK compiles both native ABIs, but compilation and mocked tests do not certify real device inference, hardware throughput, GitHub authentication/pushes or Android background scheduling. Audio and the transcription FIFO remain volatile; keep capture foregrounded and let it drain. Successfully saved notes and pending Git commits survive restarts. See the [README device checklist](../../README.md#device-verification-checklist) and [quickstart](../quickstart.md).
