import { afterEach, expect, it, vi } from 'vitest';
import { monitorConnectivity } from './deviceServices';
import { TranscriptDocument } from './transcriptDocument';
afterEach(() => vi.unstubAllGlobals());

it('updates browser network indicators and removes listeners on cleanup', async () => {
  const target = new EventTarget();
  vi.stubGlobal('window', target); vi.stubGlobal('navigator', { onLine: true });
  const updates = vi.fn();
  const dispose = await monitorConnectivity(updates);
  expect(updates).toHaveBeenLastCalledWith(true);
  vi.stubGlobal('navigator', { onLine: false }); target.dispatchEvent(new Event('offline'));
  expect(updates).toHaveBeenLastCalledWith(false);
  dispose(); target.dispatchEvent(new Event('online'));
  expect(updates).toHaveBeenCalledTimes(2);
});
it('restores saved timestamp entries and saves literal edits into the shared JSON snapshot', () => {
  const document = new TranscriptDocument();
  document.restore({ '00:00': 'नमस्ते', '00:08': 'world' });
  document.edit('00:08', '<literal> दुनिया');
  expect(document.text).toBe('नमस्ते <literal> दुनिया');
  expect(document.toJSON()['00:08']).toBe('<literal> दुनिया');
  document.append('new text', Date.now());
  expect(document.toJSON()['00:08']).toBe('<literal> दुनिया');
  expect(Object.keys(document.toJSON())).toHaveLength(3);
});
it('rejects invalid restored documents rather than overwriting them', () => {
  const document = new TranscriptDocument();
  expect(() => document.restore({ invalid: 'text' })).toThrow();
  expect(() => document.restore({ '00:00': 3 } as unknown as Record<string, string>)).toThrow();
});
