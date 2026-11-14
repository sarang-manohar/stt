/** Render exactly the timestamp/value pairs used by JSON export, without HTML parsing. */
export function renderTranscript(panel: HTMLElement, entries: Record<string, string>): void {
  const previous = new Map(Array.from(panel.children, child => [
    (child as HTMLElement).dataset.timestamp, child as HTMLElement,
  ]));
  for (const [timestamp, text] of Object.entries(entries)) {
    let row = previous.get(timestamp);
    if (!row) {
      row = document.createElement('div');
      row.className = 'transcript-entry';
      row.dataset.timestamp = timestamp;
      row.setAttribute('role', 'listitem');
      const time = document.createElement('span');
      time.className = 'transcript-time';
      time.lang = 'en';
      time.textContent = timestamp;
      time.setAttribute('aria-label', `Audio time ${timestamp}`);
      const content = document.createElement('span');
      content.className = 'transcript-text';
      row.append(time, content);
      panel.append(row);
    }
    const content = row.querySelector<HTMLElement>('.transcript-text')!;
    if (content.textContent !== text) content.textContent = text;
    if (text) content.removeAttribute('aria-label');
    else content.setAttribute('aria-label', 'No new text: silence or repeated overlap');
    previous.delete(timestamp);
  }
  // Clear removes all rows; same-second updates reuse their existing row.
  for (const row of previous.values()) row.remove();
}
