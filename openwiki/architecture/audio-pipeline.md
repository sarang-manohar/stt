---
type: architecture
title: PCM capture, overlapping windows and WAV encoding
description: Streaming microphone capture, fractional resampling, fixed PCM ring-buffer slicing, WAV timestamps and recording resource lifecycle.
tags: [audio, pcm, ring-buffer, lifecycle]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-14T06:09:50.195Z
sources:
  - id: openwiki-source-132960314e98df902a72d3ac
    resource: repo://public/audio-worklet.js
  - id: openwiki-source-39e8953178731ccf46779852
    resource: repo://src/audioRecorder.test.ts
  - id: openwiki-source-74cf81c983d6b2527038d4e7
    resource: repo://src/audioRecorder.ts
  - id: openwiki-source-a088bc52797cc80256ca443a
    resource: repo://src/wavEncoder.test.ts
  - id: openwiki-source-6564065af0d8b93181379b44
    resource: repo://src/wavEncoder.ts
generated: { by: "pi", at: "2026-11-14T06:09:50.195Z" }
---

# PCM capture, overlapping windows and WAV encoding

## Ownership and data flow

`src/audioRecorder.ts` separates three responsibilities: `AudioRecorder` owns browser resources; `PcmResampler` converts streaming floats into 16 kHz signed 16-bit samples; `SlidingWindowSlicer` owns window boundaries and emits timestamped `AudioChunk` objects. These pure processing classes can run under Node tests without microphone globals. The recorder accepts an emission callback instead of importing or controlling the queue.

The runtime path is microphone → `MediaStreamAudioSourceNode` → `public/audio-worklet.js` → transferred mono `Float32Array` blocks → resampler → PCM ring → `encodeWav` → callback → [transcription queue](transcription.md). The worklet averages available channels, never performs network I/O, and transfers its output buffers. If worklet loading/construction fails or the capability is absent, a 4,096-frame, one-input-channel `ScriptProcessorNode` feeds the same resampler. A zero-gain destination connection keeps processing active without audible microphone monitoring.

## Resampling and PCM

The recorder uses the actual `AudioContext.sampleRate`, not a requested hardware rate. The streaming area-average resampler tracks a weighted sum and fractional input-sample coverage per output bin; both survive arbitrary block boundaries. Complete bins are clamped to [-1, 1] and quantized to signed PCM, with negative full scale -32768 and positive full scale 32767. At stop, a fractional, incomplete output sample is not separately padded; this is less than one 16 kHz sample.

This is a simple area-average downsampler, not a high-order studio-quality resampling filter. Tests establish exact one-second output sample counts at 44.1 kHz, 48 kHz and 16 kHz, plus signed/clipped PCM behavior.

## Sliding window invariants

The ring holds exactly 160,000 `Int16` samples (320 KB), independent of recording length. Each full window emits an independent WAV Blob and advances the ring head by 128,000 samples, retaining 32,000 samples:

| Window | Start | End | Next start |
| --- | --- | --- | --- |
| 1 | 0 s | 10 s | 8 s |
| 2 | 8 s | 18 s | 16 s |
| 3 | 16 s | 26 s | 24 s |

`startSample` advances with the stride; `total` counts received samples; `emittedEnd` tracks the end already uploaded. Stop flushes if the remaining ring has at least 8,000 samples **and** some audio is newer than `emittedEnd`. Thus a standalone sub-half-second recording emits nothing, an exactly ten-second recording emits one window rather than a duplicate two-second overlap, and a ten-second-plus-one-sample recording emits a final overlap-plus-one-sample window. The threshold applies to the whole residual window, not only its fresh suffix. Flush clears the ring length and is idempotent; instantiate a new slicer for each recording.

## WAV and chronological filenames

`src/wavEncoder.ts` writes a canonical 44-byte little-endian RIFF/WAVE PCM header, format 1, one channel, 16,000 Hz, 32,000 bytes/sec, two-byte block alignment and 16 bits/sample. Every sample is explicitly written little-endian. A full window is 320,044 bytes including its header; the returned Blob is `audio/wav`.

A chunk timestamp is recording start time plus `startSample / 16000` seconds, not upload/encoding time. `recordingFilename` formats that timestamp in local calendar time as `rec_YYYYMMDD_HHMMSS_mmm.wav`. FIFO insertion order, not lexicographic filename sorting or the wall clock, governs processing.

## Start, stop and wake lock

Start acquires the microphone with mono/echo-cancellation/noise-suppression/automatic-gain constraints, resumes the context, connects processing, marks the recorder active and requests a screen wake lock. Failure during startup invokes cleanup before propagating the error to the UI.

Stop disconnects the source, asks the worklet to stop and waits for its ordered `stopped` acknowledgement (bounded by 200 ms). Float messages already posted are consumed before that acknowledgement. The port is then closed, processors disconnected, microphone tracks stopped and the remaining window flushed. The context is closed and wake lock released. The fallback removes its audio callback before disconnecting. There is no wait for queued transcription responses.

Wake-lock rejection/absence does not prevent recording. On return to a visible document, the recorder reacquires a released lock and attempts to resume its audio context. A microphone track's `ended` event notifies the UI, which stops capture but retains queued audio. These are best-effort lifecycle protections: background throttling, Android process termination and phone interruptions are not solved by a screen lock.

## Verification and extension seams

`src/audioRecorder.test.ts` checks sample-perfect overlapped content across arbitrary block sizes, exact timestamps, half-second thresholds, overlap-only suppression and idempotent flush. `src/wavEncoder.test.ts` checks byte-level headers and PCM payloads, empty/full sizes and padded filenames. The production [browser smoke test](../operations/development-and-pwa.md#verification) exercises synthetic-mic worklet and forced fallback capture through mocked HTTP uploads.

Keep the resampler and slicer browser-independent. Change window constants and their sample-level tests together; update [stitching assumptions](transcription.md) if overlap duration changes. Any new capture path should emit the same `AudioChunk` boundary rather than couple network work to the real-time processor.

See also: [task routing](../quickstart.md), [configuration and device limits](../operations/development-and-pwa.md).
