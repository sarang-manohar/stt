import type { ActivityEvent } from './activityLog';

export type TranscriptionModel = 'whisper-large-v3-turbo' | 'whisper-large-v3';
export type ModelSetting = TranscriptionModel | 'auto';
export interface TranscriptionResult {
  text: string;
  language?: string;
  model: TranscriptionModel | 'whisper-small-local';
}
const languageCode = (language: unknown): string | undefined => {
  if (typeof language !== 'string') return undefined;
  const value = language.trim().toLowerCase();
  if (value === 'hindi' || value === 'hi') return 'hi';
  if (value === 'english' || value === 'en') return 'en';
  return undefined;
};
const modelFor = (language?: string): TranscriptionModel =>
  language === 'hi' || language === 'hinglish' ? 'whisper-large-v3' : 'whisper-large-v3-turbo';

export interface AudioChunk {
  blob: Blob;
  filename: string;
  timestamp: number;
}
export interface QueueState {
  size: number;
  phase: 'idle' | 'processing' | 'retrying' | 'paused';
  retryAt?: number;
  error?: string;
}
interface Options {
  getKey: () => string;
  isOnline?: () => boolean;
  transcribeOffline?: (chunk: AudioChunk, language: string) => Promise<TranscriptionResult>;
  getTranscript: () => string;
  /** ISO-639-1 code, auto (default), or hinglish (sent as hi). */
  getLanguage?: () => string;
  getModel?: () => ModelSetting;
  merge: (text: string, chunk: AudioChunk, result: TranscriptionResult) => void;
  onState?: (state: QueueState) => void;
  onActivity?: (event: ActivityEvent) => void;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  timeoutMs?: number;
}
class RequestError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly status?: number) { super(message); }
}

