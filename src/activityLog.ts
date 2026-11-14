export type ActivityLevel = 'info' | 'success' | 'error' | 'warning';
export interface ActivityEvent {
  event: string;
  message: string;
  level?: ActivityLevel;
  details?: Record<string, string | number | boolean>;
}
export interface ActivityRecord extends ActivityEvent {
  timestamp: string;
  sessionId: string;
  sequence: number;
  level: ActivityLevel;
}

/** Structured events for monitoring; never pass keys, audio, or transcript text. */
export function createActivityLogger(options: {
  sessionId: string;
  write: (record: ActivityRecord) => void;
  endpoint?: string;
  fetch?: typeof fetch;
  now?: () => Date;
}): (event: ActivityEvent) => void {
  let sequence = 0;
  return event => {
    const record: ActivityRecord = {
      ...event, level: event.level ?? 'info', timestamp: (options.now?.() ?? new Date()).toISOString(),
      sessionId: options.sessionId, sequence: ++sequence,
    };
    options.write(record);
    if (options.endpoint) {
      // Best effort only: monitoring must never block recording or the FIFO.
      void Promise.resolve().then(() => (options.fetch ?? fetch)(options.endpoint!, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record), keepalive: true, credentials: 'omit',
      })).catch(() => { /* Do not recursively log monitoring transport failures. */ });
    }
  };
}

/** Bounded, tab-local view of the same structured records sent to monitoring. */
export function appendActivity(container: HTMLElement, record: ActivityRecord, limit = 200): void {
  const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 48;
  const row = document.createElement('li');
  row.className = `activity-entry ${record.level}`;
  const time = document.createElement('time');
  time.dateTime = record.timestamp;
  time.title = record.timestamp;
  time.textContent = new Date(record.timestamp).toLocaleTimeString([], { hour12: false });
  const text = document.createElement('span');
  text.textContent = record.message;
  row.append(time, text);
  container.append(row);
  while (container.children.length > limit) container.firstElementChild?.remove();
  if (nearBottom) container.scrollTop = container.scrollHeight;
}
