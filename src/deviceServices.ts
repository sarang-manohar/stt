import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { AudioChunk, TranscriptionResult } from './transcriptionQueue';

interface DeviceServices {
  networkStatus(): Promise<{ online: boolean }>;
  addListener(event: 'networkChanged', listener: (status: { online: boolean }) => void): Promise<PluginListenerHandle>;
  loadNotes(): Promise<{ document?: Record<string, string>; pending: boolean; configured: boolean }>;
  gitStatus(): Promise<{ pending: boolean; configured: boolean }>;
  saveNotes(options: { document: Record<string, string> }): Promise<void>;
  configureGit(options: { repository: string; credentials: string }): Promise<void>;
  sync(): Promise<{ pending: boolean }>;
  modelStatus(): Promise<{ ready: boolean }>;
  downloadModel(): Promise<void>;
  transcribe(options: { audio: string; language: string }): Promise<{ text: string; language?: string }>;
}
export const device = registerPlugin<DeviceServices>('DictationDevice');
export const native = Capacitor.isNativePlatform();

/** Never read developer credentials into a build. Import explicitly on the device. */
export function parseCredentials(input: string): string {
  const value = input.trim();
  const field = value.match(/^(?:GITHUB_PERSONAL_ACCESS_TOKEN|password|token)\s*=\s*["']?([^\s"']+)["']?\s*$/m);
  if (field) return field[1];
  if (value.startsWith('https://')) {
    const url = new URL(value);
    if (url.hostname !== 'github.com') throw new Error('Only github.com credentials are supported.');
    const token = decodeURIComponent(url.password || url.username);
    if (token) return token;
  }
  if (/^(github_pat_|gh[pousr]_)[A-Za-z0-9_]+$/.test(value)) return value;
  throw new Error('Select a .git_credentials file containing GITHUB_PERSONAL_ACCESS_TOKEN=… or a Git credential URL.');
}

export async function offlineTranscribe(chunk: AudioChunk, language: string): Promise<TranscriptionResult> {
  if (!native) throw new Error('Offline transcription requires the Android app.');
  const bytes = new Uint8Array(await chunk.blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const result = await device.transcribe({ audio: btoa(binary), language: language === 'hinglish' ? 'hi' : language });
  return { ...result, model: 'whisper-tiny-local' };
}

export async function monitorConnectivity(update: (online: boolean) => void): Promise<() => void> {
  if (native) {
    // Register first so changes while querying cannot be lost.
    const handle = await device.addListener('networkChanged', status => update(status.online));
    update((await device.networkStatus()).online);
    return () => { void handle.remove(); };
  }
  const listener = () => update(navigator.onLine);
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  listener();
  return () => { window.removeEventListener('online', listener); window.removeEventListener('offline', listener); };
}
