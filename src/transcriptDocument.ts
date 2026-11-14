import { stitchTranscript } from './transcriptStitcher';

/** Minutes may exceed 59; chunk starts are relative to the first captured audio. */
export function formatTimestamp(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

/** Volatile text plus deduplicated chunk contributions, committed together. */
export class TranscriptDocument {
  text = '';
  private origin?: number;
  private entries: Record<string, string> = {};
  get hasEntries(): boolean { return Object.keys(this.entries).length > 0; }
  append(incoming: string, timestamp: number): void {
    const origin = this.origin ?? timestamp;
    const key = formatTimestamp((timestamp - origin) / 1000);
    const next = stitchTranscript(this.text, incoming);
    const contribution = next.slice(this.text.length).trim();
    // Separate very short recordings may start in the same second: retain both.
    const value = [this.entries[key], contribution].filter(Boolean).join(' ');
    this.entries[key] = value;
    this.origin = origin;
    this.text = next;
  }
  edit(timestamp: string, text: string): void {
    if (!(timestamp in this.entries)) throw new Error('Unknown timestamp.');
    this.entries[timestamp] = text;
    this.text = Object.values(this.entries).filter(Boolean).join(' ');
  }
  restore(entries: Record<string, string>): void {
    if (!entries || Object.entries(entries).some(([key, value]) => !/^\d+:\d{2}$/.test(key) || typeof value !== 'string')) {
      throw new Error('Invalid saved transcript.');
    }
    this.entries = { ...entries };
    this.text = Object.values(entries).filter(Boolean).join(' ');
    // New sessions continue the timeline without overwriting saved keys.
    const last = Object.keys(entries).at(-1);
    const seconds = last ? last.split(':').reduce((minutes, seconds) => minutes * 60 + Number(seconds), 0) + 1 : 0;
    this.origin = last ? Date.now() - seconds * 1000 : undefined;
  }
  toJSON(): Record<string, string> { return { ...this.entries }; }
  clear(): void {
    this.text = '';
    this.origin = undefined;
    this.entries = {};
  }
}
