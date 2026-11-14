import { afterEach, expect, it, vi } from 'vitest';
import configure from '../vite.config';

afterEach(() => vi.unstubAllEnvs());

it('never embeds either environment API key in Android builds', () => {
  vi.stubEnv('VITE_GROQ_API_KEY', 'vite-test-secret');
  vi.stubEnv('GROQ_API_KEY', 'legacy-test-secret');
  const config = configure({ command: 'build', mode: 'android' });
  expect(config.define?.['import.meta.env.VITE_GROQ_API_KEY']).toBe('""');
});

it('preserves the browser build-time key configuration', () => {
  vi.stubEnv('VITE_GROQ_API_KEY', 'vite-test-secret');
  vi.stubEnv('GROQ_API_KEY', 'legacy-test-secret');
  const config = configure({ command: 'build', mode: 'production' });
  expect(config.define?.['import.meta.env.VITE_GROQ_API_KEY']).toBe('"vite-test-secret"');
});
