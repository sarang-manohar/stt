# Repository Agent Instructions

## Project context

This repository contains a hybrid dictation application with a web-based UI and native Android transcription capabilities:

- **Offline (Whisper):** audio is transcribed locally using the existing native Whisper runtime and downloaded model.
- **Online (Groq):** audio is sent directly from the Android device to the Groq transcription API.

The intended separation is: web presentation in the frontend; microphone capture, native inference, model lifecycle, secure credentials, and platform persistence in Android.

## Specification locations

Use these repository references when relevant:

- `specs/key_design_decisions.md` - high level drivers of the enhancements
- `specs/functional_design_reference.md` — functional requirements, application workflows and states, acceptance criteria
- `specs/visualwireframes/` — visual direction, screen layouts, UI states, and interaction references.
- `specs/architecture/` — architecture, component/sequence diagrams, deployment and security design, implementation plan, and native bridge contract.

Read only the files relevant to the task. Do not preload every specification at task start.

Treat wireframes as visual/interaction guidance, not proof that a feature exists. Treat architecture documents as target design guidance, not proof of current implementation. Inspect the code and tests before changing anything. If a specification conflicts with verified code, tests, platform constraints, or runtime behaviour, explain the conflict rather than silently choosing one. Do not invent missing requirements; record assumptions and open questions.

Preserve specification terminology, including `Online (Groq)`, `Offline (Whisper)`, engine readiness, model download states, recording states, transcript segments, and Activity Trail.

## Iterative implementation workflow

Enhancements must be delivered incrementally, one backlog task per agent session.

- Use `specs/implementation/README.md` as the workflow authority.
- Use `specs/implementation/backlog.md` as the single source of truth for task status.
- Append every session outcome to `specs/implementation/execution-log.md`.
- Execute the reusable prompt in `specs/implementation/COPILOT-NEXT-TASK-PROMPT.md` for each implementation session.
- Work on exactly one task per session. At most one task may be `In Progress`.
- Pick only a `Ready` task whose dependencies are all `Verified`; prioritize P0, then P1, then P2.
- If a previous task is `In Progress` or `Implemented — Validation Pending`, resume it instead of starting another.
- Do not start the next task automatically after completing one. Stop and report the next eligible task.
- Mark `Verified` only after all acceptance criteria and required automated/device validation pass. A successful build alone is insufficient.
- If validation cannot be performed, use `Implemented — Validation Pending` and record the remaining checks.
- Do not bundle unrelated refactoring or enhancements into the selected task.
- Preserve user changes and do not commit, push, or discard changes unless explicitly asked.


## Core engineering principles

### Preserve existing functionality
- Inspect the existing codebase before proposing or making structural changes.
- Reuse the current Whisper runtime, Groq integration, audio pipeline, model download logic, and working UI components wherever practical.
- Do not replace working implementations merely to match a proposed folder structure or preferred framework.
- Prefer incremental refactoring over wholesale rewrites.
- Keep changes scoped to the requested behaviour.
- Do not add dependencies without a demonstrated need.

### Separation of responsibilities
Maintain clear boundaries between:
- **Web presentation:** screens, components, interactions, and rendering application state.
- **Application orchestration:** dictation lifecycle, sessions, engine selection, and coordination.
- **Domain contracts:** transcription engine, audio recorder, model repository, credential provider, transcript models, and errors.
- **Native Android services:** microphone capture, Whisper execution, Groq requests where implemented natively, model lifecycle, persistence, and secure credentials.
- **Infrastructure:** filesystem, database, network, native runtime, and platform APIs.

The UI must not call Whisper inference or Groq networking implementations directly. Route operations through the application layer and established native bridge.

### Transcription engines
- Keep Whisper and Groq behind a common transcription contract where compatible with the existing codebase.
- Keep audio capture independent of the selected engine.
- Normalize engine output into a shared transcript representation.
- Keep engine-specific settings independent. Switching modes must not overwrite the other engine's configuration.
- Groq configuration must never be mandatory for Offline (Whisper).
- Offline transcription must not require network access after the model is installed.
- Never silently switch from Offline to Online or upload audio to Groq as a fallback.

### Audio and recording
- Preserve existing recording behaviour unless the task explicitly changes it.
- Use one shared audio capture path for both engines wherever the platform implementation allows.
- Keep large audio buffers and files in native memory or app-private storage; avoid passing audio payloads through the WebView bridge.
- Model recording states explicitly: idle, recording, paused, processing, and error.
- Prevent engine/configuration changes while recording or while audio is queued, unless a safe transition is explicitly supported.
- Handle microphone permissions, interruption, cancellation, cleanup, and Android lifecycle changes.
- Do not assume JavaScript timers or a WebView can reliably maintain microphone capture in the background. Verify the existing foreground-service design first.

### Native bridge
- Use the bridge technology already present. Do not assume Capacitor unless code inspection confirms it.
- Reconcile the actual bridge with the contract in `specs/architecture/`.
- Expose explicit, allowlisted commands and typed events; never expose arbitrary native method invocation.
- Validate bridge inputs and return structured, safe errors.
- Correlate asynchronous operations with request IDs and dictation sessions with session IDs where appropriate.
- Register and remove event listeners deliberately.
- Keep bridge payloads small. Return status, metadata, and normalized transcript results rather than raw audio.
- Never return the complete Groq API key to JavaScript after saving it.

### Whisper models
- Reuse the existing native Whisper runtime and model format.
- Keep model management separate from recording and inference orchestration.
- Do not mark a model ready until download and integrity validation succeed.
- Use temporary download locations and atomic installation where supported.
- Handle cancellation, interrupted downloads, insufficient storage, integrity failures, and retry.
- Preserve existing Vulkan-preferred and CPU-fallback behaviour. Change neither without device-level evidence and regression tests.
- Do not claim a model, language, backend, or capability is supported unless verified by the implementation.

