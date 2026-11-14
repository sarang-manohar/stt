---
type: architecture
title: Cloud and offline transcription with shared notes
description: FIFO cloud/local engine routing, multilingual model selection, deterministic stitching and durable timestamp-keyed notes shared by edits and exports.
tags: [transcription, multilingual, hindi, fifo, groq, retries, deduplication]
verified:
  - by: openwiki/0.9.0
    at: 2026-11-14T14:28:39.707Z
sources:
  - id: openwiki-source-f8d10828394c4129061d5b0e
    resource: repo://index.html
  - id: openwiki-source-e39b94d6b8f037adcd800def
    resource: repo://scripts/browser-smoke.mjs
  - id: openwiki-source-cbd23dfa564a2006b104cc06
    resource: repo://src/exportTranscript.ts
  - id: openwiki-source-d4189bbeecb62806cb297b5a
    resource: repo://src/main.ts
  - id: openwiki-source-620601c75b1ead77042cc260
    resource: repo://src/offlineTranscription.test.ts
  - id: openwiki-source-554339f52225d7d8edff3ed0
    resource: repo://src/style.css
  - id: openwiki-source-dafbd1ed90d696a72b70577b
    resource: repo://src/transcriptDocument.test.ts
  - id: openwiki-source-8e45770d544d1a21123e3f24
    resource: repo://src/transcriptionQueue.test.ts
  - id: openwiki-source-4a2934b32d2a1b966716c653
    resource: repo://src/transcriptionQueue.ts
  - id: openwiki-source-7ebd245d082e2a4623de3eb2
    resource: repo://src/transcriptStitcher.test.ts
  - id: openwiki-source-2d206ceea1115ec00157d91c
    resource: repo://src/transcriptStitcher.ts
generated: { by: "pi", at: "2026-11-14T14:28:39.707Z" }
---

# Cloud and offline transcription with shared notes

## Queue ownership and commit order

`TranscriptionQueue` in `src/transcriptionQueue.ts` accepts timestamped WAV chunks from the [audio pipeline](audio-pipeline.md), but does not capture audio or own transcript storage. Its injected `getKey`, `getTranscript` and synchronous `merge(text, chunk, result)` callbacks connect it to `src/main.ts`. Merge receives the original audio timestamp and the resolved language/model as well as text. Optional fetch, sleep, random and timeout injections enable deterministic tests without Groq traffic.

The queue is an insertion-order array protected by a `running` flag. Enqueue appends and starts the worker only if it is neither running nor paused. A worker always requests `items[0]`, calls `merge` after success, then shifts that same head and proceeds. The next upload therefore cannot start before the preceding merge completes; its prompt observes the committed transcript. No timestamp sorting or parallel uploads occur. Repeated `resume()` calls cannot create a second active worker.

`QueueState.size` includes the in-flight or paused head, not just waiting items. Published phases are `idle`, `processing`, `retrying` and `paused`, with a retry deadline or error as applicable. The UI refreshes its countdown every 250 ms. Recording can continue while prior chunks process, retry or remain paused, so slow/unavailable inference can grow the in-memory audio queue without bound. Audio has no durable recovery; saved note snapshots do. Android routes offline heads to local Whisper, while browser outages still require cloud recovery.

## Offline engine routing

The queue injects `isOnline` and `transcribeOffline` alongside its cloud callbacks. Offline heads use native Whisper without a Groq key; connectivity is checked per head and before cloud requests. A cloud-upload failure after connection loss falls back on the same head before merging. Local errors pause and preserve audio for recovery rather than retrying an unavailable model forever. The native model, validated network monitor and Git note storage are described in [Android device services](device-services.md). Installing the model or changing connectivity can resume a paused queue; reconnecting routes subsequent heads back to cloud. Both engines feed the same synchronous document merge and stitching path.

## Groq request contract

Each attempt creates fresh `FormData` and an `AbortController`:

