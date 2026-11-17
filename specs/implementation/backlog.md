# Dictation App — Implementation Backlog

This file is the **single source of truth for implementation task status**.
Tasks below are derived from `specs/review/current-implementation-review.md`;
the review remains the baseline assessment and has not been modified.

## Queue summary

- Last reviewed: 2026-11-17
- Current branch: `master`
- Active task: `None`
- Ready tasks: `1`
- Backlog tasks: `6`
- Blocked tasks: `0`
- Verified tasks: `1`
- First eligible task: `DIC-004 — Expose truthful model download progress and cancellation`

## Selection rules

- One task per Copilot session.
- At most one `In Progress` task at a time.
- Select highest priority (`P0`, then `P1`, then `P2`) among `Ready` tasks whose dependencies are all `Verified`.
- Follow the order listed when priority is equal.
- Do not take another task while one is `In Progress` or `Implemented — Validation Pending`.
- Do not mark a task `Verified` until all required acceptance and validation criteria have passed.

## Status definitions

- `Backlog` — candidate work not yet sufficiently refined.
- `Ready` — actionable, dependencies verified, acceptance criteria and validation plan defined.
- `In Progress` — currently being worked on.
- `Implemented — Validation Pending` — code complete, required validation incomplete.
- `Verified` — acceptance criteria and required validation passed.
- `Blocked` — waiting on a decision, dependency, environment, or external issue.
- `Deferred` — intentionally postponed.

## Priority definitions

- `P0` — critical correctness, security, data integrity, or essential user journey.
- `P1` — important product or architectural enhancement.
- `P2` — lower-risk refinement, polish, or optimization.

Priorities reflect the user impact and risks documented in the review. P0 work is
listed first, but remains in `Backlog` until its associated decisions are made.

---

## Tasks

### DIC-001 — Make engine choice explicit and preserve audio destination

- **Title:** Make engine choice explicit and preserve audio destination
- **Status:** `Backlog`
- **Priority:** `P0`
- **Source review findings:** `FR-001`, `FR-002`, `FR-007`, `FR-012`, `FR-013`, `FR-014`, `FR-015`, `FR-017`, `FR-027`
- **Source requirements:** Functional Design §§2–4, 7; engine choice, independent readiness/configuration, and no implicit routing
- **Wireframe references:** `specs/visualwireframes/implementation_specifications.md`, Main – Ready, Recording – Offline, Online – Groq, Transcription Settings
- **Architecture references:** `specs/architecture/01-architecture-design.md`, Transcription engine abstraction and state management; `specs/architecture/03-deployment-and-security.md`, Audio privacy and lifecycle
- **Dependencies:** None; planning depends on `DEC-001`
- **Owner/session:** Unassigned
- **Created:** 2026-11-17
- **Last updated:** 2026-11-17

#### Problem and expected outcome

The review found that connectivity, rather than a user-selected engine, currently
routes each queued chunk. A queued Offline chunk can therefore be sent to Groq
after reconnection. Add a persistent, explicit `Online (Groq)` / `Offline
(Whisper)` selection, show readiness separately from connectivity, and ensure
the chosen destination is not silently changed. The exact Online-mode behavior
for queued work when connectivity is lost is unresolved in `DEC-001`.

#### Scope

- Included:
  - Model selected engine and readiness independently from network state.
  - Persist and restore the active engine.
  - Bind queued audio to the selected destination and prevent mode changes while
    recording or audio is queued.
  - Provide actionable unready/setup states; Offline remains usable without a
    Groq key.
- Excluded:
  - Moving Groq requests or audio capture to native Android.
  - Settings-page redesign beyond controls and status required for this flow.

#### Likely areas to inspect

- `src/main.ts`, `src/transcriptionQueue.ts`, `src/deviceServices.ts`
- `index.html`, `src/style.css`, queue and browser interaction tests

#### Acceptance criteria

- [ ] The user can select and restore Online or Offline independently of network connectivity.
- [ ] The selected engine and its readiness are visible; an unready engine cannot start recording and offers its relevant setup action.
- [ ] Queued audio never changes destination solely because connectivity changes; Offline audio is never sent to Groq.
- [ ] Mode changes are unavailable while recording or audio is queued, and changing mode does not clear the transcript or overwrite the other engine's settings.
- [ ] Offline transcription works without a Groq key and, after model installation, without network access.

