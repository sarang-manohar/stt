# Dictation App --- Complete Architecture Pack

```{=html}
<!-- Included file: 01-architecture-design.md -->
```
# Dictation App --- Technology-Specific Architecture

## Overview

Recommended design: a hybrid Android architecture with a web-based
presentation layer and native transcription services.

The web application owns the user experience. The Android native layer
owns audio recording, transcription execution, model management, local
persistence, and secure credential handling.

### Assumptions

-   UI uses HTML, CSS, and JavaScript/TypeScript.
-   The app runs on Android through a native WebView container.
-   Whisper inference uses a native Android-compatible runtime,
    potentially through JNI/C++.
-   Groq is accessed directly from the Android device, without an
    application backend.
-   Whisper models are downloaded and stored locally.
-   The app must work without internet connectivity once the Whisper
    model is installed.

> A normal browser or PWA cannot directly execute an Android native
> Whisper runtime. An Android host application is required to expose
> native functionality to the web frontend.

If no native WebView integration exists, Capacitor with a custom Android
plugin is a suitable option. If a native wrapper already exists, retain
it and implement an equivalent bridge architecture.

## Architectural principles

1.  The UI must not know how transcription is performed.
2.  Audio capture must be independent of the transcription engine.
3.  Whisper and Groq must implement the same transcription contract.
4.  Transcript management must be shared by both engines.
5.  Storage and configuration must be managed independently of the UI.
6.  Audio should remain in native memory or app-private storage; avoid
    passing large audio buffers through the WebView bridge.
7.  Offline transcription must not depend on Groq, network connectivity,
    or API credentials.

## Logical layers

### Web presentation layer

Responsibilities: - Dictation UI - Settings UI - Transcript UI -
Activity Trail - Application state store - Typed native bridge client

Suggested components: `DictationScreen`, `SettingsScreen`,
`WhisperSettings`, `GroqSettings`, `TranscriptView`, `RecordingPanel`,
`ModeSelector`, and `ActivityTrail`.

The presentation layer consumes application state and invokes
application commands. It must not directly call Groq APIs or Whisper
inference functions.

### Native Android application layer

Responsibilities: - Dictation orchestration - Audio recording - Engine
selection and lifecycle - Model lifecycle - Session management -
Transcript persistence - Configuration management - Secure credential
access

Suggested services: `DictationController`, `AudioRecorder`,
`EngineManager`, `SessionManager`, `ModelManager`, `TranscriptManager`,
`ConfigurationManager`, and `CredentialRepository`.

### Transcription engines

#### Whisper engine

-   Load the downloaded model.
-   Initialize the native inference runtime.
-   Manage Vulkan/CPU execution.
-   Transcribe locally captured audio.
-   Return normalized transcript segments.
-   Handle model-loading and inference errors.

#### Groq engine

-   Retrieve the API key from the native credential provider.
-   Prepare the audio request.
-   Submit audio directly to Groq.
-   Handle HTTP responses, authentication failures, network errors, and
    timeouts.
-   Normalize the transcription output.

### Infrastructure layer

  -----------------------------------------------------------------------
  Module                              Responsibility
  ----------------------------------- -----------------------------------
  `AudioCaptureAdapter`               Microphone access and audio
                                      recording

  `WhisperRuntimeAdapter`             Local inference execution

  `ModelRepository`                   Local model availability and
                                      metadata

  `ModelDownloadManager`              Download, progress, cancellation,
                                      and recovery

  `GroqApiClient`                     HTTP integration

  `CredentialProvider`                Secure API-key access

  `LocalDatabase`                     Transcript and activity persistence

  `PreferencesRepository`             Application settings

  `NetworkMonitor`                    Connectivity monitoring
  -----------------------------------------------------------------------

## Transcription engine abstraction