- POST `https://api.groq.com/openai/v1/audio/transcriptions`.
- `Authorization: Bearer <key>` from the current key callback; never place it in a query string.
- `file`: WAV Blob with its chronological recording filename.
- `model`: chosen by `getModel`, whose default is `auto`: English uses `whisper-large-v3-turbo`, Hindi/Hinglish uses `whisper-large-v3`. Explicit model selections override routing. Before language is known, Auto uses turbo.
- `language`: the ISO-639-1 code from optional `getLanguage`; `hi` for both Hindi and `hinglish`, `en` for English. `auto` (the default) omits this field entirely, allowing Groq to detect the language. Other explicit codes can be supplied by queue callers.
- `response_format`: `verbose_json`, to obtain Groq's audio-language metadata as well as text.
- `temperature`: string `0`.
- `prompt`: up to the trailing 200 JavaScript characters returned by `getTranscript`, omitted when empty. There is no static English-only seed. The UI supplies only committed text from the current language session; changing language resets its context offset without clearing displayed text. Clear resets both transcript and context. Hindi and Hinglish therefore start without prior English conditioning.

The default request deadline is 30 seconds; its timer remains active through JSON body decoding and is always cleared afterward. Success requires an object with a string `text` property. Empty text is valid and consumes the audio chunk without adding transcript text.

## Audio language detection and automatic models

With Auto language, `language` stays omitted on every request so later chunks can detect a language switch. Responses normalize `english`/`en` to `en` and `hindi`/`hi` to `hi`; no browser-locale or transcript-script guess is used. Missing/unsupported metadata remains unknown. Only nonempty recognized-language responses update the queue's detection hint.

With Auto model, the first chunk uses turbo. If detected Hindi requires v3, the **same FIFO head** is uploaded again with v3 before a single merge occurs. Later chunks start with the previous detected-language model; English detected after Hindi similarly triggers a turbo refinement. There is at most one refinement per `transcribe` attempt, not an unbounded model-flipping loop. Silence does not trigger refinement. Explicit Hindi/Hinglish with Auto model selects v3 immediately; explicit English selects turbo. Manual models never trigger a model-routing upload, even if metadata differs.

Refinement incurs an additional API upload, cost and latency when the preferred model changes. If refinement fails, neither probe text nor a JSON entry is committed; existing retry/pause semantics retain the same head. The hint is already updated, so a retry can start directly with the preferred model. `resetDetection()` clears the hint only with an empty queue; the UI calls it when starting a drained capture session or changing language. Detection quality depends on Groq and is not guaranteed for short/silent or code-switched clips.

## Retry and pause behavior

Cloud network exceptions, abort/timeouts, HTTP 408, 429 and 5xx keep the current head in place and retry indefinitely when not handled by offline fallback. Base waits are 1, 2, 4, 8, 10, 10… seconds, with uniform ±200 ms jitter added after capping the base. The chunk and all later chunks remain blocked during the wait. Attempts reset after a successful merge; there is no `Retry-After` header handling. Offline Android work instead uses the injected native engine.

