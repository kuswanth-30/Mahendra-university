import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.found404.mesh',
  appName: '404 Found',
  webDir: 'out',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0a0a0a',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
    },
    Network: {
      // Network plugin configuration
    },
    BluetoothLe: {
      displayStrings: {
        scanning: 'Scanning for mesh nodes...',
      },
    },
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  ios: {
    allowsLinkPreview: false,
    scrollEnabled: false,
    contentInset: 'always',
  },
};

export default config;