``` typescript
interface TranscriptionEngine {
  initialize(): Promise<void>;
  getStatus(): Promise<EngineStatus>;
  getCapabilities(): EngineCapabilities;
  transcribe(
    audio: AudioInput,
    options: TranscriptionOptions
  ): Promise<TranscriptionResult>;
  dispose(): Promise<void>;
}
```

Recording controls are deliberately excluded. Recording is a shared
responsibility, not an engine responsibility.

Implement `WhisperEngine` and `GroqEngine`. The rest of the application
should not need to know which implementation is active.

## Shared transcript model

``` typescript
interface TranscriptSegment {
  id: string;
  sessionId: string;
  text: string;
  startTime: number;
  endTime?: number;
  engine: "whisper" | "groq";
  createdAt: number;
}
```

Both engines should produce this common representation, allowing one
transcript rendering and persistence implementation.

## Application state architecture

Separate persistent configuration from transient runtime state.

### Persistent state

-   Active mode
-   Selected language
-   Whisper model selection
-   Groq model selection
-   Model installation metadata
-   API credential reference
-   Application preferences

### Runtime state

-   Recording status
-   Current recording duration
-   Download progress
-   Engine initialization status
-   Current processing status
-   Current error
-   Active session

Example:

``` typescript
interface AppConfiguration {
  activeMode: "offline" | "online";
  language: string;
  offline: { modelId: string };
  online: { modelId: string };
}

type RecordingStatus =
  | "idle" | "recording" | "paused" | "processing" | "error";

interface AppRuntimeState {
  recordingStatus: RecordingStatus;
  activeEngineStatus: EngineStatus;
  downloadProgress?: number;
  activeSessionId?: string;
  error?: AppError;
}
```

Use a predictable state-transition mechanism. Avoid allowing individual
UI components to independently modify recording or engine status.

## Storage architecture

  -----------------------------------------------------------------------
  Storage                 Suggested technology    Data
  ----------------------- ----------------------- -----------------------
  Model storage           App-private filesystem  Whisper model binaries
                                                  and metadata

  Application database    Room / SQLite           Transcripts, sessions,
                                                  timestamps, activity

  Preferences             Android DataStore       Non-sensitive
                                                  application
                                                  configuration

  Credentials             Android Keystore-backed Groq API key and
                          storage                 credential metadata
  -----------------------------------------------------------------------

### API-key security

The current browser-local-storage approach should be revisited: -
`localStorage` is not encrypted secure storage. - JavaScript executing
in the same origin can potentially access the key. - An XSS
vulnerability could expose the API key. - Masking the key in the UI does
not protect the stored credential.

For a native Android application, use Android Keystore-backed credential
storage. The key should be entered in the UI, sent through the native
bridge, stored natively, and retrieved by the Groq engine only when
needed.

A client-only application cannot make a provider API key completely
secret from its user or a compromised runtime. A backend proxy can
protect the provider key, but changes the direct-to-Groq architecture
and means audio passes through the backend.

## Key architectural decisions

  -----------------------------------------------------------------------
  Decision                Recommendation          Priority
  ----------------------- ----------------------- -----------------------
  Engine abstraction      Common transcription    Critical
                          interface               

  Recording               Shared audio capture    Critical
                          service                 

  Transcript format       Common normalized data  Critical
                          model                   

  State management        Centralized application High
                          state                   

  Model management        Dedicated model         High
                          repository              

  Credential management   Secure storage          Critical
                          abstraction             

  Persistence             Separate configuration  High
                          and transcript storage  

  Error handling          Standardized engine     High
                          errors                  

  Background processing   Evaluate based on       Medium
                          runtime capabilities    
  -----------------------------------------------------------------------

## Architecture constraints

-   Do not move native Whisper inference into JavaScript or WebAssembly.
-   Do not create separate recording implementations for Groq and
    Whisper.
-   Do not let UI components call native transcription implementations
    directly.
-   Keep the current working Whisper runtime and Groq integration
    wherever practical.
-   Introduce architectural boundaries incrementally rather than
    performing a wholesale rewrite.

------------------------------------------------------------------------