### Groq and credentials
- Preserve direct device-to-Groq requests unless a task explicitly changes that product decision.
- Prefer native-side Groq requests when supported, keeping the API key and audio out of JavaScript.
- Use the strongest suitable platform-backed credential storage. For Android, prefer Android Keystore-backed encryption.
- Never store API keys in source code, ordinary preferences, browser `localStorage`, transcripts, activity logs, or application logs.
- Never log credentials, authorization headers, or sensitive audio.
- Keep privacy statements accurate: Offline audio stays on-device; Online audio is sent to Groq.
- Do not claim a client-side API key is completely secret from the device owner or a compromised runtime.

## UI and interaction guidance

- Use `specs/visualwireframes/` as the visual reference for the minimal interface and screen states.
- Retain the established purple accent direction unless asked to change it.
- Keep Online (Groq) and Offline (Whisper) equally discoverable.
- Show the active mode, engine readiness, and relevant model information clearly.
- Distinguish setup-required, downloading, ready, recording, paused, processing, and error states.
- Keep transcript experience shared across both engines.
- Preserve timestamped transcript segments and Copy, Share, Clear, and Activity Trail behaviours unless explicitly changed.
- Settings must explain engine-specific requirements and privacy implications.
- A missing Groq API key must never block Offline (Whisper).
- Provide actionable recovery paths for model, permission, connectivity, credential, and transcription failures.
- Do not add decorative/non-functional controls.
- Validate supported Android viewport sizes, safe areas, system bars, keyboard visibility, and scrolling.

## Data, persistence, and state

- Read `specs/functional_design_reference.md` for high-level requirements on application state management
- Separate persistent configuration from transient runtime state.
- Persist only what is needed to restore settings, models, sessions, and transcripts.
- Keep transcript persistence shared between engines.
- Use explicit state transitions rather than allowing unrelated UI components to mutate recording or engine state independently.
- Handle app restarts, interrupted downloads, and stale sessions deliberately.
- Define audio retention and cleanup behaviour.
- Avoid duplicate sources of truth for engine status, recording status, or selected mode.

## Error handling and observability

- Use consistent error types/codes across native services and the web UI.
- Distinguish recoverable errors from terminal failures.
- Provide concise user-facing messages and actionable recovery options.
- Preserve useful diagnostics without logging API keys, authorization headers, or sensitive audio.
- Do not swallow errors or replace failure details with generic success states.
- Report progress only when the underlying operation can provide meaningful progress.

## Testing and validation

Choose the narrowest validation that proves the changed behaviour, then run broader tests when shared architecture is affected.

Consider relevant tests for:
- Web component and state behaviour.
- Native service and engine-manager behaviour.
- Bridge command/event contracts.
- Whisper model loading and transcription.
- Vulkan initialization and CPU fallback.
- Groq authentication, request formatting, and error handling.
- Recording start, pause, resume, stop, and cancellation.
- Mode switching and configuration independence.
- Transcript normalization and persistence.
- Offline operation with airplane mode enabled after model download.
- Permission denial and Android lifecycle interruptions.
- Model download interruption, validation, and recovery.

Do not claim tests passed unless they were actually run. Preserve complete failure output. If a test cannot run in the current environment, state why and identify remaining manual/device validation.

## Agent workflow

For each task:

1. Understand the request and identify affected screens, workflows, services, and acceptance criteria.
2. Inspect the existing implementation and tests before editing.
3. Read only the relevant files under `specs/functional_design_reference.md`, `specs/visualwireframes/` and/or `specs/architecture/`.
4. Follow any more specific `AGENTS.md` files in affected directories.
5. For cross-cutting or risky changes, state a small implementation plan before editing.
6. Implement incrementally; preserve existing behaviour and avoid unrelated cleanup.
7. Run focused tests, builds, linting, or device checks appropriate to the change.
8. Summarize changed files, behaviour, validation performed, limitations, and decisions needing review.

When the target architecture or bridge contract changes, update the relevant documentation under `specs/architecture/`. When intended UI design changes, update or add the relevant reference under `specs/visualwireframes/`.

## OpenWiki

<!-- OPENWIKI:START -->

This repository has a generated `openwiki/` evidence index. It is optional just-in-time context, not required startup reading.

- Do not enumerate, preload, or search wikis at task start. Use retrieval when the user asks for it, when unfamiliar architecture or dependency behavior materially affects the task, or when source inspection leaves an important uncertainty. Stop once the question is grounded.
- When those conditions apply and OpenWiki retrieval tools are available, use `openwiki_search` for just-in-time context and `openwiki_read` for the relevant complete sections. If search returns `workspace_required`, ask which listed workspace to use and retry with its ID.
- Use `openwiki_list_workspaces` or `openwiki_list_wikis` when workspace membership itself needs to be discovered.
- If the retrieval tools are unavailable, read `openwiki/quickstart.md` and follow its links to the relevant pages.
- Treat source code and tests as authoritative. A brief's unknowns and review items are verification gaps, not automatic requirements.
- Prefer the narrowest quiet validation that proves the changed behavior. Preserve complete failure output.

Use the repository's documented maintenance process to refresh generated pages after source changes. Check its configuration and completed runs before relying on automatic updates. Do not hand-edit generated OpenWiki pages unless explicitly asked; prefer updating source code/docs and letting OpenWiki regenerate.

<!-- OPENWIKI:END -->
