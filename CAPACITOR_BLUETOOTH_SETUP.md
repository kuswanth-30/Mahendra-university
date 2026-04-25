# Capacitor Bluetooth Setup - 404 Found

Quick setup guide for native Bluetooth LE discovery using @capacitor-community/bluetooth-le.

## Installation

```bash
# Already installed in package.json
npm install @capacitor-community/bluetooth-le
npm install @capacitor/device

# Sync with Capacitor
npx cap sync
```

## Android Setup

### 1. AndroidManifest.xml

File: `android/app/src/main/AndroidManifest.xml`

Created with required permissions:
- `BLUETOOTH_SCAN` - Discover nearby devices
- `BLUETOOTH_CONNECT` - Connect to devices
- `BLUETOOTH_ADVERTISE` - Advertise presence
- `ACCESS_FINE_LOCATION` - Required for BLE scanning
- `FOREGROUND_SERVICE` - Background scanning

### 2. Add Android Platform

```bash
npx cap add android
npx cap sync android
```

### 3. Open Android Studio

```bash
npx cap open android
```

In Android Studio:
- Go to `File > Sync Project with Gradle Files`
- Build and run on device (emulator doesn't support BLE)

## iOS Setup

### 1. Info.plist

File: `ios/App/App/Info.plist`

Created with:
- `NSBluetoothAlwaysUsageDescription` - Background discovery permission
- `NSBluetoothPeripheralUsageDescription` - Connection permission
- `UIBackgroundModes` - bluetooth-central, bluetooth-peripheral, processing

### 2. Add iOS Platform

```bash
npx cap add ios
npx cap sync ios
```

### 3. Open Xcode

```bash
npx cap open ios
```

In Xcode:
- Select your team in Signing & Capabilities
- Add "Background Modes" capability (check Bluetooth LE)
- Build and run on physical device (simulator doesn't support BLE)

## Usage - Node Discovery Only

```javascript
import { hardwareBridge } from '@/lib/services/hardwareBridge.js';

// Initialize Bluetooth
const result = await hardwareBridge.initialize();
if (!result.success) {
  console.error('Bluetooth init failed:', result.error);
  return;
}

// Start discovery - logs device IDs to console
await hardwareBridge.startDiscovery({ duration: 15000 });

// Console output:
// [HardwareBridge:Discovery] === STARTING NODE DISCOVERY ===
// [HardwareBridge:Discovery] >>> NODE FOUND <<<
// [HardwareBridge:Discovery] Device ID: XX:XX:XX:XX:XX:XX
// [HardwareBridge:Discovery] Name: 404-Found-Node-1
// [HardwareBridge:Discovery] RSSI: -65 dBm

// Listen for discoveries
hardwareBridge.onPeerDiscovered((peer) => {
  console.log('Discovered peer:', peer.id, peer.name);
});

// Stop discovery
await hardwareBridge.stopDiscovery();
```

## Console Output Example

```
[HardwareBridge:Discovery] === STARTING NODE DISCOVERY ===
[HardwareBridge:Discovery] Scanning for 15000ms...
[HardwareBridge:Discovery] BLE scan started

[HardwareBridge:Discovery] >>> NODE FOUND <<<
[HardwareBridge:Discovery] Device ID: 12:34:56:78:9A:BC
[HardwareBridge:Discovery] Name: 404-Found-Mesh-Node-A
[HardwareBridge:Discovery] RSSI: -45 dBm
[HardwareBridge:Discovery] Total discovered: 1

[HardwareBridge:Discovery] >>> NODE FOUND <<<
[HardwareBridge:Discovery] Device ID: 98:76:54:32:10:FE
[HardwareBridge:Discovery] Name: 404-Found-Mesh-Node-B
[HardwareBridge:Discovery] RSSI: -62 dBm
[HardwareBridge:Discovery] Total discovered: 2

[HardwareBridge:Discovery] === SCAN COMPLETE ===
[HardwareBridge:Discovery] Total devices found: 2
[HardwareBridge:Discovery] Discovered Device IDs:
  - 12:34:56:78:9A:BC (404-Found-Mesh-Node-A, -45 dBm)
  - 98:76:54:32:10:FE (404-Found-Mesh-Node-B, -62 dBm)
```

## Permissions Summary

| Platform | Permission | Purpose |
|----------|-----------|---------|
| Android 12+ | BLUETOOTH_SCAN | Discover nearby nodes |
| Android 12+ | BLUETOOTH_CONNECT | Connect to nodes |
| Android 12+ | BLUETOOTH_ADVERTISE | Advertise presence |
| Android (all) | ACCESS_FINE_LOCATION | BLE scanning requirement |
| iOS 13+ | NSBluetoothAlwaysUsageDescription | Background discovery |
| iOS 13+ | UIBackgroundModes | Keep scanning in background |

## Testing

1. Build for platform:
   ```bash
   npm run build:cap
   ```

2. Deploy to two physical devices

3. Enable Bluetooth on both

4. Run discovery on both - should see each other's device IDs logged

## Troubleshooting

- **"Bluetooth is disabled"** - Enable Bluetooth in device settings
- **No devices found** - Ensure devices are within 10m, Bluetooth enabled
- **Permissions denied** - Check app permissions in device settings
- **iOS: No permission dialog** - Verify Info.plist strings are set

## Next Steps

- Data transfer implementation (future)
- Gossip protocol over BLE (future)
- Connection management (future)
