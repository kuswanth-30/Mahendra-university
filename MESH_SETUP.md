# Active Mesh - P2P Networking Setup Guide

## Overview

The 404 Found Active Mesh implements local P2P discovery and sync using:
- **Android**: BLE (Bluetooth Low Energy) via `@capacitor-community/bluetooth-le`
- **iOS**: BLE fallback + Multipeer Connectivity (planned)
- **Safety**: Web Worker for non-blocking sync operations
- **Discovery**: Local hardware broadcasting (no internet required)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI Layer (React)                          │
│                   ┌─────────────────────┐                       │
│                   │   useMesh() Hook     │                       │
│                   └──────────┬──────────┘                       │
└──────────────────────────────┬───────────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────────┐
│                    Service Layer (Main Thread)                     │
│  ┌────────────────┐  ┌───────────────┐  ┌──────────────────────┐  │
│  │ meshDiscovery  │  │meshConnector  │  │  gossipEngine        │  │
│  │   (BLE Scan)   │  │ (Handshake)   │  │   (Sync Protocol)    │  │
│  └───────┬────────┘  └───────┬───────┘  └──────────┬───────────┘  │
└──────────┼───────────────────┼─────────────────────┼──────────────┘
           │                   │                     │
┌──────────▼───────────────────▼─────────────────────▼──────────────┐
│                    Web Worker (Background)                         │
│                    ┌──────────────────┐                           │
│                    │   mesh.worker    │                           │
│                    │ (Periodic Sync)  │                           │
│                    └──────────────────┘                           │
└─────────────────────────────────────────────────────────────────────┘
```

## Plugin Setup

### 1. Install Capacitor Plugins

```bash
# Install Capacitor CLI and core
npm install @capacitor/cli @capacitor/core

# Install Bluetooth LE plugin (Android)
npm install @capacitor-community/bluetooth-le

# Install Local Notifications
npm install @capacitor/local-notifications

# Install App plugin (for background state)
npm install @capacitor/app
```

### 2. iOS Multipeer Connectivity (Future)

```bash
# For iOS native multipeer (requires custom plugin or Capacitor Community)
# Currently using BLE fallback on iOS
```

### 3. Sync Capacitor

```bash
# After installing plugins, sync native files
npx cap sync
```

## Android Configuration

### AndroidManifest.xml

Add these permissions to `android/app/src/main/AndroidManifest.xml`:

```xml
<!-- Bluetooth permissions -->
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />

<!-- Location permissions (required for BLE scanning on Android 6+) -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />

<!-- Wi-Fi Direct (optional fallback) -->
<uses-permission android:name="android.permission.NEARBY_WIFI_DEVICES" />
<uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />

<!-- Bluetooth feature declarations -->
<uses-feature android:name="android.hardware.bluetooth_le" android:required="true" />
```

### MainActivity.java

Ensure MainActivity extends BridgeActivity:

```java
package com.found.emergency;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}
```

## iOS Configuration

### Info.plist

Add these entries to `ios/App/App/Info.plist`:

```xml
<!-- Bluetooth usage descriptions -->
<key>NSBluetoothAlwaysUsageDescription</key>
<string>404 Found uses Bluetooth to discover nearby emergency mesh nodes</string>

<key>NSBluetoothPeripheralUsageDescription</key>
<string>404 Found uses Bluetooth to connect to emergency mesh nodes</string>

<!-- Background modes -->
<key>UIBackgroundModes</key>
<array>
    <string>bluetooth-central</string>
    <string>bluetooth-peripheral</string>
    <string>fetch</string>
    <string>processing</string>
</array>
```

### Podfile

```ruby
platform :ios, '14.0'
use_frameworks!

target 'App' do
  capacitor_pods
  # Add pods here
end
```

## Services Usage

### 1. Discovery Service

```typescript
import { meshDiscovery } from '@/lib/services/meshDiscovery';

// Start advertising as 404_Found_Node
await meshDiscovery.startAdvertising();

// Start scanning for peers
await meshDiscovery.startScanning();

// Listen for discoveries
meshDiscovery.onPeerDiscovered((peer) => {
  console.log(`Found peer: ${peer.name} (${peer.id})`);
  // Auto-connects via meshConnector
});

// Get discovered peers
const peers = meshDiscovery.getDiscoveredPeers();
```

### 2. Connection Service

```typescript
import { meshConnector } from '@/lib/services/meshConnector';

// Initialize (auto-connects to discovered peers)
meshConnector.initialize();

// Get connection stats
const stats = meshConnector.getStats();
console.log(`Active connections: ${stats.activeConnections}`);

// Trigger manual sync
await meshConnector.triggerSync(peerId);

// Disconnect
await meshConnector.disconnect(peerId);
```

### 3. React Hook

```typescript
import { useMesh } from '@/hooks/useMesh';

