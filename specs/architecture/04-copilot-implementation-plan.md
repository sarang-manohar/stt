# Dictation App --- GitHub Copilot Implementation Plan

## Objective

Refactor the existing Dictation application into a modular hybrid
Android architecture supporting: - Web-based UI. - Native Android
Whisper inference. - Direct Groq API transcription. - Offline and Online
operating modes.

The refactoring must preserve existing working transcription
functionality.

## Non-negotiable requirements

1.  Preserve the existing working transcription functionality.
2.  Do not rewrite the Whisper runtime or Groq integration unless
    required.
3.  Separate audio recording from transcription execution.
4.  Introduce a common `TranscriptionEngine` interface.
5.  Implement `WhisperEngine` and `GroqEngine` adapters.
6.  Normalize transcription output into a common `TranscriptSegment`
    structure.
7.  Centralize recording and engine lifecycle management.
8.  Separate persistent configuration from transient runtime state.
9.  Keep model management independent of transcription execution.
10. Introduce a credential storage abstraction for the Groq API key.
11. Ensure offline transcription does not depend on Groq, network
    connectivity, or API credentials.
12. Preserve existing model download, Vulkan, and CPU fallback
    functionality.
13. Keep audio processing inside the native Android layer.
14. Avoid sending audio buffers through the WebView bridge.
15. Avoid unnecessary dependencies.

## Implementation roadmap

### Phase 0 --- Codebase discovery

Inspect: - Frontend framework and build process. - Android
application/container architecture. - Web-to-native communication
mechanism. - Microphone and audio recording implementation. - Whisper
runtime and native dependencies. - Model download and storage
mechanism. - Vulkan and CPU execution paths. - Groq API integration and
API key storage. - Transcript management and persistence. - Application
state management.

Deliver a current-state architecture document before modifying source
files.

### Phase 1 --- Native bridge

Establish the TypeScript-to-Kotlin communication contract.

Implement: - Typed commands. - Typed events. - Initial application state
retrieval. - Engine status events. - Recording lifecycle events. - Model
download events. - Standardized error events.

Use Capacitor's plugin API if the project uses Capacitor. Otherwise,
adapt the contract to the existing native WebView bridge.

### Phase 2 --- Audio architecture

Extract a shared native audio capture service.

Responsibilities: - Microphone permission handling. - Start, pause,
resume, and stop. - Audio session management. - Temporary audio
storage. - Audio metadata and format information. - Cancellation and
cleanup.

Do not create separate audio recording implementations for Whisper and
Groq.

### Phase 3 --- Engine abstraction

Introduce: - `TranscriptionEngine` - `EngineManager` - `WhisperEngine` -
`GroqEngine`

Wrap the existing Whisper and Groq integrations in adapters. Avoid
changing the underlying STT algorithms.

### Phase 4 --- Storage and security

Implement or adapt: - Model repository. - Model download manager. -
Transcript repository. - Configuration repository. - Secure credential
provider. - Standardized application errors.

Move Groq API key handling out of JavaScript local storage and into
native secure credential storage.

### Phase 5 --- UI redesign

Implement the minimal wireframes: - Main dictation screen. -
Online/Offline mode selector. - Engine readiness indicators. -
Transcript panel. - Recording controls. - Settings navigation. - Whisper
settings. - Groq settings. - Model download states. - Activity Trail.

The UI must communicate with native services through the typed bridge
and application state store.

### Phase 6 --- Integration and testing

Validate both transcription engines, offline operation, Android
lifecycle, permissions, error handling, and deployment.

## Task 0 --- Architecture discovery prompt

Use this prompt first. It is deliberately read-only.

------------------------------------------------------------------------

# GitHub Copilot Agent --- Task 0: Architecture Discovery

## Objective

Inspect the existing Dictation application and produce a
technology-specific architecture document for a hybrid Android
application with: - Web-based UI. - Native Android Whisper inference. -
Direct Groq API transcription. - Offline and Online operating modes.

## Instructions

Do not modify any source files.

Inspect the existing repository and identify:

1.  Frontend framework and build process.
2.  Current Android application/container architecture.
3.  How the web frontend communicates with native Android code.
4.  Current microphone/audio recording implementation.
5.  Whisper runtime implementation and native dependencies.
6.  Whisper model download and storage mechanism.
7.  Vulkan and CPU execution paths.
8.  Groq API integration and API key storage.
9.  Transcript management and persistence.
10. Current application state management.

