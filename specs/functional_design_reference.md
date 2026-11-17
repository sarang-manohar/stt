# Dictation App – UI/UX Implementation Specification

## 1. Product Overview

The application is an Android-friendly dictation application supporting two transcription engines:

1. **Offline Whisper:** Uses a locally downloaded Whisper STT model. Audio processing happens entirely on the device.
2. **Online Groq:** Sends audio directly to Groq for transcription. Requires a user-provided Groq API key.

The application must support complete offline operation once the Whisper model has been downloaded.

### Design principles

- Minimal, distraction-free interface.
- Retain the existing purple accent colour.
- Use a clean, light background.
- Rounded cards and subtle borders.
- Consistent typography and spacing.
- Make transcription mode and engine readiness immediately visible.
- Never require Groq configuration to use offline transcription.

---

## 2. Screen Architecture

### Screen A: Main Dictation Screen

**Header**
- Application logo and name: Dictation.
- Settings gear icon.
- Active engine indicator.

**Transcription mode selector**
- Segmented control:
  - Offline (Whisper)
  - Online (Groq)

**Engine status**
- Ready
- Recording
- Paused
- Download required
- Downloading
- Setup required
- Connection error

Show the active model name as secondary information.

**Transcript container**
- Section title: TRANSCRIPT.
- Actions: Copy, Share, Clear.
- Scrollable transcription content.
- Timestamp for each transcription segment.
- Empty state: "Tap Start to dictate."

**Recording controls**

Idle:
- Start button.

Recording:
- Pause button.
- Stop button.
- Recording duration.
- Clear recording indicator.

Paused:
- Resume button.
- Stop button.

Processing:
- Processing indicator.
- Processing status text.

**Activity Trail**
- Collapsible section at the bottom.
- Display recent transcription sessions or activity events.
- Show session count.
- Expand to inspect previous activity.

### Screen B: Settings

Use a dedicated settings screen rather than a large modal.

Sections:

1. Transcription
   - Mode, language and model configuration.

2. Online (Groq)
   - API key configuration.
   - Connection status.
   - Test connection.
   - Update/remove API key.

3. Offline (Whisper)
   - Local model status.
   - Download model.
   - Model selection.
   - Download progress.

4. General
   - Application preferences.

5. About
   - Application version and information.

### Screen C: Transcription Settings

**Transcription mode**

Radio/segmented selection:

- Online – Groq
- Offline – Whisper

Descriptions:
- Online: Cloud transcription using Groq.
- Offline: On-device transcription using Whisper.

**Language**
- Dropdown selector.
- Support automatic detection if supported by the transcription engine.
- Otherwise allow explicit language selection.

**Model**

For Offline:
- Display available local Whisper models.
- Show model size.
- Show download/readiness status.

For Online:
- Display the configured Groq transcription model.

Important: Model selections must be engine-specific. Switching modes must not accidentally overwrite the other engine's configuration.

### Screen D: Offline Whisper Settings

Display:

- Model name.
- Model size.
- Download status.
- Download button.
- Download progress.
- Cancel download action.
- Language selection.
- Execution backend information.

Model states:

| State | UI behaviour |
|---|---|
| Not downloaded | Show Download button |
| Downloading | Show progress and Cancel |
| Downloaded | Show Ready |
| Download failed | Show error and Retry |
| Loading | Show Loading indicator |
| Ready | Allow transcription |
| Runtime error | Show error and recovery action |

Display execution information:
- Vulkan preferred.
- CPU fallback.

The currently implemented model is multilingual tiny q5_1 (32 MB). Do not expose models that are not actually supported by the application.

### Screen E: Online Groq Settings

Display:

- Groq API key field.
- Masked API key by default.
- Show/hide control.
- Save/update action.
- Test Connection action.
- Remove Key action.
- Connection status.

API key states:

| State | UI behaviour |
|---|---|
| Missing | Show setup prompt |
| Entered | Allow saving |
| Saved | Display masked key |
| Testing | Show progress |
| Valid | Show Connection verified |
| Invalid | Show validation error |
| Connection failure | Show retry option |

Privacy information:

"Audio is sent directly to Groq for transcription. Your API key is stored locally on this device. No application server is involved."

Do not display or log the complete API key after saving.

### Screen F: First-time Groq Configuration

When the user selects Online mode without a saved API key:

Display a dialog:

Title: Connect to Groq

Description:
"Enter your Groq API key to start online dictation."

Components:
- API key input.
- Show/hide key control.
- Save Key button.
- Not now / Use Offline Instead action.

The user must be able to dismiss this dialog and continue using Offline mode.

---

## 3. Application State Management

Maintain independent configuration for both engines.

Suggested state structure:

- activeMode: offline | online
- offlineModelStatus: not_downloaded | downloading | loading | ready | error
- offlineModelName
- offlineDownloadProgress
- offlineExecutionBackend: vulkan | cpu
- onlineApiKeyStatus: missing | saved | valid | invalid
- onlineConnectionStatus: unknown | testing | connected | error
- onlineModelName
- selectedLanguage
- recordingStatus: idle | recording | paused | processing | error
- transcriptSegments
- activityTrail

