import type { CapacitorConfig } from '@capacitor/cli';

/** Native shell for AUXED. The app loads the deployed web app, so web releases ship instantly. */
const config: CapacitorConfig = {
  appId: 'app.auxed',
  appName: 'AUXED',
  webDir: 'out',
  backgroundColor: '#000000',
  server: {
    url: process.env.AUXED_APP_URL ?? 'https://auxed.app',
    cleartext: false,
  },
  ios: { contentInset: 'never', scheme: 'AUXED' },
  android: { allowMixedContent: false },
};

export default config;