#### Validation plan

- Automated tests:
  - Add queue tests for connectivity changes while chunks are queued and UI/state tests for selection, restoration, and readiness.
  - Run `npm test` and `npm run test:browser`.
- Build/lint:
  - Run `npm run build`; build Android if native state/bridge call sites are changed.
- Device/manual validation:
  - With an installed model, transcribe in airplane mode without a Groq key.
  - Exercise Online disconnection and recovery using the policy approved in `DEC-001`; verify no unintended engine switch or upload.

#### Implementation notes and constraints

- Keep selected mode, readiness, and connectivity as separate state.
- Preserve the shared recorder, queue, and transcript behavior.
- Do not silently route audio to another engine as a fallback.

#### Outcome and evidence

- **Status reason:** `Backlog`; the functional spec establishes explicit modes, but the review identifies an unresolved policy for Online work when connectivity is lost.
- **Files changed:** None; not started.
- **Tests run:** None; backlog preparation only.
- **Device validation:** Not performed.
- **Remaining issues:** Resolve `DEC-001`.
- **Follow-up tasks:** `DIC-007`

---

### DIC-002 — Secure the Android Groq credential and request boundary

- **Title:** Secure the Android Groq credential and request boundary
- **Status:** `Backlog`
- **Priority:** `P0`
- **Source review findings:** `FR-010`, `FR-011`, `FR-015`, `FR-019`, `FR-020`
- **Source requirements:** Functional Design §§2, 5, 7; API key lifecycle and connection testing
- **Wireframe references:** `specs/visualwireframes/implementation_specifications.md`, Online Settings and First-time Groq Configuration
- **Architecture references:** `specs/architecture/01-architecture-design.md`, Groq engine; `specs/architecture/03-deployment-and-security.md`, Secure credential handling and Native bridge security; `specs/architecture/05-native-bridge-contract.md`, credential and connection commands
- **Dependencies:** None; planning depends on `DEC-002`
- **Owner/session:** Unassigned
- **Created:** 2026-11-17
- **Last updated:** 2026-11-17

#### Problem and expected outcome

The review found that the Groq key is accessible to WebView JavaScript and
persisted in `localStorage`, and that Groq requests originate in JavaScript.
Move the Android credential and request path behind explicit native commands,
using platform-backed secure storage and never returning the complete key to
JavaScript. Browser PWA support and its credential policy need a product
decision before changing browser behavior.

#### Scope

- Included:
  - Add allowlisted Android save/update, remove, connection-test, and
    transcription operations as approved by `DEC-002`.
  - Store and retrieve the Android key through suitable Keystore-backed
    protection; return only safe status.
  - Surface actionable missing, invalid, and connection-failure states.
- Excluded:
  - Introducing a backend proxy.
  - Changing the browser PWA credential behavior before its support/policy is decided.

#### Likely areas to inspect

- `src/deviceServices.ts`, `src/transcriptionQueue.ts`, `src/main.ts`
- `android/app/src/main/java/app/personaldictation/mobile/DictationDevicePlugin.java`
- Android plugin tests and focused web queue/settings tests

#### Acceptance criteria

- [ ] Android Groq credentials are not stored in WebView `localStorage` or embedded in Android build-time configuration.
- [ ] The full key is never returned to JavaScript or written to logs, transcripts, or Activity Trail.
- [ ] Online requests use the approved native boundary and keep Offline independent of Groq configuration.
- [ ] Users can save/update/remove a key and test the connection, with safe, actionable status.
- [ ] Browser PWA behavior matches the approved support and credential policy.

#### Validation plan

- Automated tests:
  - Add native credential lifecycle and mocked Groq request tests; test safe bridge results and error mapping.
  - Run `npm test`; run `cd android && ./gradlew testDebugUnitTest`.
- Build/lint:
  - Run `npm run build` and `cd android && ./gradlew assembleDebug`.
- Device/manual validation:
  - Verify save, restart, test, update, and remove on Android without using real credentials in tests or logs.
  - Confirm browser behavior against `DEC-002`.

#### Implementation notes and constraints

- Preserve direct device-to-Groq requests unless a separately approved product decision changes that design.
- Provide an explicit re-entry path for existing WebView-stored keys; never silently migrate or log them.
- Do not claim a client-side key is secret from the device owner or a compromised runtime.

