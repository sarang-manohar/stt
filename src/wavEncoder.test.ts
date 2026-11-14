import { describe, expect, it } from 'vitest';
import { encodeWav, recordingFilename } from './wavEncoder';

describe('WAV encoding', () => {
  it('writes canonical mono 16kHz signed little-endian PCM with correct RIFF sizes', async () => {
    const blob = encodeWav(Int16Array.from([-32768, -1, 0, 1, 32767]));
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);
    const text = (offset: number, size: number) => new TextDecoder().decode(buffer.slice(offset, offset + size));
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(54);
    expect(text(0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(46);
    expect(text(8, 8)).toBe('WAVEfmt ');
    expect(view.getUint32(16, true)).toBe(16);
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(28, true)).toBe(32000);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
    expect(text(36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(10);
    expect(Array.from({ length: 5 }, (_, i) => view.getInt16(44 + i * 2, true))).toEqual([-32768, -1, 0, 1, 32767]);
  });
  it('encodes silence, empty data and a full ten-second window', async () => {
    expect(encodeWav(new Int16Array(160000)).size).toBe(320044);
    const empty = new DataView(await encodeWav(new Int16Array()).arrayBuffer());
    expect(empty.byteLength).toBe(44);
    expect(empty.getUint32(40, true)).toBe(0);
  });
  it('uses the slice timestamp, padded to milliseconds', () => {
    expect(recordingFilename(new Date(2026, 0, 2, 3, 4, 5, 6).getTime())).toBe('rec_20260102_030405_006.wav');
  });
});
