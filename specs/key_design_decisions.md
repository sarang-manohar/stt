## Key Design Decisions for UI Enahncements and refined workflow

### A. Make transcription mode visible on the home screen

Use a segmented control:
- Offline (Whisper)
- Online (Groq)
This avoids hiding a fundamental application capability inside settings.

### B. Make readiness independent for each engine

Examples:
- Whisper · Ready
- Whisper · Download required
- Whisper · Downloading (56%)
- Groq · Setup required
- Groq · Ready
- Groq · Connection error

### C. Separate the settings

Instead of one large settings dialog, use a settings screen with individual sections:
- Transcription
- Online (Groq)
- Offline (Whisper)
- General
- About

### D. Preserve privacy transparency

The user should always understand where audio is processed:
- Offline: Audio stays on the device.
- Online: Audio goes directly to Groq. The API key is stored locally.