#### Outcome and evidence

- **Status reason:** `Backlog`; Android architecture is specified, but the review leaves browser deployment and credential policy unresolved.
- **Files changed:** None; not started.
- **Tests run:** None; backlog preparation only.
- **Device validation:** Not performed.
- **Remaining issues:** Resolve `DEC-002`.
- **Follow-up tasks:** `DIC-006`

---

### DIC-003 — Reject altered Whisper models before inference

- **Title:** Reject altered Whisper models before inference
- **Status:** `Verified`
- **Priority:** `P1`
- **Source review findings:** `FR-023`
- **Source requirements:** Functional Design §3, Offline model readiness; integrity before use
- **Wireframe references:** `specs/visualwireframes/implementation_specifications.md`, Offline Whisper Settings, model readiness/runtime-error states
- **Architecture references:** `specs/architecture/03-deployment-and-security.md`, Model storage and validated installation
- **Dependencies:** None
- **Owner/session:** Unassigned
- **Created:** 2026-11-17
- **Last updated:** 2026-11-17

#### Problem and expected outcome

The downloader and status path verify the model digest, but the inference entry
point checks only file existence and size. A same-size altered model may pass
that guard. Ensure the model content is verified before it is treated as ready
and used for inference, reusing the existing model identity and SHA-256
validation.

#### Scope

- Included:
  - Apply the existing integrity rule at the inference boundary or use an
    equivalently safe verified-install invariant.
  - Return a structured/actionable failure for an invalid model.
- Excluded:
  - Changing the supported model, Whisper runtime, or Vulkan/CPU selection.

#### Likely areas to inspect

- `android/app/src/main/java/app/personaldictation/mobile/DictationDevicePlugin.java`
- `android/app/src/main/java/app/personaldictation/mobile/ModelDownloader.java`
- `android/app/src/test/` model and plugin tests; JNI call boundary

#### Acceptance criteria

- [x] A same-size model file with incorrect content is rejected before JNI inference.
- [x] A valid installed model still reaches inference and is reported ready.
- [x] Invalid-model errors are surfaced without treating the model or transcription as successful.
- [x] Existing atomic installation and CPU/Vulkan behavior remain unchanged.

#### Validation plan

- Automated tests:
  - Add an Android test that uses a same-size altered model and exercises readiness and inference guards.
  - Run `cd android && ./gradlew testDebugUnitTest`.
- Build/lint:
  - Run `cd android && ./gradlew assembleDebug`.
- Device/manual validation:
  - On an Android target, verify a valid model remains usable and a deliberately altered test model is rejected before inference; do not use or overwrite a user's installed model.

#### Implementation notes and constraints

- Reuse the repository's existing expected digest and validation behavior.
- Avoid unrelated downloader changes and avoid introducing a new model format.

#### Outcome and evidence

- **Status reason:** `Verified`; unit tests, the normal Vulkan-enabled APK build for both supported ABIs, and the real plugin/JNI regression test on Waydroid passed.
- **Files changed:** `DictationDevicePlugin.java`, `ModelDownloader.java`, `ModelDownloaderTest.java`, `android/app/src/androidTest/java/app/personaldictation/mobile/ModelIntegrityTest.java`, `specs/implementation/backlog.md`, `specs/implementation/execution-log.md`.
- **Tests run:** Focused downloader suite passed (6 tests). Final `testDebugUnitTest` passed (7 tests, 0 failures). Waydroid instrumentation passed (1 test, 6.337 seconds); see the appended execution-log entry for exact commands and isolated test configuration.
- **Build:** Normal `assembleDebug` passed using the existing host-tool Gradle properties with installed GCC, glslc, and Vulkan headers. Vulkan remained enabled; both `arm64-v8a` and `x86_64` libraries were packaged. No repository build configuration or runtime backend behavior changed.
- **Device validation:** Waydroid Android 13, x86_64: valid model reported ready and reached real Vulkan inference; changing one model byte without changing size reported not ready and rejected transcription despite the cached JNI context; restoring valid bytes reported ready and returned Vulkan inference again. Used synthetic silence and a disposable model directory in a separate validation package; original application/model data were untouched. Validation packages were removed after testing.
- **Remaining issues:** No outstanding DIC-003 checks. The unfiltered instrumentation suite has unrelated legacy NotesRepository/JGit and dependency-module Kotlin test-build failures; only the new model-integrity instrumentation test was compiled/run using session-only configuration. Physical ARM device behavior was not retested; CPU/Vulkan selection code was unchanged.
- **Follow-up tasks:** `DIC-008` (existing instrumentation build failures; not part of DIC-003).

