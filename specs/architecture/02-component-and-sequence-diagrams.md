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
