## **Product Requirements Document (PRD): Personal Groq STT PWA**

### **1\. Overview & Target Devices**

* **Objective:** Build a zero-backend, installable Progressive Web App (PWA) for personal speech-to-text dictation powered by Groq's Whisper API (whisper-large-v3-turbo).  
* **Target Hardware:** Android smartphones (**Google Pixel 8a**, **HMD Fusion**) via Chrome "Add to Home Screen" (standalone PWA) and desktop browsers.  
* **Repository & Agent Context:** The project repository uses **LangChain OpenWiki** (openwiki/ \+ AGENTS.md) as the source of truth for architectural memory. All implementation work must consult openwiki/ before making changes and update openwiki/ afterward.

### **2\. Core Functional Requirements**

#### **FR-1: Minimalist Single-Screen UI**

* **On App Open:** Display a clean, distraction-free interface featuring:  
  1. A subtle status pill (Ready, Recording MM:SS, Processing queue (N)..., or Retrying...).  
  2. A central, scrollable live transcript container with a one-tap **Copy** button and **Clear** button.  
  3. A single centered thumb-friendly **Record / Stop** button at the bottom.  
* **Screen Wake Lock:** Acquire navigator.wakeLock.request('screen') when recording starts and release it on stop so Android Chrome does not lock the screen and interrupt microphone capture.

#### **FR-2: 16 kHz PCM Ring-Buffer Audio Capture & Sliding Window Slicer**

* **Audio Capture:** Capture raw microphone input via Web Audio API (AudioContext \+ AudioWorkletNode, with ScriptProcessorNode fallback), downsampled to **16,000 Hz, 16-bit Mono PCM** (16,000 samples/sec).  
* **Sliding Window Math:**  
  * **Chunk Duration:** 10.0 seconds (160,000 samples).  
  * **Stride (Step):** 8.0 seconds (128,000 samples).  
  * **Overlap:** 2.0 seconds (32,000 samples) retained at the head of each subsequent chunk (0–10s, 8–18s, 16–26s, etc.) so mid-word and mid-sentence context is preserved across boundaries.  
* **Stop Flush:** When the user taps **Stop**, immediately slice and enqueue any remaining un-emitted audio buffer (\>= 0.5 seconds / 8,000 samples) so trailing words are never lost.  
* **Timestamp Naming & WAV Encoding:** Encode each slice into a valid 16-bit PCM .wav Blob (\~320 KB per 10s chunk) and name it with its exact slice timestamp:  
  * Format: rec\_YYYYMMDD\_HHMMSS\_mmm.wav (e.g., rec\_20261114\_112205\_410.wav).

#### **FR-3: Strict Sequential FIFO Queue & Exponential Backoff Retry**

* **Sequential Execution (Concurrency \= 1):** Enqueue timestamped .wav items into an in-memory FIFO queue. A single worker loop processes items strictly one at a time in chronological creation order. Chunk N+1 never begins uploading until Chunk N has succeeded and merged—guaranteeing zero out-of-order transcript generation.  
* **Groq API Contract:**  
  * **Endpoint:** POST \[https\://api.groq.com/openai/v1/audio/transcriptions\](https\://api.groq.com/openai/v1/audio/transcriptions)  
  * **Auth:** Authorization: Bearer \<GROQ\_API\_KEY\> (loaded from .env.local via VITE\_GROQ\_API\_KEY, with an optional fallback input saved in localStorage if the env var is absent).  
  * **Multipart Fields:** file (the rec\_\*.wav blob), model (whisper-large-v3-turbo), response\_format (json), temperature (0), and prompt (up to the last \~200 characters of the existing transcript to preserve punctuation and context across boundaries).  
* **Failure & Retry Policy:**  
  * On transient errors (network offline/drop, HTTP 408, 429, or 5xx), keep the chunk at the head of the queue (blocking subsequent chunks to preserve sequence) and retry after an exponential backoff delay: 1s → 2s → 4s → 8s (capped at 10s, plus ±200ms jitter).  
  * On fatal auth errors (HTTP 401), pause the queue and surface a clear status message.

#### **FR-4: Deterministic Word-Overlap Deduplication & Stitching**

* Upon receiving a successful transcript (newText) for Chunk N, stitch it onto existingTranscript using a pure deterministic algorithm:  
  1. Extract the last 15 whitespace-delimited tokens of existingTranscript (tailTokens) and the first 15 tokens of newText (headTokens).  
  2. Normalize each token for comparison (lowercase, strip leading/trailing punctuation).  
  3. Find the largest overlap length k (from min(tailTokens.length, headTokens.length) down to 1\) where the suffix of tailTokens matches the prefix of headTokens (requiring exact match for k \= 1..2 on non-stopwords, or allowing a 1-token fuzzy mismatch when k \>= 3 to absorb minor Whisper boundary spelling differences).  
  4. Drop the first k original tokens from newText, preserve original casing/punctuation of the remaining tokens, and append to existingTranscript with a single space.