---

### DIC-004 — Expose truthful model download progress and cancellation

- **Title:** Expose truthful model download progress and cancellation
- **Status:** `Ready`
- **Priority:** `P1`
- **Source review findings:** `FR-009`, `FR-016`, `FR-019`
- **Source requirements:** Functional Design §§2–3, Offline download states and recovery
- **Wireframe references:** `specs/visualwireframes/implementation_specifications.md`, Offline Whisper Settings and model download states
- **Architecture references:** `specs/architecture/01-architecture-design.md`, ModelDownloadManager; `specs/architecture/05-native-bridge-contract.md`, download/cancel commands and progress/completion events
- **Dependencies:** None
- **Owner/session:** Unassigned
- **Created:** 2026-11-17
- **Last updated:** 2026-11-17

#### Problem and expected outcome

The native downloader verifies and atomically installs the model, but exposes
only a promise and a ready flag; the UI presents static download text with no
progress or cancellation. Expose meaningful progress and a safe cancellation
path for the currently supported model, preserving integrity validation and
recovery behavior.

#### Scope

- Included:
  - Report meaningful download progress through the allowlisted native bridge.
  - Support cancellation and distinguish cancelled, failed, and verified-ready outcomes.
  - Preserve temporary-file cleanup, checksum validation, atomic installation, and retry.
- Excluded:
  - Adding model catalog choices or changing the currently supported model.
  - Starting inference or changing engine selection.

#### Likely areas to inspect

- `android/app/src/main/java/app/personaldictation/mobile/ModelDownloader.java`
- `DictationDevicePlugin.java`, `src/deviceServices.ts`
- `android/app/src/test/` downloader tests and focused bridge tests

#### Acceptance criteria

- [ ] Progress reflects bytes actually received and does not report ready before integrity verification and installation succeed.
- [ ] Cancel stops the active download, removes or safely retains only non-ready temporary data, and leaves any previously verified model intact.
- [ ] Interrupted, cancelled, and failed downloads can be retried; partial data is never reported ready.
- [ ] Bridge listeners are removed deliberately and operation failures remain explicit.

#### Validation plan

- Automated tests:
  - Add tests for progress, cancellation, interruption, retry, and preservation of an existing verified model.
  - Run `cd android && ./gradlew testDebugUnitTest`.
- Build/lint:
  - Run `cd android && ./gradlew assembleDebug`.
- Device/manual validation:
  - On Android, observe progress, cancel a transfer, retry it, and verify status becomes ready only after successful integrity validation.

#### Implementation notes and constraints

- Report progress only when the downloader can provide meaningful byte-level progress.
- Keep the existing temporary-file, digest, and atomic-install protections.
- Do not return audio or model contents through the WebView bridge.

#### Outcome and evidence

- **Status reason:** `Ready`; the missing behavior and state outcomes are specified, and the current single-model flow avoids unresolved catalog decisions.
- **Files changed:** None; not started.
- **Tests run:** None; backlog preparation only.
- **Device validation:** Not performed; required during implementation.
- **Remaining issues:** None known for task planning.
- **Follow-up tasks:** `DIC-007`

---

### DIC-005 — Move Android audio capture behind the native boundary

- **Title:** Move Android audio capture behind the native boundary
- **Status:** `Backlog`
- **Priority:** `P1`
- **Source review findings:** `FR-019`, `FR-021`, `FR-025`
- **Source requirements:** Functional Design §§2, 5, 7; recording lifecycle and permission recovery
- **Wireframe references:** `specs/visualwireframes/implementation_specifications.md`, Recording – Offline and Online – Groq
- **Architecture references:** `specs/architecture/01-architecture-design.md`, component responsibilities and shared audio capture; `specs/architecture/03-deployment-and-security.md`, Native bridge security and Audio privacy/lifecycle; `specs/architecture/05-native-bridge-contract.md`, recording commands/events
- **Dependencies:** `DIC-001`, `DIC-002`; planning also depends on `DEC-003`
- **Owner/session:** Unassigned
- **Created:** 2026-11-17
- **Last updated:** 2026-11-17