## Deliverables

Create `docs/architecture-discovery.md` containing: - Current-state
component diagram. - Current recording and transcription sequence
diagrams. - Existing source-code module inventory. - Existing technology
stack. - Dependency relationships. - Identified architectural
coupling. - Security observations. - Potential performance
bottlenecks. - Proposed target architecture. - Incremental migration
strategy.

## Important constraints

-   Do not assume the project uses Capacitor.
-   Determine whether the existing Android integration is Capacitor,
    custom WebView, Trusted Web Activity, or another implementation.
-   Do not replace the existing Whisper runtime.
-   Do not propose moving native inference into JavaScript or
    WebAssembly.
-   Identify what can be reused.
-   Clearly distinguish verified implementation details from
    recommendations.

At the end, provide a prioritized implementation plan and list
architectural decisions requiring developer approval.

Do not begin refactoring.

------------------------------------------------------------------------

## Task 1 --- Architecture implementation prompt

Use after reviewing Task 0 findings.

------------------------------------------------------------------------

# GitHub Copilot Agent --- Task 1: Implement Target Architecture

## Objective

Refactor the existing Dictation application into a modular hybrid
architecture while preserving current working transcription
functionality.

## Target architecture

### Web layer

-   Dictation UI
-   Settings UI
-   Transcript UI
-   Activity Trail
-   Application state store
-   Typed native bridge client

### Native Android layer

-   DictationController
-   AudioRecorder
-   EngineManager
-   SessionManager
-   ModelManager
-   TranscriptManager
-   ConfigurationManager
-   CredentialRepository

### Transcription engines

-   WhisperEngine
-   GroqEngine

### Infrastructure

-   Existing Whisper native runtime
-   Existing model files and download mechanism
-   Groq HTTP client
-   Android Keystore-backed credential storage
-   Room/SQLite persistence

## Implementation requirements

1.  Reuse the existing native Whisper implementation.
2.  Reuse the existing Groq integration wherever practical.
3.  Separate recording from transcription execution.
4.  Introduce a shared transcription interface.
5.  Implement independent engine configuration.
6.  Keep audio processing inside the native Android layer.
7.  Avoid sending audio buffers through the WebView bridge.
8.  Keep Groq API credentials outside JavaScript storage.
9.  Normalize transcription results.
10. Implement standardized application errors.
11. Preserve offline operation without network connectivity.
12. Avoid unnecessary dependencies.

## Development sequence

1.  Implement the bridge and domain contracts.
2.  Extract the recording service.
3.  Introduce the engine abstraction and adapt the existing engines.
4.  Implement storage and configuration boundaries.
5.  Connect the redesigned frontend.

## Testing

Run regression tests after every architectural change.

Verify: - Offline transcription. - Online transcription. - Model
download. - Vulkan initialization. - CPU fallback. - Recording
lifecycle. - Mode switching. - Credential management. - Transcript
persistence.

Do not perform a wholesale rewrite.

Provide a summary of changed files, architectural decisions, and test
results at the end.

------------------------------------------------------------------------

## Copilot implementation checklist

-   [ ] Current-state architecture documented.
-   [ ] Existing WebView/Capacitor integration identified.
-   [ ] Typed native bridge defined.
-   [ ] Audio recording extracted into a shared service.
-   [ ] Common transcription interface implemented.
-   [ ] Whisper adapter implemented.
-   [ ] Groq adapter implemented.
-   [ ] Engine manager implemented.
-   [ ] Session manager implemented.
-   [ ] Transcript normalization implemented.
-   [ ] Model repository implemented.
-   [ ] Model download recovery implemented.
-   [ ] Secure credential provider implemented.
-   [ ] Persistent and runtime state separated.
-   [ ] UI connected through native bridge.
-   [ ] Offline regression tests passed.
-   [ ] Online regression tests passed.
-   [ ] Android device validation completed.

## Implementation constraints

-   Do not introduce unnecessary dependencies.
-   Do not replace existing working implementations simply to conform to
    the proposed architecture.
-   Do not expose API keys in application logs.
-   Implement one architectural boundary at a time.
-   Run regression tests after each meaningful change.
-   Do not perform a large-scale rewrite without reviewing the discovery
    document and approving the migration plan.
