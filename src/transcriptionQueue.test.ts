import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranscriptionQueue, type AudioChunk } from './transcriptionQueue';

const chunk = (n: number): AudioChunk => ({ blob: new Blob(['wav']), filename: `rec_${n}.wav`, timestamp: n });
const ok = (text: string) => new Response(JSON.stringify({ text }), { status: 200 });
// Allow sequential detection/refinement responses to decode before assertions.
const settle = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
afterEach(() => vi.useRealTimers());

describe('strict FIFO transcription queue', () => {
  it('never starts N+1 until N is merged and builds the prompt from that merge', async () => {
    let release!: (response: Response) => void;
    const events: string[] = [];
    let transcript = 'x'.repeat(250);
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(async (_url, init) => {
      events.push('request 1');
      const form = init!.body as FormData;
      expect(form.get('model')).toBe('whisper-large-v3-turbo');
      expect(form.get('response_format')).toBe('verbose_json');
      expect(form.get('temperature')).toBe('0');
      expect(form.get('prompt')).toBe('x'.repeat(200));
      expect((form.get('file') as File).name).toBe('rec_1.wav');
      expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer secret');
      return new Promise(resolve => { release = resolve; });
    }).mockImplementationOnce(async (_url, init) => {
      events.push('request 2');
      expect((init!.body as FormData).get('prompt')).toBe('first');
      return ok('second');
    });
    const queue = new TranscriptionQueue({ getKey: () => 'secret', getTranscript: () => transcript,
      merge: text => { transcript = text; events.push(`merge ${text}`); }, fetch: fetcher });
    queue.enqueue(chunk(1)); queue.enqueue(chunk(2));
    await settle();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(queue.snapshot.size).toBe(2);
    release(ok('first'));
    await settle();
    expect(events).toEqual(['request 1', 'merge first', 'request 2', 'merge second']);
    expect(queue.snapshot).toEqual({ size: 0, phase: 'idle' });
  });
  it.each([
    ['hi', 'hi'], ['hinglish', 'hi'], ['en', 'en'], ['fr', 'fr'], ['auto', null],
  ])('sends the correct language for %s without a biased fresh-session prompt', async (language, expected) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ok('नमस्ते'));
    const queue = new TranscriptionQueue({ getKey: () => 'key', getTranscript: () => '',
      getLanguage: () => language!, merge: vi.fn(), fetch: fetcher });
    queue.enqueue(chunk(1));
    await settle();
    const form = fetcher.mock.calls[0][1]!.body as FormData;
    expect(form.get('language')).toBe(expected);
    expect(form.has('prompt')).toBe(false);
    expect(form.get('model')).toBe(language === 'hi' || language === 'hinglish' ? 'whisper-large-v3' : 'whisper-large-v3-turbo');
    expect(queue.snapshot.size).toBe(0);
  });
  it('defaults to auto-detection when no language setting is supplied', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ok('Hello'));
    const queue = new TranscriptionQueue({ getKey: () => 'key', getTranscript: () => '', merge: vi.fn(), fetch: fetcher });
    queue.enqueue(chunk(1));
    await settle();
    expect((fetcher.mock.calls[0][1]!.body as FormData).has('language')).toBe(false);
  });
  it('supports v3 and preserves Hindi/mixed committed context in the prompt', async () => {
    const transcript = 'आज हमारी team meeting में नई योजना पर चर्चा हुई।';
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ok('अगला भाग।'));
    const queue = new TranscriptionQueue({ getKey: () => 'key', getTranscript: () => transcript,
      getLanguage: () => 'hi', getModel: () => 'whisper-large-v3', merge: vi.fn(), fetch: fetcher });
    queue.enqueue(chunk(1));
    await settle();
    const form = fetcher.mock.calls[0][1]!.body as FormData;
    expect(form.get('language')).toBe('hi');
    expect(form.get('model')).toBe('whisper-large-v3');
    expect(form.get('prompt')).toBe(transcript);
  });
  it.each(['english', 'en'])('detects %s and keeps turbo with one upload', async language => {
    const merge = vi.fn();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ text: 'Hello', language })));
    const queue = new TranscriptionQueue({ getKey: () => 'key', getTranscript: () => '', merge, fetch: fetcher });
    queue.enqueue(chunk(1));
    await settle();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(merge).toHaveBeenCalledWith('Hello', chunk(1), { text: 'Hello', language: 'en', model: 'whisper-large-v3-turbo' });
  });
  it.each(['hindi', 'hi'])('detects %s, refines the same chunk with v3, then uses v3 for the next chunk', async language => {
    const merge = vi.fn();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response(JSON.stringify({ text: 'यह हिन्दी है।', language })));
    const queue = new TranscriptionQueue({ getKey: () => 'key', getTranscript: () => '', merge, fetch: fetcher });
    queue.enqueue(chunk(1)); queue.enqueue(chunk(2));
    await settle();
    const forms = fetcher.mock.calls.map(call => call[1]!.body as FormData);
    expect(forms.map(form => form.get('model'))).toEqual(['whisper-large-v3-turbo', 'whisper-large-v3', 'whisper-large-v3']);
    expect(forms.map(form => (form.get('file') as File).name)).toEqual(['rec_1.wav', 'rec_1.wav', 'rec_2.wav']);
    expect(forms.every(form => !form.has('language'))).toBe(true);
    expect(merge).toHaveBeenCalledTimes(2);
    expect(merge.mock.calls[0][2]).toEqual({ text: 'यह हिन्दी है।', language: 'hi', model: 'whisper-large-v3' });
  });
  it('switches back to turbo when later audio is detected as English', async () => {
    const merge = vi.fn();
    let calls = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      const language = ++calls <= 2 ? 'hindi' : 'english';
      return new Response(JSON.stringify({ text: language === 'hindi' ? 'नमस्ते' : 'Hello', language }));
    });
    const queue = new TranscriptionQueue({ getKey: () => 'key', getTranscript: () => '', merge, fetch: fetcher });
    queue.enqueue(chunk(1)); queue.enqueue(chunk(2));
    await settle();
    expect(fetcher.mock.calls.map(call => (call[1]!.body as FormData).get('model')))
      .toEqual(['whisper-large-v3-turbo', 'whisper-large-v3', 'whisper-large-v3', 'whisper-large-v3-turbo']);
    expect(merge).toHaveBeenCalledTimes(2);
    expect(merge.mock.calls[1][2].model).toBe('whisper-large-v3-turbo');
  });
  it('honors a manual model even when Auto detects Hindi', async () => {
    const merge = vi.fn();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ text: 'नमस्ते', language: 'hindi' })));
    const queue = new TranscriptionQueue({ getKey: () => 'key', getTranscript: () => '',
      getModel: () => 'whisper-large-v3-turbo', merge, fetch: fetcher });
    queue.enqueue(chunk(1));
    await settle();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(merge.mock.calls[0][2].language).toBe('hi');
  });
  it('retains the head if the Hindi refinement fails, without committing the probe', async () => {
    const merge = vi.fn();
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'probe', language: 'hindi' })))
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ text: 'सही पाठ।', language: 'hindi' })));
    const queue = new TranscriptionQueue({ getKey: () => 'key', getTranscript: () => '', merge, fetch: fetcher });
    queue.enqueue(chunk(1));
    await settle();
    expect(queue.snapshot).toMatchObject({ phase: 'paused', size: 1 });
    expect(merge).not.toHaveBeenCalled();
    queue.resume();
    await settle();
    expect((fetcher.mock.calls[2][1]!.body as FormData).get('model')).toBe('whisper-large-v3');
    expect(merge).toHaveBeenCalledTimes(1);
    expect(merge.mock.calls[0][0]).toBe('सही पाठ।');
  });
  it('does not refine silent chunks even if language metadata is present', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ text: '', language: 'hindi' })));
    const queue = new TranscriptionQueue({ getKey: () => 'key', getTranscript: () => '', merge: vi.fn(), fetch: fetcher });
    queue.enqueue(chunk(1));
    await settle();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(queue.snapshot.size).toBe(0);
  });
  it('retries the same head on network, 429, 5xx and 408 with capped exponential backoff', async () => {
    vi.useFakeTimers();
    const files: string[] = [];
    const delays: number[] = [];
    let calls = 0;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      files.push(((init!.body as FormData).get('file') as File).name);
      calls++;
      if (calls === 1) throw new TypeError('offline');
      if (calls <= 6) return new Response('', { status: [429, 503, 408, 500, 502][calls - 2] });
      return ok(`text ${calls}`);
    });
    const queue = new TranscriptionQueue({ getKey: () => 'key', getTranscript: () => '', merge: vi.fn(), fetch: fetcher,
      random: () => 0.5,
      onState: state => { if (state.phase === 'retrying') delays.push(state.retryAt! - Date.now()); } });
    queue.enqueue(chunk(1)); queue.enqueue(chunk(2));
    await settle();
    for (const delay of [1000, 2000, 4000, 8000, 10000, 10000]) {
      expect(queue.snapshot.phase).toBe('retrying');
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(files.every(file => file === 'rec_1.wav')).toBe(true);
      await vi.advanceTimersByTimeAsync(1);
    }
    await settle();
    expect(delays).toEqual([1000, 2000, 4000, 8000, 10000, 10000]);
    expect(files).toEqual([...Array(7).fill('rec_1.wav'), 'rec_2.wav']);
    expect(queue.snapshot.size).toBe(0);
  });
  it('retries a timeout without advancing the FIFO', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')));
    })).mockResolvedValue(ok('done'));
    const queue = new TranscriptionQueue({ getKey: () => 'key', getTranscript: () => '', merge: vi.fn(), fetch: fetcher, random: () => 0.5, timeoutMs: 100 });
    queue.enqueue(chunk(1));
    await vi.advanceTimersByTimeAsync(100);
    expect(queue.snapshot.phase).toBe('retrying');
    await vi.advanceTimersByTimeAsync(1000);
    expect(queue.snapshot.size).toBe(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([401, 400, 403, 413])('pauses on HTTP %i, retaining head and resuming explicitly', async code => {
    const merged: string[] = [];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('', { status: code })).mockImplementation(async () => ok('done'));
    const queue = new TranscriptionQueue({ getKey: () => 'key', getTranscript: () => '', merge: text => merged.push(text), fetch: fetcher });
    queue.enqueue(chunk(1)); queue.enqueue(chunk(2));
    await settle();
    expect(queue.snapshot.phase).toBe('paused');
    expect(queue.snapshot.size).toBe(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
    queue.resume(); queue.resume();
    await settle();
    expect(merged).toEqual(['done', 'done']);
    expect(queue.snapshot.size).toBe(0);
  });
  it('emits structured start, error, retry and completion events without secrets or transcript text', async () => {
    const onActivity = vi.fn();
    const fetcher = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('secret server response'))
      .mockResolvedValueOnce(ok('private transcript'));
    const queue = new TranscriptionQueue({ getKey: () => 'secret-key', getTranscript: () => '',
      getLanguage: () => 'en', getModel: () => 'whisper-large-v3', merge: vi.fn(), fetch: fetcher,
      onActivity, random: () => 0.5, sleep: async () => {} });
    queue.enqueue(chunk(1));
    await settle();
    const events = onActivity.mock.calls.map(([event]) => event);
    expect(events.map(event => event.event)).toEqual([
      'transcription.started', 'transcription.error', 'transcription.retry_scheduled',
      'transcription.started', 'transcription.completed',
    ]);
    expect(events[0].details).toMatchObject({ model: 'whisper-large-v3', language: 'en', chunkTimestamp: 1 });
    expect(events[2].details).toMatchObject({ attempt: 2, delayMs: 1000 });
    expect(JSON.stringify(events)).not.toMatch(/secret|private transcript/);
  });
  it('pauses without uploading when key is absent', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const queue = new TranscriptionQueue({ getKey: () => '', getTranscript: () => '', merge: vi.fn(), fetch: fetcher });
    queue.enqueue(chunk(1));
    await settle();
    expect(queue.snapshot.phase).toBe('paused');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('pauses on malformed success data rather than losing the chunk', async () => {
    const queue = new TranscriptionQueue({ getKey: () => 'key', getTranscript: () => '', merge: vi.fn(), fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response('{}')) });
    queue.enqueue(chunk(1));
    await settle();
    expect(queue.snapshot.phase).toBe('paused');
    expect(queue.snapshot.size).toBe(1);
  });
});
