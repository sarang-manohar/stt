import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.personaldictation.mobile',
  appName: 'Dictation',
  webDir: 'dist-android',
  server: {
    // Secure local origin is required for getUserMedia and AudioWorklet.
    androidScheme: 'https',
  },
  android: {
    allowMixedContent: false,
    adjustMarginsForEdgeToEdge: 'auto',
  },
};

export default config;
