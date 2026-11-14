import { encodeWav, recordingFilename, SAMPLE_RATE } from './wavEncoder';
import type { AudioChunk } from './transcriptionQueue';

export const WINDOW_SAMPLES = 160_000;
export const STRIDE_SAMPLES = 128_000;
export const MIN_FLUSH_SAMPLES = 8_000;

/** Fixed-capacity PCM ring. Emission consumes only the stride, retaining overlap. */
export class SlidingWindowSlicer {
  private ring = new Int16Array(WINDOW_SAMPLES);
  private head = 0;
  private length = 0;
  private startSample = 0;
  private total = 0;
  private emittedEnd = 0;
  constructor(private startedAt: number, private emit: (chunk: AudioChunk) => void) {}
  push(samples: Int16Array): void {
    for (const sample of samples) {
      this.ring[(this.head + this.length) % WINDOW_SAMPLES] = sample;
      this.length++;
      this.total++;
      if (this.length === WINDOW_SAMPLES) {
        this.emitWindow();
        this.head = (this.head + STRIDE_SAMPLES) % WINDOW_SAMPLES;
        this.length -= STRIDE_SAMPLES;
        this.startSample += STRIDE_SAMPLES;
      }
    }
  }
  flush(): void {
    // Do not upload a retained overlap by itself when stop follows a full window.
    if (this.length >= MIN_FLUSH_SAMPLES && this.total > this.emittedEnd) this.emitWindow();
    this.head = this.length = 0;
  }
  private emitWindow(): void {
    const samples = new Int16Array(this.length);
    for (let i = 0; i < samples.length; i++) samples[i] = this.ring[(this.head + i) % WINDOW_SAMPLES];
    const timestamp = this.startedAt + this.startSample / SAMPLE_RATE * 1000;
    this.emit({ blob: encodeWav(samples), filename: recordingFilename(timestamp), timestamp });
    this.emittedEnd = this.total;
  }
}

/** Streaming area-average resampling; fractional phase survives input blocks. */
export class PcmResampler {
  private filled = 0;
  private sum = 0;
  private ratio: number;
  constructor(inputRate: number) { this.ratio = inputRate / SAMPLE_RATE; }
  process(input: Float32Array): Int16Array {
    const result: number[] = [];
    for (const value of input) {
      let remaining = 1;
      while (remaining > 1e-9) {
        const weight = Math.min(remaining, this.ratio - this.filled);
        this.sum += value * weight;
        this.filled += weight;
        remaining -= weight;
        if (this.filled >= this.ratio - 1e-9) {
          const sample = Math.max(-1, Math.min(1, this.sum / this.filled));
          result.push(Math.round(sample * (sample < 0 ? 32768 : 32767)));
          this.sum = this.filled = 0;
        }
      }
    }
    return Int16Array.from(result);
  }
}

export class AudioRecorder {
  private context?: AudioContext;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private processor?: AudioWorkletNode | ScriptProcessorNode;
  private mute?: GainNode;
  private slicer?: SlidingWindowSlicer;
  private wakeLock?: WakeLockSentinel;
  private active = false;
  private interrupted = () => this.onInterrupted();
  private visibility = () => {
    if (document.visibilityState === 'visible' && this.active) {
      void this.acquireWakeLock();
      void this.context?.resume().catch(() => this.onInterrupted());
    }
  };
  constructor(private emit: (chunk: AudioChunk) => void, private onInterrupted: () => void = () => {}) {}
  async start(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.context = new AudioContext();
      await this.context.resume();
      const resampler = new PcmResampler(this.context.sampleRate);
      this.slicer = new SlidingWindowSlicer(Date.now(), this.emit);
      const consume = (samples: Float32Array) => this.slicer?.push(resampler.process(samples));
      this.source = this.context.createMediaStreamSource(this.stream);
      try {
        if (!this.context.audioWorklet) throw new Error('AudioWorklet unavailable');
        await this.context.audioWorklet.addModule('/audio-worklet.js');
        const node = new AudioWorkletNode(this.context, 'pcm-capture');
        node.port.onmessage = event => {
          if (event.data instanceof Float32Array) consume(event.data);
        };
        this.processor = node;
      } catch {
        const node = this.context.createScriptProcessor(4096, 1, 1);
        node.onaudioprocess = event => consume(event.inputBuffer.getChannelData(0));
        this.processor = node;
      }
      this.mute = this.context.createGain();
      this.mute.gain.value = 0;
      this.source.connect(this.processor);
      this.processor.connect(this.mute);
      this.mute.connect(this.context.destination);
      this.active = true;
      this.stream.getAudioTracks().forEach(track => track.addEventListener('ended', this.interrupted));
      document.addEventListener('visibilitychange', this.visibility);
      await this.acquireWakeLock();
    } catch (error) {
      await this.stop();
      throw error;
    }
  }
  private async acquireWakeLock(): Promise<void> {
    if (this.wakeLock && !this.wakeLock.released) return;
    try {
      const lock = await navigator.wakeLock?.request('screen');
      if (!this.active) await lock?.release();
      else this.wakeLock = lock;
    } catch { /* Optional capability: permission/battery policy must not block recording. */ }
  }
  async stop(): Promise<void> {
    this.active = false;
    document.removeEventListener('visibilitychange', this.visibility);
    this.source?.disconnect();
    // MessagePort delivery is ordered. Drain captured blocks before flushing.
    if (typeof AudioWorkletNode !== 'undefined' && this.processor instanceof AudioWorkletNode) {
      const node = this.processor;
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 200);
        const listener = (event: MessageEvent) => {
          if (event.data === 'stopped') {
            clearTimeout(timer);
            node.port.removeEventListener('message', listener);
            resolve();
          }
        };
        node.port.addEventListener('message', listener);
        node.port.postMessage('stop');
      });
      node.port.close();
    } else if (this.processor && 'onaudioprocess' in this.processor) this.processor.onaudioprocess = null;
    this.processor?.disconnect();
    this.mute?.disconnect();
    this.stream?.getTracks().forEach(track => {
      track.removeEventListener('ended', this.interrupted);
      track.stop();
    });
    this.slicer?.flush();
    this.slicer = undefined;
    await this.context?.close().catch(() => {});
    await this.wakeLock?.release().catch(() => {});
    this.context = this.stream = this.source = this.processor = this.mute = this.wakeLock = undefined;
  }
}