The actual application architecture should retain existing service and transcription logic wherever possible.

### Important state rules

1. Switching transcription mode must not reset the transcript.
2. Offline and Online model configurations must remain independent.
3. Settings should be locked while recording or audio is queued, as in the existing application.
4. Do not start recording if the selected engine is not ready.
5. If an engine is unavailable, explain why and offer the appropriate configuration action.
6. A missing Groq API key must never prevent Offline mode from functioning.
7. Persist non-sensitive preferences locally.
8. Store the API key locally using an appropriate secure storage mechanism for the deployment environment.

---

## 4. User Workflows

### Workflow 1: First-time Offline User

1. Launch application.
2. Select Offline (Whisper).
3. Check model availability.
4. If model is missing, display Download model.
5. Download the model.
6. Display Ready.
7. Tap Start.
8. Record audio.
9. Stop recording.
10. Transcribe using the local model.
11. Display timestamped transcript.

Expected result: Fully functional offline dictation.

### Workflow 2: Returning Offline User

1. Launch application.
2. Restore previous Offline selection.
3. Check local model readiness.
4. Display Ready.
5. Start dictation immediately.

No API key or network connection should be required.

### Workflow 3: First-time Online User

1. Launch application.
2. Select Online (Groq).
3. Check API key availability.
4. If missing, display Connect to Groq.
5. Enter API key.
6. Save key.
7. Test connection.
8. Display Connection verified.
9. Start dictation.
10. Send audio directly to Groq.
11. Display timestamped transcript.

### Workflow 4: Returning Online User

1. Restore Online selection.
2. Check saved API key.
3. Validate connection when needed.
4. Display engine readiness.
5. Allow dictation.

### Workflow 5: Switching Engines

1. User switches between Offline and Online.
2. Update active engine.
3. Preserve independent model configurations.
4. Check readiness of the newly selected engine.
5. If ready, allow recording.
6. If not ready, show the relevant setup prompt.

---

## 5. Error Handling

### Offline errors
- Model missing.
- Model download interrupted.
- Insufficient storage.
- Model loading failure.
- Vulkan initialization failure.
- CPU fallback.
- Transcription failure.

### Online errors
- Missing API key.
- Invalid API key.
- Network unavailable.
- Groq API error.
- Request timeout.
- Transcription failure.

Each error should provide:
- Concise explanation.
- Relevant recovery action.
- Retry option where applicable.

---

## 6. UI Component Inventory

| Component | Responsibility |
|---|---|
| AppHeader | Logo, title and settings |
| ModeSelector | Online/Offline selection |
| EngineStatus | Readiness and model information |
| TranscriptPanel | Display transcript segments |
| TranscriptToolbar | Copy, Share, Clear |
| RecordingControls | Start, Pause, Resume, Stop |
| ActivityTrail | Expandable activity history |
| SettingsScreen | Settings navigation |
| TranscriptionSettings | Mode, language and model |
| WhisperSettings | Local model configuration |
| ModelDownloadCard | Download status and progress |
| GroqSettings | API key and connection |
| ApiKeyDialog | First-time key configuration |
| StatusIndicator | Ready, Recording, Error, etc. |
| PrivacyBanner | Audio processing disclosure |

---

## 7. Acceptance Criteria

- [ ] User can switch between Online and Offline modes.
- [ ] Offline transcription works without an API key.
- [ ] Offline transcription works without internet connectivity after model download.
- [ ] Whisper model download displays progress.
- [ ] Interrupted downloads have a recovery path.
- [ ] Online mode prompts for an API key when missing.
- [ ] API key is masked after saving.
- [ ] API key can be updated and removed.
- [ ] Connection testing provides clear feedback.
- [ ] Switching engines preserves individual configurations.
- [ ] Recording controls work in both modes.
- [ ] Transcript timestamps are retained.
- [ ] Copy, Share and Clear actions work.
- [ ] Activity Trail remains accessible.
- [ ] Settings cannot be changed during active recording or queued audio.
- [ ] Privacy messaging clearly distinguishes Online and Offline processing.
- [ ] UI adapts to different Android screen sizes.

---

## 8. Implementation Guidance for GitHub Copilot

Treat this specification as a UI/UX reference, not an instruction to rewrite the existing transcription architecture.

Implementation priorities:

1. Inspect the existing application structure and identify current components.
2. Preserve working transcription services.
3. Introduce the redesigned main screen.
4. Implement the mode selector and independent engine status.
5. Refactor settings into separate sections.
6. Improve Groq API key configuration.
7. Improve Whisper model download and readiness presentation.
8. Implement all recording and error states.
9. Validate the application on mobile screen sizes.
10. Run regression tests for both transcription engines.

Avoid introducing unnecessary dependencies or changing existing STT integrations just to accommodate the UI redesign.

**Primary objective:** Deliver a minimal, polished dictation interface where Online Groq and Offline Whisper are equally accessible, independently configurable and clearly distinguishable.