function MeshStatus() {
  const {
    isAdvertising,
    isScanning,
    discoveredPeers,
    activeConnections,
    nodeId,
    startDiscovery,
    stopDiscovery,
  } = useMesh();

  return (
    <div>
      <p>Node ID: {nodeId}</p>
      <p>Peers: {discoveredPeers.length}</p>
      <p>Connections: {activeConnections}</p>
      <button onClick={startDiscovery} disabled={isScanning}>
        {isScanning ? 'Scanning...' : 'Start Discovery'}
      </button>
    </div>
  );
}
```

### 4. Web Worker (Background Sync)

```typescript
import { useMeshWorker } from '@/hooks/useMeshWorker';

function MeshComponent() {
  const {
    isReady,
    activeSyncs,
    startBackgroundSync,
    stopBackgroundSync,
  } = useMeshWorker();

  // When peer connects
  const onPeerConnect = (peerId: string) => {
    startBackgroundSync(peerId); // Syncs every 30s in background
  };

  return <div>Active syncs: {activeSyncs.join(', ')}</div>;
}
```

## Service UUIDs

- **Mesh Service**: `0000feed-0000-1000-8000-00805f9b34fb`
- **Mesh Characteristic**: `0000feed-0000-1000-8000-00805f9b34fb`
- **Advertisement Name**: `404_Found_Node`

## Discovery Protocol

1. **Advertising**: Device broadcasts as `404_Found_Node`
2. **Scanning**: Devices scan for peers every 5 seconds
3. **Auto-Connect**: On discovery, meshConnector auto-connects
4. **Handshake**: GossipEngine exchanges summaries
5. **Sync**: Delta exchange via batches (10 messages per batch)

## Safety Features

### Non-Blocking UI
- All mesh operations run in background
- Web Worker handles periodic sync (30s interval)
- Main thread only handles UI updates

### Retry Logic
- Connection retries: 3 attempts with 5s delays
- Sync retries: Automatic on connection restore
- Stale peer cleanup: Peers not seen in 30s are removed

### Connection Limits
- Max payload: 180 bytes per BLE packet
- Batch size: 10 messages per sync batch
- Chunk delay: 50ms between BLE chunks
- Batch delay: 100-200ms between batches

## Testing

### Browser Testing
```typescript
// Web Bluetooth API (limited support)
await meshDiscovery.startScanning(); // Opens device picker
```

### Android Testing
```bash
# Build and run on Android
npx cap run android

# Or open in Android Studio
npx cap open android
```

### iOS Testing
```bash
# Build and run on iOS
npx cap run ios

# Or open in Xcode
npx cap open ios
```

## Console Logs

```
404 FOUND: [MESH_DISCOVERY] Initialized
404 FOUND: [MESH_DISCOVERY] Started advertising as: 404_Found_Node
404 FOUND: [MESH_DISCOVERY] Started scanning for peers...
404 FOUND: [MESH_DISCOVERY] New peer discovered: 404_Found_Node (abc-123)
404 FOUND: [MESH_CONNECTOR] Auto-connecting to discovered peer: abc-123
404 FOUND: [MESH_CONNECTOR] Connected to abc-123
404 FOUND: [MESH_CONNECTOR] Starting sync with abc-123...
404 FOUND: [GOSSIP_SUMMARY] Generated summary with 45 messages
404 FOUND: [GOSSIP_DELTA] Missing locally: 12, Missing remotely: 8
404 FOUND: [BLUETOOTH] Sending 12480 bytes in 69 chunks to abc-123
404 FOUND: [GOSSIP_BATCH] Received batch 1/3 with 10 messages
404 FOUND: [MESH_CONNECTOR] Sync complete with abc-123
404 FOUND: [MESH_WORKER] Background sync started for abc-123
```

## Troubleshooting

### BLE Not Available
- Check if device supports Bluetooth LE
- Verify permissions granted
- Android: Location permission required for BLE scanning

### Connection Drops
- Reduce batch size (default: 10 messages)
- Increase chunk delay (default: 50ms)
- Check signal strength (RSSI threshold: -80 dBm)

### Sync Fails
- Verify service UUID matches on both devices
- Check that both devices are advertising/scanning
- Review console logs for specific errors

### No Peers Found
- Ensure devices are within 10-30 meters (BLE range)
- Check that both devices are in discovery mode
- Try stopping/starting discovery again

## Files Created

| File | Purpose |
|------|---------|
| `lib/services/meshDiscovery.ts` | BLE/Wi-Fi Direct discovery |
| `lib/services/meshConnector.ts` | Connection handshake & sync trigger |
| `hooks/useMesh.ts` | React hook for mesh management |
| `hooks/useMeshWorker.ts` | Web Worker for background sync |
| `workers/mesh.worker.ts` | Worker thread implementation |
| `capacitor.config.ts` | Capacitor configuration |
