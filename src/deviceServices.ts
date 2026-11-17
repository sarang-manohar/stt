import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { AudioChunk, TranscriptionResult } from './transcriptionQueue';

interface DeviceServices {
  networkStatus(): Promise<{ online: boolean }>;
  addListener(event: 'networkChanged', listener: (status: { online: boolean }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'modelDownloadProgress', listener: (progress: { bytesReceived: number; totalBytes: number }) => void): Promise<PluginListenerHandle>;
  loadNotes(): Promise<{ document?: Record<string, string> }>;
  saveNotes(options: { document: Record<string, string> }): Promise<void>;
  modelStatus(): Promise<{ ready: boolean }>;
  downloadModel(): Promise<void>;
  cancelModelDownload(): Promise<{ cancelled: boolean }>;
  transcribe(options: { audio: string; language: string }): Promise<{ text: string; language?: string; backend: 'vulkan' | 'cpu' }>;
}
export const device = registerPlugin<DeviceServices>('DictationDevice');
export const native = Capacitor.isNativePlatform();

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
