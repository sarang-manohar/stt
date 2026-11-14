import { describe, expect, it, vi } from 'vitest';
import { createActivityLogger, type ActivityRecord } from './activityLog';

describe('structured monitoring events', () => {
  it('adds UTC timestamps, a correlation ID and ordered sequence numbers; forwards the same JSON', async () => {
    const records: ActivityRecord[] = [];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response());
    const log = createActivityLogger({ sessionId: 'session-1', endpoint: '/events',
      write: record => records.push(record), fetch: fetcher, now: () => new Date('2026-01-01T10:20:30Z') });
    log({ event: 'settings.model_selected', message: 'Model selected.', details: { model: 'auto' } });
    log({ event: 'transcription.error', message: 'Network error.', level: 'error' });
    await Promise.resolve();
    expect(records.map(record => record.sequence)).toEqual([1, 2]);
    expect(records[0]).toMatchObject({ timestamp: '2026-01-01T10:20:30.000Z', sessionId: 'session-1', level: 'info' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe('/events');
    const init = fetcher.mock.calls[0][1]!;
    expect(JSON.parse(init.body as string)).toEqual(records[0]);
    expect(init).toMatchObject({ method: 'POST', keepalive: true, credentials: 'omit' });
  });
  it('does not send requests without an endpoint and tolerates monitoring failures', async () => {
    const write = vi.fn();
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('offline'));
    createActivityLogger({ sessionId: 'local', write, fetch: fetcher })({ event: 'test', message: 'Local only.' });
    expect(fetcher).not.toHaveBeenCalled();
    const log = createActivityLogger({ sessionId: 'remote', endpoint: '/events', write, fetch: fetcher });
    expect(() => log({ event: 'test', message: 'Remote.' })).not.toThrow();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(write).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