#### Problem and expected outcome

Android currently captures audio in Web Audio and sends Offline WAV chunks through
the bridge as Base64, while the target architecture keeps audio in native memory
or app-private storage and uses a shared capture path. Determine and implement
the approved Android boundary without replacing working browser PWA capture.

#### Scope

- Included:
  - For Android, implement or stage the approved shared capture path and
    app-private/native audio handoff.
  - Preserve start, pause, resume, stop, queue ordering, cleanup, permission,
    and interruption behavior.
  - Use explicit bridge commands/events and small metadata/result payloads.
- Excluded:
  - Claiming background/locked-screen recording without an approved
    foreground-service design and device validation.
  - Replacing browser PWA capture unless separately approved.

#### Likely areas to inspect

- `src/audioRecorder.ts`, `src/deviceServices.ts`, `src/transcriptionQueue.ts`
- `DictationDevicePlugin.java`, `MainActivity.java`, Android manifest and bridge tests

#### Acceptance criteria

- [ ] Android audio is not transferred as a large Base64 WebView payload.
- [ ] One approved capture path serves both engines on Android, independent of engine selection.
- [ ] Start, pause, resume, stop, permission denial/revocation, interruption, cancellation, and cleanup preserve queue semantics.
- [ ] Session/request correlation and listener lifecycle follow the approved bridge contract.
- [ ] Browser capture behavior remains supported and unchanged unless approved otherwise.

#### Validation plan

- Automated tests:
  - Preserve existing `audioRecorder` tests and add bridge/lifecycle integration tests for the Android path.
  - Run `npm test` and `cd android && ./gradlew testDebugUnitTest`.
- Build/lint:
  - Run `npm run build` and `cd android && ./gradlew assembleDebug`.
- Device/manual validation:
  - Test microphone permission denial/revocation, pause/resume/stop, app background/return, interruption, and audio cleanup on a connected Android target.

#### Implementation notes and constraints

- Resolve whether native capture is mandatory for Android before implementation.
- Reuse existing resampling, chunking, and queue semantics where compatible.
- Do not infer background recording support from wake lock or screen-on behavior.

#### Outcome and evidence

- **Status reason:** `Backlog`; the target boundary conflicts with the current Web Audio design, and the review records that native capture is a decision rather than a verified mandatory requirement.
- **Files changed:** None; not started.
- **Tests run:** None; backlog preparation only.
- **Device validation:** Not performed.
- **Remaining issues:** Resolve `DEC-003`; dependencies `DIC-001` and `DIC-002` must be Verified.
- **Follow-up tasks:** None.

---

### DIC-006 — Add navigable Online settings and credential management

- **Title:** Add navigable Online settings and credential management
- **Status:** `Backlog`
- **Priority:** `P1`
- **Source review findings:** `FR-006`, `FR-010`, `FR-011`, `FR-015`
- **Source requirements:** Functional Design §§2, 5, 7; Online settings and first-time configuration
- **Wireframe references:** `specs/visualwireframes/implementation_specifications.md`, Settings and Online Settings
- **Architecture references:** `specs/architecture/03-deployment-and-security.md`, Secure credential handling; `specs/architecture/05-native-bridge-contract.md`, credential and connection commands/events
- **Dependencies:** `DIC-002`
- **Owner/session:** Unassigned
- **Created:** 2026-11-17
- **Last updated:** 2026-11-17

#### Problem and expected outcome

The current UI uses a first-use key dialog rather than a navigable Online settings
section. It lacks saved-key masking, explicit update/remove actions, and
connection testing. Provide a dedicated Online settings flow integrated with the
approved credential boundary.

#### Scope

- Included:
  - Add a settings entry/navigation path to Online settings.
  - Show missing/saved state without exposing the full saved key; support
    approved save/update/remove and connection-test operations.
  - Show valid, invalid, testing, and recoverable connection-failure states.
- Excluded:
  - Changing the credential storage/request architecture (owned by `DIC-002`).
  - Adding a backend proxy or changing browser credential policy without approval.

#### Likely areas to inspect