HTTP 401 pauses with an explicit rejected-key message. Missing keys and other nonretryable HTTP statuses also pause without removing the head. Schema-invalid JSON objects and JSON parse exceptions pause rather than retrying indefinitely. A synchronous merge exception pauses before removing the chunk. Fix the issue and call `resume()` through Retry queue or save a fallback key to resume. For an environment-provided key, key settings are hidden: configuration changes need a restart/rebuild, which cannot preserve this volatile queue. See [key handling and security](../operations/development-and-pwa.md#key-configuration-and-security).

## Deterministic word boundary stitching

`src/transcriptStitcher.ts` exports the pure `stitchTranscript(existing, incoming)` function. It trims both arguments and handles empty/whitespace input directly. Otherwise its suffix-boundary paths compare the last 15 whitespace-delimited tokens of existing text against the first 15 of incoming text. An additional exact-restart path searches within the last 32 committed tokens.

Comparison tokens undergo Unicode NFC normalization and lowercasing, then leading/trailing characters outside Unicode letters (`\p{L}`), numbers (`\p{N}`) and combining marks (`\p{M}`) are stripped with the `gu` flags. Internal punctuation remains significant. Marks must be preserved: omitting `\p{M}` removes final Devanagari matras/nukta and can make distinct Hindi words compare equal. Danda (`।`) is punctuation and can be ignored at token edges. NFC makes canonically equivalent spellings comparable, including Devanagari nukta sequences. Original tokens are retained for output, not rewritten to normalized forms. For overlap length `k`, searched largest to smallest:

1. Compare the existing suffix of length `k` to the incoming prefix of length `k` at the same positions.
2. Accept an exact match, or for `k >= 3` accept at least `k - 1` matching token positions.
3. Require at least one matched nonempty token outside a small built-in English/Hindi stopword set (Hindi: `है`, `हैं`, `का`, `की`, `के`, `में`, `को`, `से`, `और`). This prevents short common-word-only boundaries such as `on` or `and the` from silently deleting text; the safety gate also applies to longer/fuzzy matches.
4. Remove the first `k` **original** incoming tokens and append the remainder with one separating space. Existing text and surviving incoming spelling/casing/punctuation remain unchanged.

In addition to the exact/one-substitution path, `longOverlap` aligns boundaries of at least eight tokens with token edit distance. It permits at most two substitutions/insertions/deletions and at least 80% similarity, requires three distinct matching non-stopword anchors and an exact final three-token anchor, and rejects changed negation sequences. The largest consumed incoming prefix across the matching paths is removed. The wider negation guard applies to this long-overlap path, not to the legacy one-substitution path. Empty normalized punctuation tokens do not count as exact matches. If all incoming tokens overlap, return the existing text. If nothing overlaps, append all incoming tokens. This remains a deterministic heuristic, not semantic correction or silence/hallucination detection; intentional repeated phrases can still be ambiguous.

The exact-restart fallback handles a misrecognized tail followed by a restart at an earlier phrase, as in “one ordinary looking merchant is…”. It accepts only exact incoming prefixes of 5–15 tokens ending 1–16 tokens before the committed tail, with three distinct content anchors. A sixteenth incoming token provides lookahead so a longer exact run is not partially removed at the search limit. It rejects candidates with negation in either divergent continuation. It preserves all committed words, including misrecognitions; this avoids duplicate prefixes but cannot repair garbled speech or guarantee natural grammar. Florence merchant/festival and Hindi regression cases cover these restarts, while negative cases cover weak/fuzzy/distant anchors and changed negations. Document-level coverage checks that text and timestamped JSON contributions remain consistent.

## UI integration and persistence

`TranscriptDocument` in `src/transcriptDocument.ts` owns in-memory stitched text and chunk contributions backed by saved snapshots. `main.ts` appends successful responses with their original chunk timestamps and reads `documentTranscript.text` directly for prompt context; there is no separate transcript-string mirror. Rendering calls `renderTranscript(panel, documentTranscript.toJSON())`, so the UI and JSON download use the same timestamp/value snapshot. It follows the scroll position only when the reader is already near the bottom. Copy uses the Clipboard API to write the same timestamp-keyed JSON snapshot as Share; failures suggest Share. Clear is disabled while recording, transitioning or any chunk remains, preventing transcript/prompt resets during an active sequence. The record button is disabled during asynchronous start/stop cleanup.

`src/transcriptView.ts` renders the transcript as an accessible list of timestamped rows. Each row has a `data-timestamp` key, a compact monospace `MM:SS` label and a Devanagari-capable text column. The renderer reuses existing keyed DOM rows, updates text only when it changes and removes entries absent from the snapshot (including Clear). Both timestamps and text use `textContent`; model output is never parsed as HTML. Empty contributions retain their timestamp with a CSS “No new text” hint and a screen-reader label. The hint is not part of the stored/exported value, which remains an empty string. CSS lets long Hindi/Latin text wrap without widening the viewport.

The compact landing screen omits marketing taglines and duplicate recording instructions. A flex layout gives the transcript the remaining viewport height, with recording controls and a collapsed Activity Trail below it. The trail uses native details/summary: tapping its heading toggles it, outside pointer taps collapse it, and Escape collapses it with focus returned to the heading when focus was inside. Logging continues while collapsed. Audio/transcript handling information is available inside Settings instead of the landing footer.

The header gear button, immediately left of Android's rightmost Sync button, opens the accessible Transcription settings dialog, containing labeled language and model selects. Done or Escape dismisses it and restores focus to the gear button. Language choices are Auto, Hindi (हिन्दी), English and Hinglish. Both selects are disabled during recording, asynchronous capture transitions and while any audio remains queued, so pending chunks/retries cannot switch configuration mid-sequence. They become editable again when capture stops and the queue drains.

Preferences use localStorage keys `transcription-language` and `transcription-model`; defaults are Auto language and Auto model. Previously saved manual models are preserved; select Auto model to opt into routing. Stored values are validated against the available options. Storage failures are caught and preferences still work for the current tab. The transcript container explicitly sets `lang=hi` for Hindi/Hinglish, `en` for English, or the detected `hi`/`en` in Auto (`und` until known, not assumed English). A hint inside the gear dialog displays detected language and the actual model used. Its font stack is `'Noto Sans Devanagari', system-ui, sans-serif`, using Noto when installed without an external font request. A single container language is a rendering/accessibility hint, not per-word language detection for mixed or accumulated text.

Queue and audio exist only in the current page's memory; reload, closure or process termination loses pending audio. After merges, edits and Clear, `main.ts` serializes snapshots through a promise save chain into browser localStorage or native Git storage. Recording waits for startup restoration. `TranscriptDocument.restore` rebuilds text and a continuation origin without overwriting previous keys; `edit` updates the shared entries and prompt text. Ready rows are contenteditable and focus loss saves literal text. Save failures display a notice and block explicit sync; export important notes if saving fails. The fallback Groq key and language/model preferences remain localStorage settings.

## JSON saving and sharing

Copy and Share use the shared JSON serializer with `documentTranscript.toJSON()`, preserving timestamp keys, Unicode and empty rows. The on-screen view remains timestamped rows, not raw JSON. Share is disabled while recording, transitioning, queued, exporting or without entries; Copy remains available for any committed snapshot, including silence-only entries. There is no separate Save or JSON button.

The retained `saveTranscript` utility is no longer wired to a UI control. It downloads UTF-8 `transcript.json` in browsers. On Android it calls the registered `DocumentSave` plugin with `application/json`, using `ACTION_CREATE_DOCUMENT` and `CATEGORY_OPENABLE`. The picker chooses a durable local/cloud destination without broad storage permission. UTF-8 writes resolve after stream closure; cancellation is distinct from success. `MainActivity` registers the plugin before bridge creation.

`shareTranscript` writes UTF-8 JSON to native private cache and passes its URI to Capacitor Share's platform chooser. Browsers use Web Share with a JSON file if `canShare` supports it, otherwise JSON text; without Web Share they download the JSON file. Chooser cancellation/failure propagates without fallback downloads or clearing the document. Share targets determine how they handle the file/text. Export is explicit, not automatic persistence.

## Timestamp-keyed JSON download

Copy and Share delegate the shared snapshot to `src/exportTranscript.ts`. Every output serializes the same object, for example:

```json
{
  "00:00": "आज हमारी team meeting है।",
  "00:08": "फिर lunch करेंगे।",
  "00:16": "See you tomorrow."
}
```

`TranscriptDocument.append` establishes the origin from the first committed audio chunk's timestamp, including silent chunks. Each key is the floored elapsed `MM:SS` chunk start, so continuous full windows map to `00:00`, `00:08`, `00:16`, independently of response/retry timing. Values are the newly appended suffix after `stitchTranscript`; already-overlapped text is not exported twice. Silent/fully duplicated windows retain empty strings. Same-second contributions are joined instead of overwriting text. Minutes do not wrap at an hour.

These are chunk-level markers, not word-accurate subtitles: trimming boundary words does not retime the surviving text. Separate recordings retain elapsed wall-clock pauses relative to the first audio window. Clear resets text, entries and origin, even after silence-only capture, and persists an empty snapshot. Reload restores successfully saved entries, not outstanding audio. The download and Clear controls are disabled during recording, capture transitions or queued work; Copy remains available for committed JSON entries. Browser export uses a Blob/object URL revoked after download initiation. Native Share explicitly writes `transcript.json` into `Directory.Cache` through Capacitor Filesystem and passes the returned URI to Share; the cached file can remain until Android clears it or app storage is cleared. Export failure/cancellation shows a notice without clearing the in-memory document. No JSON is uploaded by this export helper; the user-selected share target controls subsequent handling. This is download/export, not JSON import or video-file ingestion.

## Hindi punctuation boundaries

The pipeline preserves surviving Groq punctuation, including danda, commas and question marks, but does not restore missing punctuation. It never appends punctuation merely at chunk boundaries: eight-second strides can split a sentence. Explicit Hindi/Hinglish with Auto model selects v3, but model selection alone cannot guarantee punctuation. The current prompt contains only recent committed context, so an unpunctuated transcript can also provide unpunctuated style conditioning.

A punctuated Hindi style example is a possible future prompt experiment, not an enabled feature or guaranteed fix: Whisper prompts condition continuation and seed content can leak into output. A stronger optional extension is punctuation restoration across stitched sentence context, constrained to preserve words, script and timestamp keys. It would need opt-in API cost/latency, lexical-integrity validation and real-audio evaluation. Any accepted changes must update the shared document before rendering and exporting, not decorate the UI alone. No restoration model call or style seed is currently implemented. See [README punctuation guidance](../../README.md#hindi-punctuation).

## Focused tests

`src/transcriptionQueue.test.ts` asserts multipart fields, filenames, auth header, trailing prompt length, deferred first responses, merge-before-next-request ordering, head retention through network/429/5xx/408 backoff, timeout retry and paused 401/400/403/413/missing-key/malformed-data recovery. It also verifies Hindi/Hinglish mapping to `language=hi`, English and another explicit ISO code, Auto/default omission, turbo/v3 selection, no prompt for fresh sessions and unchanged Hindi/mixed committed prompt context. Detection tests verify English turbo, Hindi probe/refinement and following v3 chunks, switching back to English, manual model overrides, silence and refinement failure without premature commit. Fake timers and injected randomness make delays deterministic.

`src/transcriptStitcher.test.ts` covers longest exact matches, one-token fuzzy boundaries, short stopword safety, empty/silent text, zero overlap, Unicode/case/edge punctuation normalization, surviving punctuation, fully duplicated chunks and the 15-token search limit. Hindi/Hinglish regressions cover multi-word matra/danda overlaps, distinct final vowel signs, non-overlapping sentences, Hindi function-word guards and NFC-equivalent Devanagari/Latin text. Long-overlap tests additionally cover the reported two-word Hindi recognition difference, inserted/omitted tokens, weak anchors, changed endings, excessive edits and newly inserted English/Hindi negations. The [production browser smoke test](../operations/development-and-pwa.md#verification) connects these modules to real browser audio processing with synthetic input and mocked Groq responses.

`src/transcriptDocument.test.ts` verifies 0/8/16-second keys, Unicode/Hinglish contributions without overlap, silence/duplicates, pauses, same-second collisions, snapshot isolation, Clear and hour-boundary formatting. Browser smoke coverage checks Auto English/Hindi routing and compares rendered timestamp/text pairs against a real downloaded JSON file, including empty duplicate-window rows. It verifies JSON Copy/Share parity, Share's download fallback, removal of Save and the JSON button, portrait/narrow/landscape workspace sizing, top-right settings and collapsed Activity Trail with tap/keyboard dismissal, gear-dialog visibility/dismissal/focus restoration and busy locks, literal Hindi/HTML-like text rendering (no injected image element), Clear, and no horizontal overflow at 320px.

`src/exportTranscript.test.ts` checks shared JSON serialization, Android JSON document-picker options, save cancellation/failure, native UTF-8 JSON cache/file sharing, browser file and JSON-text sharing, download fallback, chooser cancellation without fallback downloads, and object-URL revocation. These are mocked native plugin tests, not device certification. See [Android packaging and verification](../operations/development-and-pwa.md#packaged-android-app).

`src/offlineTranscription.test.ts` covers keyless/offline FIFO, upload-loss same-head fallback, missing-model pause/recovery and reconnect routing. `src/deviceServices.test.ts` covers saved-note restoration and literal edits in the shared snapshot.

See also: [quickstart](../quickstart.md), [audio capture and slicing](audio-pipeline.md), [Android device services](device-services.md).