```{=html}
<!-- Included file: 02-component-and-sequence-diagrams.md -->
```
# Dictation App --- Component and Sequence Diagrams

## High-level component diagram

``` mermaid
flowchart TB
    subgraph WEB["WEB PRESENTATION - TypeScript"]
        UI["Dictation UI"]
        SET["Settings UI"]
        TR["Transcript UI"]
        STORE["Application State Store"]
        UI --> STORE
        SET --> STORE
        TR --> STORE
    end

    BRIDGE["Native Bridge - Typed Commands and Events"]

    subgraph ANDROID["ANDROID APPLICATION - Kotlin"]
        CTRL["Dictation Controller"]
        AUDIO["Audio Recorder"]
        EM["Engine Manager"]
        MM["Model Manager"]
        TM["Transcript Manager"]
        CM["Configuration Manager"]
        CTRL --> AUDIO
        CTRL --> EM
        CTRL --> TM
        EM --> MM
        EM --> CM
    end

    subgraph ENGINES["TRANSCRIPTION ENGINES"]
        WH["Whisper Engine"]
        GR["Groq Engine"]
    end

    subgraph INFRA["INFRASTRUCTURE"]
        WR["Whisper Native Runtime"]
        MF["Local Model Files"]
        API["Groq Transcription API"]
        DB["Room Database"]
        KS["Android Keystore"]
    end

    STORE <--> BRIDGE
    BRIDGE <--> CTRL
    EM --> WH
    EM --> GR
    WH --> WR
    WR --> MF
    GR --> API
    GR --> KS
    TM --> DB
    CM --> DB
    MM --> MF
```

## Offline Whisper workflow

``` mermaid
flowchart TD
    A[User selects Offline] --> B[EngineManager]
    B --> C{Whisper model ready?}
    C -->|No| D[Download model]
    D --> E[Validate and store model]
    E --> F[Initialize Whisper]
    C -->|Yes| F
    F --> G[Start audio capture]
    G --> H[Pause / Resume / Stop]
    H --> I[Audio captured]
    I --> J[Whisper inference]
    J --> K[Normalize transcript]
    K --> L[TranscriptManager]
    L --> M[Display and persist]
```

Offline implementation: 1. Check model availability. 2. Initialize the
native runtime. 3. Request microphone permissions. 4. Capture audio
using `AudioRecord`. 5. Save audio temporarily in app-private storage,
or stream it to the native inference layer if supported by the existing
implementation. 6. Run Whisper inference. 7. Normalize the output. 8.
Persist the transcript. 9. Notify the WebView.

Model download must be independent of recording. Validate model
integrity before marking it ready. Use atomic model installation to
avoid exposing partial downloads. Prefer Vulkan when supported and fall
back to CPU when Vulkan initialization fails. Do not make a network
request during offline transcription. Avoid repeatedly initializing the
model for every recording; retain a loaded model while appropriate for
device memory constraints.

## Online Groq workflow

``` mermaid
flowchart TD
    A[User selects Online] --> B{API key configured?}
    B -->|No| C[Connect to Groq]
    C --> D[Save credentials]
    D --> E[Test connection]
    B -->|Yes| F[EngineManager]
    E --> F
    F --> G[Start audio capture]
    G --> H[Pause / Resume / Stop]
    H --> I[Audio captured]
    I --> J[Groq API Client]
    J --> K[Groq Transcription API]
    K --> L[Normalize response]
    L --> M[TranscriptManager]
    M --> N[Display and persist]
```

Make the Groq HTTP request from Kotlin rather than JavaScript. Retrieve
the API key through the native credential provider. Keep audio inside
the native layer. Centralize timeout, retry, cancellation, and network
handling. This remains a direct device-to-Groq integration; no
intermediary application server is required.

## Mode-switching workflow

