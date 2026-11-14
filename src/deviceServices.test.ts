import { afterEach, expect, it, vi } from 'vitest';
import { monitorConnectivity, parseCredentials } from './deviceServices';
import { TranscriptDocument } from './transcriptDocument';
afterEach(() => vi.unstubAllGlobals());

it.each([
  ['GITHUB_PERSONAL_ACCESS_TOKEN=github_pat_example', 'github_pat_example'],
  ['GITHUB_PERSONAL_ACCESS_TOKEN="github_pat_example"', 'github_pat_example'],
  ['https://alice:ghp_example@github.com', 'ghp_example'],
  ['https://github_pat_example@github.com', 'github_pat_example'],
  ['username=alice\npassword=ghp_example', 'ghp_example'],
  ['ghp_example', 'ghp_example'],
])('imports supported credential format without retaining its file: %s', (input, token) => {
  expect(parseCredentials(input)).toBe(token);
});
it.each(['https://alice:token@evil.example', 'not a token', '', 'https://github.com'])('rejects unsupported credentials: %s', input => {
  expect(() => parseCredentials(input)).toThrow();
});
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
