import { defineConfig } from 'vitest/config';
// Native third-party source may include its own tests; those are not app tests.
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