``` mermaid
flowchart TD
    A[User changes mode] --> B{Recording active?}
    B -->|Yes| C[Prevent mode change]
    B -->|No| D[Update active mode]
    D --> E[Resolve selected engine]
    E --> F{Engine ready?}
    F -->|Yes| G[Display Ready]
    F -->|No| H[Display Setup Required]
    H --> I[Show configuration action]
```

Switching modes must not reset the transcript. Preserve independent
model configurations. Do not automatically download a model or send
audio to Groq without user awareness. Do not switch engines during
active recording or while audio is queued.

## Offline sequence diagram

``` mermaid
sequenceDiagram
    actor User
    participant UI as Web UI
    participant Bridge as Native Bridge
    participant DC as Dictation Controller
    participant AR as Audio Recorder
    participant WE as Whisper Engine
    participant DB as Local Database

    User->>UI: Select Offline
    UI->>Bridge: selectEngine(offline)
    Bridge->>DC: Select Whisper
    DC->>WE: Check readiness
    WE-->>DC: Model ready
    DC-->>UI: Engine Ready

    User->>UI: Start
    UI->>Bridge: startRecording()
    Bridge->>DC: Start session
    DC->>AR: Start capture
    AR-->>UI: Recording started

    User->>UI: Stop
    UI->>Bridge: stopRecording()
    Bridge->>DC: Stop session
    DC->>AR: Stop capture
    AR-->>DC: Audio artifact
    DC->>WE: Transcribe audio
    WE-->>DC: Transcription result
    DC->>DB: Persist transcript
    DC-->>UI: Transcription completed
    UI->>UI: Render transcript
```

## Online sequence diagram

``` mermaid
sequenceDiagram
    actor User
    participant UI as Web UI
    participant Bridge as Native Bridge
    participant DC as Dictation Controller
    participant AR as Audio Recorder
    participant GE as Groq Engine
    participant KS as Android Keystore
    participant Groq as Groq API
    participant DB as Local Database

    User->>UI: Select Online
    UI->>Bridge: selectEngine(online)
    Bridge->>DC: Select Groq
    DC->>GE: Check credentials
    GE->>KS: Retrieve API key
    KS-->>GE: Credential available
    GE-->>DC: Ready
    DC-->>UI: Engine Ready

    User->>UI: Start recording
    UI->>Bridge: startRecording()
    Bridge->>DC: Start session
    DC->>AR: Start capture

    User->>UI: Stop recording
    UI->>Bridge: stopRecording()
    AR-->>DC: Audio artifact
    DC->>GE: Transcribe audio
    GE->>KS: Retrieve API key
    GE->>Groq: HTTPS transcription request
    Groq-->>GE: Transcription response
    GE-->>DC: Normalized result
    DC->>DB: Persist transcript
    DC-->>UI: Transcription completed
```

## Model lifecycle state diagram

``` mermaid
stateDiagram-v2
    [*] --> NotDownloaded
    NotDownloaded --> Downloading
    Downloading --> Validating
    Downloading --> DownloadFailed
    DownloadFailed --> Downloading: Retry
    Validating --> Ready: Checksum valid
    Validating --> DownloadFailed: Invalid model
    Ready --> Loading
    Loading --> Loaded
    Loading --> RuntimeError
    RuntimeError --> Loading: Retry
    Loaded --> Ready: Unload
```

## Audio pipeline

``` mermaid
flowchart TD
    A[Android Microphone] --> B[AudioRecord]
    B --> C[Audio Capture Service]
    C --> D[Audio Session]
    D --> E[Audio Format Normalizer]
    E --> F{Active Engine}
    F -->|Offline| G[Whisper Audio Adapter]
    F -->|Online| H[Groq Audio Adapter]
    G --> I[Native Whisper]
    H --> J[Groq HTTPS API]
    I --> K[Transcript Normalizer]
    J --> K
    K --> L[Transcript Repository]
    L --> M[Web UI]
```

The normalizer must account for sample rate, audio channels, PCM
encoding, duration, file/container format, and provider payload
constraints. Do not assume Whisper and Groq require identical audio
formats.

