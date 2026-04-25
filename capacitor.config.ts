import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.found404.mesh',
  appName: '404 Found',
  webDir: 'frontend/out',
  server: {
    androidScheme: 'https',
    cleartext: true, // Allow HTTP for local mesh communication
  },
  plugins: {
    // Bluetooth LE configuration for Android
    BluetoothLe: {
      displayStrings: {
        scanning: 'Scanning for mesh nodes...',
        cancel: 'Cancel',
        availableDevices: 'Available mesh nodes',
        noDeviceFound: 'No mesh nodes found',
      },
    },
    // Local Notifications for mesh events
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#488AFF',
      sound: 'beep.wav',
    },
  },
  // Android-specific configurations
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
    // Permissions for Bluetooth and Wi-Fi Direct
    permissions: [
      'android.permission.BLUETOOTH',
      'android.permission.BLUETOOTH_ADMIN',
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.BLUETOOTH_ADVERTISE',
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.NEARBY_WIFI_DEVICES',
      'android.permission.CHANGE_WIFI_STATE',
      'android.permission.ACCESS_WIFI_STATE',
    ],
  },
  // iOS-specific configurations
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
    // Background modes for Bluetooth and networking
    backgroundColor: '0D0D19',
    // iOS requires specific Bluetooth usage descriptions
    // These should be added to Info.plist
  },
};

export default config;
