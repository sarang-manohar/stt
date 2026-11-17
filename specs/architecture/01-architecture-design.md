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