## Recording strategy

Initially retain the existing stop-to-transcribe workflow: 1. Start
recording. 2. Capture audio. 3. Pause/resume as required. 4. Stop
recording. 5. Submit audio to the selected engine. 6. Receive and render
the transcription.

This is simpler than implementing live streaming transcription. Chunked
transcription can be introduced later if near-real-time updates are
required.

For recordings that must continue while the screen is locked or the app
is backgrounded, evaluate an Android foreground service with the
required microphone permissions and persistent notification. Do not
assume a WebView or JavaScript timer can reliably maintain microphone
capture in the background.

------------------------------------------------------------------------

```{=html}
<!-- Included file: 03-deployment-and-security.md -->
```
# Dictation App --- Deployment, Storage, and Security Design

## Deployment architecture

The application is packaged as an Android APK/AAB containing: - Bundled
web assets: HTML, CSS, JavaScript, fonts, and images. - Native Android
application code. - Native bridge/plugin. - Whisper runtime libraries. -
Required Android resources.

The application should not depend on a remote website to render its core
UI. Bundle the production web build inside the Android application to
support offline startup and consistent UI versions.

## Deployment diagram

``` mermaid
flowchart TD
    subgraph DEVICE["ANDROID DEVICE"]
        subgraph APP["DICTATION APK / AAB"]
            WEB["Bundled Web Assets"]
            NATIVE["Native Kotlin Services"]
            BRIDGE["Typed Native Bridge"]
            RUNTIME["Whisper Native Runtime"]
            DB["Room / SQLite"]
            KEY["Android Keystore"]
            TEMP["Temporary Audio Storage"]
            MODELS["Local Whisper Models"]
        end
        WEB <--> BRIDGE
        BRIDGE <--> NATIVE
        NATIVE --> RUNTIME
        RUNTIME --> MODELS
        NATIVE --> DB
        NATIVE --> KEY
        NATIVE --> TEMP
    end

    GROQ["Groq API"]
    NATIVE -->|Online mode: HTTPS| GROQ
```

## Local storage responsibilities

  -----------------------------------------------------------------------
  Resource                Suggested               Contents
                          location/technology     
  ----------------------- ----------------------- -----------------------
  Whisper models          App-private files       Model binaries and
                          directory               metadata

  Temporary audio         App-private cache/files Audio awaiting
                                                  transcription

  Transcripts             Room / SQLite           Transcript segments and
                                                  sessions

  Preferences             Android DataStore       Non-sensitive
                                                  configuration

  API credentials         Android Keystore-backed Groq API key
                          storage                 
  -----------------------------------------------------------------------

### Model storage

-   Store model files outside the APK when models are downloaded
    separately.
-   Use a dedicated model directory.
-   Download into a temporary location.
-   Verify checksums before installation.
-   Atomically move validated models into the active model directory.
-   Keep model metadata and supported model identifiers in a repository.
-   Recover safely from interrupted downloads.

### Transcript storage

Persist session ID, transcript segment ID, text, start/end timestamps,
engine used, creation timestamp, and optional language/model metadata.

### Preferences

Persist active transcription mode, selected language, Whisper model
selection, Groq model selection, and application preferences. Do not
store secrets in ordinary preferences.

## Secure credential handling

Recommended Groq API key flow: 1. User enters the key in the web UI. 2.
The web UI sends it through the native bridge. 3. Kotlin validates the
request. 4. The credential repository stores it using Android
Keystore-backed protection. 5. Groq engine retrieves it only when making
an API request. 6. The key is never returned to the WebView after
saving.

Never write API keys to Logcat, JavaScript console logs, crash reports,
transcript records, or activity logs.

A client-only application cannot make a provider API key completely
secret from its user or a compromised runtime. A backend proxy can
protect the provider key, but it changes the direct-to-Groq design and
means audio passes through the backend.

## Native bridge security