- `index.html`, `src/main.ts`, `src/style.css`
- `src/deviceServices.ts`, Android settings/credential bridge tests

#### Acceptance criteria

- [ ] Online settings are reachable through a distinct settings navigation flow.
- [ ] Saved credentials are masked; users can update or remove them without displaying/logging the complete saved key.
- [ ] Connection testing provides clear progress, success, invalid-key, and retryable-failure feedback.
- [ ] Missing Online setup never blocks Offline (Whisper).
- [ ] Privacy copy accurately states where Online audio is sent and the approved deployment-specific credential limitations.

#### Validation plan

- Automated tests:
  - Add UI-flow tests for missing/saved/update/remove/test states with mocked native operations.
  - Run `npm test` and `npm run test:browser`.
- Build/lint:
  - Run `npm run build`; run Android unit/build checks for changed bridge integration.
- Device/manual validation:
  - Verify Android credential lifecycle and connection states without real credentials in automated tests or logs; check Android viewport/keyboard behavior.

#### Implementation notes and constraints

- Keep browser PWA credential behavior aligned with `DEC-002`.
- Use only allowlisted bridge operations and safe status values.
- Preserve Offline access when the Groq key is missing or invalid.

#### Outcome and evidence

- **Status reason:** `Backlog`; the UI behavior is specified, but it depends on the credential boundary and unresolved browser deployment policy.
- **Files changed:** None; not started.
- **Tests run:** None; backlog preparation only.
- **Device validation:** Not performed.
- **Remaining issues:** `DIC-002` and `DEC-002`.
- **Follow-up tasks:** None.

---

### DIC-007 — Add Offline model settings and readiness states

- **Title:** Add Offline model settings and readiness states
- **Status:** `Backlog`
- **Priority:** `P1`
- **Source review findings:** `FR-002`, `FR-006`, `FR-009`, `FR-013`, `FR-016`, `FR-017`
- **Source requirements:** Functional Design §§2–4, 5, 7; Offline model setup, readiness, persistence, and recovery
- **Wireframe references:** `specs/visualwireframes/implementation_specifications.md`, Settings, Transcription Settings, Offline Whisper Settings, model download/readiness states
- **Architecture references:** `specs/architecture/01-architecture-design.md`, model/configuration state; `specs/architecture/05-native-bridge-contract.md`, engine status and model progress events
- **Dependencies:** `DIC-001`, `DIC-004`, `DIC-006`
- **Owner/session:** Unassigned
- **Created:** 2026-11-17
- **Last updated:** 2026-11-17

#### Problem and expected outcome

The review found only a single transcription-settings dialog and a static model
download message. Add a dedicated Offline settings/readiness flow that presents
the existing supported model's status and real download lifecycle, and clearly
distinguishes setup-required, downloading, ready, and recoverable error states.

#### Scope

- Included:
  - Add an Offline settings section reachable through settings navigation.
  - Show the currently supported model and its actual readiness/download state.
  - Connect progress, cancellation, retry, and readiness UI to the native
    lifecycle from `DIC-004`.
  - Prevent recording while Offline is unready and provide the recovery action.
- Excluded:
  - Adding unsupported model catalog entries or changing engine routing.
  - Claiming device/backend support not established by implementation and tests.

#### Likely areas to inspect

- `index.html`, `src/main.ts`, `src/style.css`
- `src/deviceServices.ts`, `DictationDevicePlugin.java`, focused browser and bridge tests

#### Acceptance criteria

- [ ] Offline settings are reachable separately from Online settings.
- [ ] The UI displays only the verified supported model and reflects actual download/validation/readiness states.
- [ ] Progress and Cancel match native operation events; cancellation, failure, and retry never show the model as ready prematurely.
- [ ] An unready Offline engine cannot start recording and offers a relevant recovery action.
- [ ] Active mode and independent Online/Offline configuration survive restart without changing transcript behavior.

#### Validation plan

- Automated tests:
  - Add state/UI tests for not-downloaded, downloading, cancelled, failed, retry, and ready flows.
  - Run `npm test` and `npm run test:browser`; run `cd android && ./gradlew testDebugUnitTest`.
- Build/lint:
  - Run `npm run build` and `cd android && ./gradlew assembleDebug`.
- Device/manual validation:
  - Exercise download, progress, cancel, retry, and restart on Android; check narrow/landscape viewport, keyboard, and safe-area behavior.

