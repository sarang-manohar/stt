import { describe, expect, it } from 'vitest';
import { PcmResampler, SlidingWindowSlicer } from './audioRecorder';
import type { AudioChunk } from './transcriptionQueue';

const pcm = async (chunk: AudioChunk) => new Int16Array((await chunk.blob.arrayBuffer()).slice(44));
describe('PCM sliding windows', () => {
  it('emits 0–10, 8–18, 16–26 with sample-perfect overlap across arbitrary blocks', async () => {
    const chunks: AudioChunk[] = [];
    const start = new Date(2026, 0, 1).getTime();
    const slicer = new SlidingWindowSlicer(start, c => chunks.push(c));
    const source = Int16Array.from({ length: 416000 }, (_, i) => (i % 60001) - 30000);
    for (let i = 0; i < source.length; i += 777) slicer.push(source.subarray(i, i + 777));
    slicer.flush();
    expect(chunks.map(c => c.timestamp - start)).toEqual([0, 8000, 16000]);
    for (let i = 0; i < chunks.length; i++) expect(await pcm(chunks[i])).toEqual(source.slice(i * 128000, i * 128000 + 160000));
  });
  it('flushes at half a second, ignores shorter data, and flush is idempotent', () => {
    for (const [length, expected] of [[7999, 0], [8000, 1], [159999, 1], [160000, 1], [160001, 2]]) {
      const chunks: AudioChunk[] = [];
      const slicer = new SlidingWindowSlicer(0, c => chunks.push(c));
      slicer.push(new Int16Array(length));
      slicer.flush();
      slicer.flush();
      expect(chunks.length).toBe(expected);
    }
  });
  it('flushes remaining overlap plus new trailing audio at the next stride timestamp', async () => {
    const chunks: AudioChunk[] = [];
    const slicer = new SlidingWindowSlicer(0, c => chunks.push(c));
    slicer.push(new Int16Array(176000));
    slicer.flush();
    expect(chunks.map(c => c.timestamp)).toEqual([0, 8000]);
    expect((await pcm(chunks[1])).length).toBe(48000);
  });
});
describe('streaming resampler', () => {
  it.each([44100, 48000, 16000])('produces exactly 16000 PCM samples from one second at %i Hz', rate => {
    const resampler = new PcmResampler(rate);
    const input = new Float32Array(rate).fill(0.5);
    const values: number[] = [];
    for (let i = 0; i < input.length; i += 128) values.push(...resampler.process(input.subarray(i, i + 128)));
    expect(values.length).toBe(16000);
    expect(new Set(values)).toEqual(new Set([16384]));
  });
  it('clamps both polarities and preserves signed PCM', () => {
    expect(new PcmResampler(16000).process(Float32Array.from([-2, 0, 2]))).toEqual(Int16Array.from([-32768, 0, 32767]));
  });
});
