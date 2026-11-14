import { describe, expect, it } from 'vitest';
import { formatTimestamp, TranscriptDocument } from './transcriptDocument';

describe('timestamp-keyed transcript JSON', () => {
  it('uses 00:00, 00:08, 00:16 audio starts, not response completion times', () => {
    const doc = new TranscriptDocument();
    const origin = 1_800_000_000_000;
    doc.append('Hello bright red roses.', origin);
    doc.append('bright red roses grow here.', origin + 8000);
    doc.append('grow here. Today is sunny.', origin + 16000);
    expect(doc.toJSON()).toEqual({ '00:00': 'Hello bright red roses.', '00:08': 'grow here.', '00:16': 'Today is sunny.' });
    expect(doc.text).toBe('Hello bright red roses. grow here. Today is sunny.');
  });
  it('preserves Hindi and Hinglish, with no duplicated overlap', () => {
    const doc = new TranscriptDocument();
    doc.append('आज हमारी team meeting है।', 1000);
    doc.append('team meeting है, फिर lunch करेंगे।', 9000);
    expect(JSON.parse(JSON.stringify(doc.toJSON()))).toEqual({
      '00:00': 'आज हमारी team meeting है।', '00:08': 'फिर lunch करेंगे।',
    });
  });
  it('does not repeat the reported Hindi overlap in text or timestamped contributions', () => {
    const doc = new TranscriptDocument();
    const existing = 'जहाँ उत्तर प्रदेश ने सूरत और गिफ्ट सिटी बना ली वहाँ आप प्रदेश का सबसे बड़ा एकनोमिक पावर हाउस होना चाहिए';
    const repeated = 'जहाँ उत्तर प्रदेश का सबसे बड़ा एकनोमिक पावर हाउस होना चाहिए';
    doc.append('', 0);
    doc.append(existing, 40000);
    doc.append(`${repeated} अगली बात सुनिए।`, 48000);
    expect(doc.toJSON()).toEqual({ '00:00': '', '00:40': existing, '00:48': 'अगली बात सुनिए।' });
    expect(doc.text).toBe(`${existing} अगली बात सुनिए।`);
  });
  it('exports only new words when a chunk restarts before a misrecognized tail', () => {
    const doc = new TranscriptDocument();
    const first = 'And in the middle of this, one ordinary looking merchant is a man of the church.';
    doc.append(first, 0);
    doc.append('One ordinary looking merchant is asking the pope for forgiveness.', 8000);
    doc.append('asking the pope for forgiveness.', 16000);
    expect(doc.toJSON()).toEqual({
      '00:00': first, '00:08': 'asking the pope for forgiveness.', '00:16': '',
    });
    expect(doc.text).toBe(`${first} asking the pope for forgiveness.`);
    expect(Object.values(doc.toJSON()).filter(Boolean).join(' ')).toBe(doc.text);
  });
  it('retains silent and fully duplicated window keys, without shifting later offsets', () => {
    const doc = new TranscriptDocument();
    doc.append('', 5000);
    doc.append('Hello world', 13000);
    doc.append('Hello world', 21000);
    expect(doc.toJSON()).toEqual({ '00:00': '', '00:08': 'Hello world', '00:16': '' });
  });
  it('preserves pauses and same-second contributions from separate recordings', () => {
    const doc = new TranscriptDocument();
    doc.append('First.', 1000);
    doc.append('Second.', 1700);
    doc.append('Third.', 66000);
    expect(doc.toJSON()).toEqual({ '00:00': 'First. Second.', '01:05': 'Third.' });
  });
  it('clears text and timing, and returns detached snapshots', () => {
    const doc = new TranscriptDocument();
    expect(doc.hasEntries).toBe(false);
    doc.append('Old', 0);
    const snapshot = doc.toJSON();
    snapshot['00:00'] = 'mutated';
    expect(doc.toJSON()['00:00']).toBe('Old');
    doc.clear();
    expect(doc.text).toBe('');
    expect(doc.hasEntries).toBe(false);
    doc.append('New', 300000);
    expect(doc.toJSON()).toEqual({ '00:00': 'New' });
  });
  it('formats minute/hour boundaries without wrapping minutes', () => {
    expect([0, 8, 16, 59, 60, 3600, 3668.9].map(formatTimestamp))
      .toEqual(['00:00', '00:08', '00:16', '00:59', '01:00', '60:00', '61:08']);
  });
});
