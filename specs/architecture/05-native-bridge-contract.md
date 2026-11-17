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
