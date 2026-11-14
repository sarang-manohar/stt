import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { saveDocument } = vi.hoisted(() => ({ saveDocument: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(), getPlatform: vi.fn() },
  registerPlugin: vi.fn(() => ({ save: saveDocument })),
}));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' }, Encoding: { UTF8: 'utf8' },
  Filesystem: { writeFile: vi.fn() },
}));
vi.mock('@capacitor/share', () => ({ Share: { share: vi.fn() } }));

import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { saveTranscript, serializeTranscript, shareTranscript } from './exportTranscript';

const entries = { '00:00': 'आज हमारी team meeting है।', '00:08': '', '01:05': '<literal> Next.' };
const data = JSON.stringify(entries, null, 2);

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('navigator', {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function mockDownload() {
  vi.useFakeTimers();
  const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
  vi.stubGlobal('document', { createElement: vi.fn(() => link), body: { append: vi.fn() } });
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:transcript');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  return { link, create, revoke };
}

describe('timestamp-keyed JSON for every export', () => {
  it('serializes the exact displayed entries, including Unicode, empty rows and pauses', () => {
    expect(serializeTranscript(entries)).toBe(data);
    expect(JSON.parse(serializeTranscript(entries))).toEqual(entries);
  });

  it('saves UTF-8 JSON with the Android document picker rather than a cache download', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    saveDocument.mockResolvedValue({ cancelled: false });
    expect(await saveTranscript(entries)).toBe(true);
    expect(saveDocument).toHaveBeenCalledWith({ filename: 'transcript.json', data, mimeType: 'application/json' });
    expect(Filesystem.writeFile).not.toHaveBeenCalled();
    expect(Share.share).not.toHaveBeenCalled();
  });

  it('reports save cancellation without claiming success', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    saveDocument.mockResolvedValue({ cancelled: true });
    expect(await saveTranscript(entries)).toBe(false);
  });

  it('propagates save failures', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    saveDocument.mockRejectedValue(new Error('disk full'));
    await expect(saveTranscript(entries)).rejects.toThrow('disk full');
  });

  it('writes JSON to private cache and opens the native file share chooser', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Filesystem.writeFile).mockResolvedValue({ uri: 'file:///cache/transcript.json' });
    await shareTranscript(entries);
    expect(Filesystem.writeFile).toHaveBeenCalledWith({
      path: 'transcript.json', data, directory: 'CACHE', encoding: 'utf8',
    });
    expect(Share.share).toHaveBeenCalledWith({
      title: 'Transcript JSON', files: ['file:///cache/transcript.json'], dialogTitle: 'Save or share transcript',
    });
  });

  it('does not open the chooser after a filesystem failure', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Filesystem.writeFile).mockRejectedValue(new Error('disk full'));
    await expect(shareTranscript(entries)).rejects.toThrow('disk full');
    expect(Share.share).not.toHaveBeenCalled();
  });

  it('propagates native share cancellation', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(Filesystem.writeFile).mockResolvedValue({ uri: 'file:///cache/transcript.json' });
    vi.mocked(Share.share).mockRejectedValue(new Error('cancelled'));
    await expect(shareTranscript(entries)).rejects.toThrow('cancelled');
  });

  it('uses the browser file share sheet when JSON files are supported', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal('navigator', { share, canShare });
    await shareTranscript(entries);
    const payload = share.mock.calls[0][0];
    expect(payload.title).toBe('Transcript JSON');
    expect(payload.files[0].name).toBe('transcript.json');
    expect(payload.files[0].type).toBe('application/json');
    expect(await payload.files[0].text()).toBe(data);
    expect(canShare).toHaveBeenCalledWith({ files: payload.files });
  });

  it('shares JSON text on browsers with only text sharing', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share, canShare: () => false });
    await shareTranscript(entries);
    expect(share).toHaveBeenCalledWith({ title: 'Transcript JSON', text: data });
  });

  it('does not fall back to downloading after browser share cancellation', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'));
    vi.stubGlobal('navigator', { share });
    await expect(shareTranscript(entries)).rejects.toThrow('Cancelled');
    expect(share).toHaveBeenCalledOnce();
  });

  for (const action of [saveTranscript, shareTranscript]) {
    it(`${action.name} downloads JSON on the web without a share API and releases its URL`, async () => {
      const { link, create, revoke } = mockDownload();
      await action(entries);
      const blob = create.mock.calls[0][0] as Blob;
      expect(blob.type).toBe('application/json;charset=utf-8');
      expect(await blob.text()).toBe(data);
      expect(link.download).toBe('transcript.json');
      expect(link.click).toHaveBeenCalledOnce();
      expect(link.remove).toHaveBeenCalledOnce();
      expect(Filesystem.writeFile).not.toHaveBeenCalled();
      expect(Share.share).not.toHaveBeenCalled();
      expect(revoke).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1000);
      expect(revoke).toHaveBeenCalledWith('blob:transcript');
    });
  }
});