-   Restrict bridge access to trusted application origins.
-   Expose an allowlist of commands.
-   Validate every command and parameter.
-   Do not expose arbitrary native method invocation.
-   Do not return the complete API key to JavaScript.
-   Avoid transferring large audio buffers through the bridge.
-   Include session IDs in recording and transcription events.
-   Include request IDs for operations that may overlap.
-   Handle navigation and WebView lifecycle safely.

## Audio privacy and lifecycle

-   Keep audio in native memory or app-private storage.
-   Delete temporary audio according to a documented retention policy.
-   Make Online versus Offline processing explicit to the user.
-   Offline audio must not be sent anywhere.
-   Online audio is sent directly to Groq in this design.
-   Consider a foreground service if recording must continue while
    backgrounded or the screen is locked.
-   Handle microphone permission denial and revocation.

## Native runtime and ABI packaging

Package native libraries for the Android ABIs supported by the existing
runtime. If supported, `arm64-v8a` should be a primary target.

Validate native library loading, Vulkan availability, CPU fallback,
device memory constraints, and runtime compatibility with supported
Android versions.

## Release pipeline

``` mermaid
flowchart LR
    A[GitHub Commit] --> B[Web Build]
    B --> C[Android Build]
    C --> D[Unit Tests]
    D --> E[Integration Tests]
    E --> F[APK / AAB]
    F --> G[Device Validation]
    G --> H[Release]
```

The web assets should be built and packaged into the Android application
during release. Version the web frontend, native bridge contract, and
native application together to avoid compatibility issues.

## Test strategy

  Test category         Validation
  --------------------- ------------------------------------------------
  Web unit tests        Components, state transitions, UI
  Native unit tests     Engine manager, session manager, configuration
  Bridge integration    Commands, events, errors, lifecycle
  Whisper integration   Model loading and inference
  Groq integration      Authentication and API responses
  Device testing        Microphone, permissions, memory, backgrounding
  Offline testing       Airplane mode with downloaded Whisper model
  Regression testing    Existing transcription behaviour

### Device test scenarios

1.  Start offline dictation, enable airplane mode, and complete
    transcription.
2.  Start online dictation, disconnect internet, and verify graceful
    failure.
3.  Interrupt a Whisper download and retry.
4.  Start recording and put the application in the background.
5.  Attempt to switch modes while recording.
6.  Restart the application and verify persisted settings.
7.  Force-close during model download and verify recovery.
8.  Test Vulkan initialization failure and CPU fallback.

## Release acceptance criteria

-   Core UI starts without internet.
-   Offline transcription works after model download with airplane mode
    enabled.
-   Online transcription connects directly to Groq.
-   API key is stored outside JavaScript local storage.
-   Model downloads are verified before installation.
-   Partial model files are never treated as ready.
-   Temporary audio cleanup follows the defined retention policy.
-   Native bridge commands are validated.
-   Supported ABIs and Android versions are tested.

------------------------------------------------------------------------

```{=html}
<!-- Included file: 04-copilot-implementation-plan.md -->
```
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

------------------------------------------------------------------------

```{=html}
<!-- Included file: 05-native-bridge-contract.md -->
```
# Dictation App --- Native Bridge Contract

## Purpose

The web frontend communicates with the Android native layer through a
typed asynchronous bridge.

The bridge exposes allowlisted application commands and emits events for
long-running operations and state changes. It must not expose arbitrary
native method invocation.

## Commands: Web to Android

  Command                  Purpose
  ------------------------ ------------------------------------
  `getAppState`            Retrieve initial application state
  `selectEngine`           Select Whisper or Groq
  `getEngineStatus`        Check engine readiness
  `startRecording`         Start microphone capture
  `pauseRecording`         Pause capture
  `resumeRecording`        Resume capture
  `stopRecording`          Stop and initiate transcription
  `downloadModel`          Download Whisper model
  `cancelModelDownload`    Cancel download
  `getAvailableModels`     List supported models
  `setLanguage`            Change transcription language
  `saveGroqApiKey`         Securely save API key
  `testGroqConnection`     Validate Groq connectivity
  `removeGroqApiKey`       Remove credentials
  `getTranscriptHistory`   Retrieve previous sessions