#### Implementation notes and constraints

- Preserve the current model identity and verified downloader behavior.
- Do not make Groq configuration mandatory for Offline (Whisper).
- Keep engine readiness separate from network connectivity.

#### Outcome and evidence

- **Status reason:** `Backlog`; UI scope is defined, but it depends on explicit engine state, native download lifecycle, and the settings navigation introduced by `DIC-006`.
- **Files changed:** None; not started.
- **Tests run:** None; backlog preparation only.
- **Device validation:** Not performed.
- **Remaining issues:** Dependencies `DIC-001`, `DIC-004`, and `DIC-006` must be Verified.
- **Follow-up tasks:** None.

---

### DIC-008 — Restore app instrumentation test compilation

- **Title:** Restore app instrumentation test compilation
- **Status:** `Backlog`
- **Priority:** `P2`
- **Source review findings:** `FR-026`; concrete compilation failures observed during DIC-003 device validation
- **Source requirements:** Repository validation workflow; reproducible Android instrumentation checks
- **Source evidence:** `android/app/src/androidTest/java/app/personaldictation/mobile/NotesRepositoryTest.java` references missing `NotesRepository` and JGit types; `:app:compileDebugAndroidTestJavaWithJavac` fails with seven compilation errors.
- **Dependencies:** None
- **Created:** 2026-11-17
- **Last updated:** 2026-11-17

#### Scope

- Reconcile the obsolete NotesRepository instrumentation test with the current persistence implementation, without restoring removed Git syncing or changing application behavior.
- Establish and document app-scoped instrumentation build/run commands, including external model-fixture setup when required.
- Investigate test dependency alignment only if the app-scoped tasks require it. Do not repair dependency modules' own tests as part of application testing.

#### Acceptance criteria

- [ ] `:app:assembleDebugAndroidTest` compiles the repository's app tests without session-only Java source exclusion.
- [ ] Obsolete persistence assertions no longer reference removed production code; any replacement checks cover current behavior.
- [ ] The focused model-integrity test can be built/run with documented fixture provisioning and without Kotlin version conflicts.

#### Validation plan

- Run app-scoped instrumentation APK assembly and relevant Android unit tests.
- Run the affected app instrumentation tests on an isolated Android target; preserve existing application/model data.

#### Outcome and evidence

- **Status reason:** `Backlog`; recorded during DIC-003 validation, not implemented.
- **Files changed:** None for DIC-008.
- **Tests run:** The compilation failure is preserved in the DIC-003 session's `dic003-instrumentation-build.log`. Root-level instrumentation assembly also failed in a dependency module's Kotlin duplicate-class check; use app-scoped tasks to avoid building unrelated dependency tests.
- **Remaining issues:** Refine which existing persistence assertions remain relevant before implementation.
- **Follow-up tasks:** None.

---

## Blocked / deferred decisions

| ID | Decision or blocker | Affected tasks | Owner/action needed | Status |
|---|---|---|---|---|
| DEC-001 | Confirm explicit persistent mode semantics and what happens to Online-queued audio on network loss: retain for Groq, discard only with consent, or offer an explicit switch. Connectivity must not silently change a chunk's destination. | DIC-001, DIC-007 | Product owner to approve the routing/queue policy against the functional design and privacy requirements. | Open |
| DEC-002 | Confirm whether browser PWA remains first-class and approve its credential policy separately from Android Keystore storage (including accurate client-side key disclosure); do not introduce a backend proxy implicitly. | DIC-002, DIC-006 | Product/security owner to decide deployment support and browser credential expectations. | Open |
| DEC-003 | Confirm whether native audio capture is a firm Android requirement or a target recommendation that may be staged while Web Audio remains in use. | DIC-005 | Product/architecture owner to confirm Android capture boundary and migration expectations. | Open |
| DEC-004 | Define whether Activity Trail means current-session diagnostics or persistent prior-session history, including retention and session-count behavior. | No task yet; review finding FR-005 | Product owner to define history and privacy requirements before persistence work is planned. | Open |
| DEC-005 | Confirm whether background/locked-screen recording is a product requirement; do not promise it or plan a foreground service until approved. | No task yet; review finding FR-025 | Product owner to decide; then define lifecycle and device acceptance criteria. | Open |