/** In-memory FIFO; the head remains owned until its response has been merged. */
export class TranscriptionQueue {
  private items: AudioChunk[] = [];
  private running = false;
  private paused = false;
  private detectedLanguage?: string;
  private state: QueueState = { size: 0, phase: 'idle' };
  constructor(private options: Options) {}
  get snapshot(): QueueState { return { ...this.state }; }
  enqueue(chunk: AudioChunk): void {
    this.items.push(chunk);
    this.publish({ ...this.state, size: this.items.length });
    void this.run();
  }
  resume(): void {
    if (this.paused) this.options.onActivity?.({ event: 'transcription.resumed', message: 'Manual retry: transcription queue resumed.', details: { queueSize: this.items.length } });
    this.paused = false;
    void this.run();
  }
  private publish(state: QueueState): void {
    this.state = state;
    this.options.onState?.({ ...state });
  }
  /** Call only between capture sessions with an empty queue. */
  resetDetection(): void {
    if (!this.items.length) this.detectedLanguage = undefined;
  }
  private async transcribe(chunk: AudioChunk): Promise<TranscriptionResult> {
    const language = this.options.getLanguage?.() ?? 'auto';
    if (this.options.isOnline?.() === false) return this.localRequest(chunk, language);
    const setting = this.options.getModel?.() ?? 'auto';
    const model = setting === 'auto'
      ? modelFor(language === 'auto' ? this.detectedLanguage : language) : setting;
    let result: TranscriptionResult;
    try { result = await this.request(chunk, model, language); }
    catch (error) {
      // A connection lost during an upload must keep the same FIFO head.
      if (this.options.isOnline?.() === false) return this.localRequest(chunk, language);
      throw error;
    }
    if (language === 'auto' && result.language && result.text.trim()) {
      this.detectedLanguage = result.language;
      const preferred = modelFor(result.language);
      if (setting === 'auto' && preferred !== model) {
        // Reprocess this same head before committing; never display the probe twice.
        const refined = await this.request(chunk, preferred, language);
        return { ...refined, language: refined.language ?? result.language };
      }
    }
    return result;
  }
  private async localRequest(chunk: AudioChunk, language: string): Promise<TranscriptionResult> {
    this.options.onActivity?.({ event: 'transcription.started', message: 'On-device Whisper transcription starting.', details: { model: 'whisper-tiny-local', language, chunkTimestamp: chunk.timestamp } });
    try {
      if (!this.options.transcribeOffline) throw new Error('Offline transcription is unavailable.');
      return await this.options.transcribeOffline(chunk, language);
    } catch (error) {
      throw new RequestError(error instanceof Error ? error.message : 'Local transcription failed.', false);
    }
  }
  private async request(chunk: AudioChunk, model: TranscriptionModel, language: string): Promise<TranscriptionResult> {
    if (this.options.isOnline?.() === false) return this.localRequest(chunk, language);
    this.options.onActivity?.({ event: 'transcription.started', message: `Transcription starting · ${model} · language: ${language}.`,
      details: { model, language, chunkTimestamp: chunk.timestamp, queueSize: this.items.length } });
    const key = this.options.getKey().trim();
    if (!key) throw new RequestError('Add a Groq API key to continue.', false);
    const form = new FormData();
    form.append('file', chunk.blob, chunk.filename);
    form.append('model', model);
    if (language !== 'auto') form.append('language', language === 'hinglish' ? 'hi' : language);
    form.append('response_format', 'verbose_json');
    form.append('temperature', '0');
    // Use only committed session context, never an English-only seed prompt.
    const prompt = this.options.getTranscript().slice(-200);
    if (prompt) form.append('prompt', prompt);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 30_000);
    try {
      const response = await (this.options.fetch ?? fetch)(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: controller.signal },
      );
      if (!response.ok) {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        throw new RequestError(response.status === 401
          ? 'Groq rejected the API key (401). Update it and retry.'
          : `Groq request failed (${response.status}).${retryable ? '' : ' Queue paused; retry when resolved.'}`, retryable, response.status);
      }
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object' || !('text' in data) || typeof data.text !== 'string') {
        throw new RequestError('Invalid transcription response. Queue paused.', false);
      }
      return { text: data.text, language: languageCode('language' in data ? data.language : undefined), model };
    } catch (error) {
      if (controller.signal.aborted) throw new RequestError('Transcription request timed out.', true);
      if (error instanceof RequestError) throw error;
      if (error instanceof SyntaxError) throw new RequestError('Invalid transcription JSON. Queue paused.', false);
      throw new RequestError('Network error while transcribing.', true);
    } finally { clearTimeout(timer); }
  }
  private async run(): Promise<void> {
    if (this.running || this.paused) return;
    this.running = true;
    let attempts = 0;
    try {
      while (this.items.length && !this.paused) {
        this.publish({ size: this.items.length, phase: 'processing' });
        let result: TranscriptionResult;
        try {
          result = await this.transcribe(this.items[0]);
        } catch (error) {
          const message = error instanceof RequestError ? error.message : 'Unexpected transcription error.';
          this.options.onActivity?.({ event: 'transcription.error', level: 'error', message,
            details: { chunkTimestamp: this.items[0].timestamp, attempt: attempts + 1, retryable: !(error instanceof RequestError) || error.retryable,
              ...(error instanceof RequestError && error.status !== undefined ? { status: error.status } : {}) } });
          if (error instanceof RequestError && !error.retryable) {
            this.paused = true;
            this.publish({ size: this.items.length, phase: 'paused', error: error.message });
            break;
          }
          const base = Math.min(1000 * 2 ** Math.min(attempts++, 4), 10_000);
          const delay = Math.max(0, base + ((this.options.random ?? Math.random)() * 400 - 200));
          this.options.onActivity?.({ event: 'transcription.retry_scheduled', level: 'warning',
            message: `Retry ${attempts} scheduled in ${(delay / 1000).toFixed(1)}s.`,
            details: { attempt: attempts + 1, delayMs: delay, chunkTimestamp: this.items[0].timestamp } });
          this.publish({ size: this.items.length, phase: 'retrying', retryAt: Date.now() + delay, error: message });
          await (this.options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(delay);
          continue;
        }
        // Synchronous commit precedes removal and the next request/prompt.
        try { this.options.merge(result.text, this.items[0], result); }
        catch {
          this.options.onActivity?.({ event: 'transcription.merge_error', level: 'error', message: 'Could not merge transcript. Queue paused.' });
          this.paused = true;
          this.publish({ size: this.items.length, phase: 'paused', error: 'Could not merge transcript. Queue paused.' });
          break;
        }
        this.options.onActivity?.({ event: 'transcription.completed', level: 'success', message: `Transcription complete · ${result.model}.`,
          details: { model: result.model, language: result.language ?? 'unknown', chunkTimestamp: this.items[0].timestamp } });
        this.items.shift();
        attempts = 0;
      }
    } finally {
      this.running = false;
      if (!this.paused) this.publish({ size: this.items.length, phase: 'idle' });
    }
  }
}