## Events: Android to Web

  Event                        Purpose
  ---------------------------- -----------------------------------
  `engineStatusChanged`        Engine readiness
  `recordingStarted`           Recording started
  `recordingPaused`            Recording paused
  `recordingResumed`           Recording resumed
  `recordingStopped`           Recording completed
  `recordingDurationUpdated`   Recording timer
  `transcriptionStarted`       Inference started
  `transcriptionProgress`      Processing progress, if available
  `transcriptionCompleted`     Transcript returned
  `modelDownloadProgress`      Download progress
  `modelDownloadCompleted`     Model ready
  `connectionStatusChanged`    Groq connectivity
  `applicationError`           Standardized error notification

## TypeScript contract example

``` typescript
type EngineType = "offline" | "online";

type RecordingStatus =
  | "idle"
  | "recording"
  | "paused"
  | "processing"
  | "error";

interface EngineStatus {
  engine: EngineType;
  ready: boolean;
  modelName: string;
  status: string;
  message?: string;
}

interface TranscriptResult {
  sessionId: string;
  text: string;
  segments: Array<{
    text: string;
    startTime: number;
    endTime?: number;
  }>;
}

interface DictationNativePlugin {
  getAppState(): Promise<AppState>;

  selectEngine(options: {
    engine: EngineType;
  }): Promise<EngineStatus>;

  startRecording(): Promise<void>;

  pauseRecording(): Promise<void>;

  resumeRecording(): Promise<void>;

  stopRecording(): Promise<void>;

  downloadModel(options: {
    modelId: string;
  }): Promise<void>;

  saveGroqApiKey(options: {
    apiKey: string;
  }): Promise<void>;

  testGroqConnection(): Promise<{
    connected: boolean;
    message?: string;
  }>;

  addListener(
    event: string,
    callback: (data: unknown) => void
  ): Promise<PluginListenerHandle>;
}
```

For a Capacitor implementation, expose the contract through a typed
plugin:

``` typescript
const Dictation =
  registerPlugin<DictationNativePlugin>("Dictation");
```

Use the equivalent registration mechanism if the application has a
custom WebView bridge.

## Bridge behaviour

### Request/response

Use request/response commands to initiate operations and return
immediate acknowledgement or operation results.

### Events

Use events for: - Recording state changes. - Download progress. - Engine
readiness. - Transcription completion. - Errors. - Connectivity changes.

### Correlation and lifecycle

-   Include a session ID in recording and transcription events.
-   Include request IDs for operations that may overlap.
-   Handle WebView navigation and lifecycle changes.
-   Ensure listeners are registered and removed appropriately.
-   Avoid duplicate event subscriptions.
-   Make long-running operations cancellable where appropriate.

## Data transfer constraints

-   Do not transfer large audio buffers through the bridge.
-   Keep audio in native memory or app-private storage.
-   Return normalized transcript data and status information to the
    WebView.
-   Do not return the complete API key to JavaScript.
-   Validate all command parameters.
-   Return standardized error codes and safe user-facing messages.

## Error response example

``` typescript
interface NativeError {
  code: string;
  message: string;
  recoverable: boolean;
  operationId?: string;
  sessionId?: string;
}
```

Proposed error codes: - `MICROPHONE_PERMISSION_DENIED` -
`ENGINE_NOT_READY` - `MODEL_NOT_FOUND` - `MODEL_DOWNLOAD_FAILED` -
`MODEL_LOAD_FAILED` - `VULKAN_INITIALIZATION_FAILED` -
`GROQ_API_KEY_MISSING` - `GROQ_AUTHENTICATION_FAILED` -
`NETWORK_UNAVAILABLE` - `TRANSCRIPTION_FAILED`

These values are proposed contract values and should be reconciled with
existing application errors during implementation.
