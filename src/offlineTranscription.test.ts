import { expect, it, vi } from 'vitest';
import { TranscriptionQueue, type AudioChunk } from './transcriptionQueue';
const chunk = (n: number): AudioChunk => ({ blob: new Blob(['wav']), filename: `${n}.wav`, timestamp: n });
const settle = async () => { for (let i = 0; i < 80; i++) await Promise.resolve(); };

it('transcribes offline without an API key or any cloud request, in FIFO order', async () => {
  const fetcher = vi.fn();
  const merge = vi.fn();
  const local = vi.fn(async (audio: AudioChunk) => ({ text: `local ${audio.timestamp}`, model: 'whisper-small-local' as const, language: 'hi' }));
  const queue = new TranscriptionQueue({ getKey: () => '', getTranscript: () => '', isOnline: () => false,
    getLanguage: () => 'hi', transcribeOffline: local, merge, fetch: fetcher });
  queue.enqueue(chunk(1)); queue.enqueue(chunk(2)); await settle();
  expect(fetcher).not.toHaveBeenCalled();
  expect(local.mock.calls.map(([audio]) => audio.timestamp)).toEqual([1, 2]);
  expect(merge.mock.calls.map(([text]) => text)).toEqual(['local 1', 'local 2']);
  expect(queue.snapshot).toEqual({ size: 0, phase: 'idle' });
});

it('falls back to local inference for the same head when connectivity disappears during upload', async () => {
  let online = true;
  const fetcher = vi.fn(async () => { online = false; throw new TypeError('network'); });
  const local = vi.fn(async () => ({ text: 'offline', model: 'whisper-small-local' as const }));
  const merge = vi.fn();
  const queue = new TranscriptionQueue({ getKey: () => 'key', getTranscript: () => '', isOnline: () => online,
    transcribeOffline: local, merge, fetch: fetcher });
  queue.enqueue(chunk(1)); await settle();
  expect(fetcher).toHaveBeenCalledTimes(1); expect(local).toHaveBeenCalledWith(chunk(1), 'auto');
  expect(merge).toHaveBeenCalledTimes(1); expect(queue.snapshot.size).toBe(0);
});

it('retains captured audio when the model is missing, then retries it after installation', async () => {
  const local = vi.fn().mockRejectedValueOnce(new Error('Download the model first.'))
    .mockResolvedValue({ text: 'recovered', model: 'whisper-small-local' });
  const merge = vi.fn();
  const queue = new TranscriptionQueue({ getKey: () => '', getTranscript: () => '', isOnline: () => false,
    transcribeOffline: local, merge });
  queue.enqueue(chunk(1)); await settle();
  expect(queue.snapshot).toEqual({ size: 1, phase: 'paused', error: 'Download the model first.' });
  expect(merge).not.toHaveBeenCalled();
  queue.resume(); await settle();
  expect(merge).toHaveBeenCalledWith('recovered', chunk(1), { text: 'recovered', model: 'whisper-small-local' });
  expect(queue.snapshot.size).toBe(0);
});

it('switches back to cloud transcription for subsequent chunks after reconnection', async () => {
  let online = false;
  const local = vi.fn(async () => ({ text: 'local', model: 'whisper-small-local' as const }));
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ text: 'cloud' })));
  const merge = vi.fn();
  const queue = new TranscriptionQueue({ getKey: () => 'key', getTranscript: () => '', isOnline: () => online,
    transcribeOffline: local, merge, fetch: fetcher });
  queue.enqueue(chunk(1)); await settle(); online = true;
  queue.enqueue(chunk(2)); await settle();
  expect(local).toHaveBeenCalledTimes(1); expect(fetcher).toHaveBeenCalledTimes(1);
  expect(merge.mock.calls.map(([text]) => text)).toEqual(['local', 'cloud']);
});
