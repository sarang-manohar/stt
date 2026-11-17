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
