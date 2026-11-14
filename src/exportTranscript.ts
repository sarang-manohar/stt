import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const DocumentSave = registerPlugin<{
  save(options: { filename: string; data: string; mimeType: string }): Promise<{ cancelled: boolean }>;
}>('DocumentSave');

export const serializeTranscript = (entries: Record<string, string>): string => JSON.stringify(entries, null, 2);

/** Save the same timestamp-keyed snapshot displayed on screen. */
export async function saveTranscript(entries: Record<string, string>): Promise<boolean> {
  const data = serializeTranscript(entries);
  if (Capacitor.getPlatform() === 'android') {
    const result = await DocumentSave.save({ filename: 'transcript.json', data, mimeType: 'application/json' });
    return !result.cancelled;
  }
  downloadFile(data, 'transcript.json', 'application/json;charset=utf-8');
  return true;
}

/** Native/browser share chooser, with a JSON download on browsers without sharing. */
export async function shareTranscript(entries: Record<string, string>): Promise<void> {
  const data = serializeTranscript(entries);
  if (Capacitor.isNativePlatform()) {
    const file = await Filesystem.writeFile({
      path: 'transcript.json',
      data,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({ title: 'Transcript JSON', files: [file.uri], dialogTitle: 'Save or share transcript' });
    return;
  }
  if (navigator.share) {
    const file = new File([data], 'transcript.json', { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: 'Transcript JSON', files: [file] });
    } else {
      // Text-only share targets still receive valid timestamp-keyed JSON.
      await navigator.share({ title: 'Transcript JSON', text: data });
    }
    return;
  }
  downloadFile(data, 'transcript.json', 'application/json;charset=utf-8');
}

function downloadFile(data: string, filename: string, type: string): void {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
