import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [{
      name: 'version-offline-shell',
      apply: 'build',
      generateBundle(_options, bundle) {
        const worker = readFileSync('public/sw.js', 'utf8');
        const worklet = readFileSync('public/audio-worklet.js', 'utf8');
        const version = createHash('sha256').update(JSON.stringify(bundle) + worker + worklet).digest('hex').slice(0, 16);
        this.emitFile({ type: 'asset', fileName: 'sw.js', source: worker.replace('dictation-shell-v1', `dictation-shell-${version}`) });
      },
    }],
    // Expose only this legacy variable, never all unprefixed environment values.
    define: {
      'import.meta.env.VITE_GROQ_API_KEY': JSON.stringify(
        // Never distribute a personal build-time key inside an APK/AAB.
        mode === 'android' ? '' : env.VITE_GROQ_API_KEY?.trim() || env.GROQ_API_KEY?.trim() || '',
      ),
    },
  };
});
