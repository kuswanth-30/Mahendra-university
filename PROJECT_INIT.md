# 404 Found - Project Initialization Guide

## Delay Tolerant Network (DTN) Mesh Messaging

### Architecture Summary

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React + Tailwind CSS | Tactical/Terminal UI |
| **Persistence** | IndexedDB (Dexie.js) | Local-first data storage |
| **Security** | Web Crypto API (Ed25519) | Message signing & integrity |
| **Hardware Bridge** | Capacitor | Native BLE/Wi-Fi Direct access |
| **Transport** | LibP2P | P2P discovery & gossip replication |

### Constraints Achieved

✅ **Local-First Only**: No remote API calls for core sync
✅ **Offline Resilience**: Functions without internet
✅ **60fps UI**: WebWorkers handle crypto/sync
✅ **P2P Mesh**: LibP2P gossip protocol

---

## Quick Start

### 1. Install Dependencies

```bash
# Clean install (recommended)
rm -rf node_modules package-lock.json
npm install

# Install Capacitor CLI globally (optional)
npm install -g @capacitor/cli
```

### 2. Initialize Capacitor

```bash
# Add Android platform
npx cap add android

# Add iOS platform
npx cap add ios

# Sync web assets to native platforms
npm run cap:sync
```

### 3. Configure Android

Update `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.BLUETOOTH" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
<uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.NEARBY_WIFI_DEVICES" />
<uses-permission android:name="android.permission.INTERNET" />
```

### 4. Configure iOS

Update `ios/App/App/Info.plist`:

```xml
<key>NSBluetoothAlwaysUsageDescription</key>
<string>404 Found uses Bluetooth to discover nearby emergency mesh nodes</string>

<key>NSBluetoothPeripheralUsageDescription</key>
<string>404 Found uses Bluetooth to connect to emergency mesh nodes</string>

<key>UIBackgroundModes</key>
<array>
    <string>bluetooth-central</string>
    <string>bluetooth-peripheral</string>
    <string>fetch</string>
</array>
```

---

## Build Pipeline

### Development

```bash
# Web development
npm run dev

# Android development
npm run build
npm run cap:sync
npm run cap:open:android

# iOS development
npm run build
npm run cap:sync
npm run cap:open:ios
```

### Production

```bash
# Build for production
npm run build

# Sync to native platforms
npm run cap:sync

# Build Android APK
npx cap open android
# Then in Android Studio: Build > Build Bundle(s) / APK(s)

# Build iOS IPA
npx cap open ios
# Then in Xcode: Product > Archive
```

---

## Service Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI Layer (React)                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   useMesh   │  │  useCrypto  │  │      useLibp2p        │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬───────────┘  │
└─────────┼────────────────┼─────────────────────┼────────────────┘
          │                │                     │
┌─────────▼────────────────▼─────────────────────▼────────────────┐
│                    Service Layer                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │meshDiscovery│  │cryptoService│  │      libp2pNode       │  │
│  │   (BLE)     │  │  (Ed25519)  │  │    (GossipSub/PubSub) │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬───────────┘  │
└─────────┼────────────────┼─────────────────────┼────────────────┘
          │                │                     │
┌─────────▼────────────────▼─────────────────────▼────────────────┐
│                  Web Worker Layer                              │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              crypto.worker.ts                           │  │
│  │     (Ed25519 signing/verification offloaded)            │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Services

### 1. MeshDiscovery (BLE)
**File**: `lib/services/meshDiscovery.ts`

```typescript
import { meshDiscovery } from '@/lib/services/meshDiscovery';

// Start advertising as 404_Found_Node
await meshDiscovery.startAdvertising();

// Scan for peers
await meshDiscovery.startScanning();

// Listen for discoveries
meshDiscovery.onPeerDiscovered((peer) => {
  console.log('Found peer:', peer.id);
});
```

### 2. LibP2P Node (P2P Transport)
**File**: `lib/services/libp2pConfig.ts`

```typescript
import { createMeshNode, MESH_TOPIC } from '@/lib/services/libp2pConfig';

// Create P2P node
const node = await createMeshNode();

// Subscribe to mesh topic
await node.services.pubsub.subscribe(MESH_TOPIC);

// Publish message
await node.services.pubsub.publish(MESH_TOPIC, messageBytes);

// Listen for messages
node.services.pubsub.addEventListener('message', (event) => {
  console.log('Received:', event.detail);
});
```

### 3. CryptoService (Ed25519)
**File**: `lib/services/cryptoService.ts`

```typescript
import { cryptoService } from '@/lib/services/cryptoService';

// Initialize
await cryptoService.initialize();

// Sign message
const signed = await cryptoService.signMessage({
  type: 'ALERT',
  title: 'Emergency',
  description: 'Evacuate now',
});

// Verify signature
const isValid = await cryptoService.verifyMessage(signed);
console.log('Signature valid:', isValid);
```

---

## WebWorker Integration

### Crypto Worker
**File**: `workers/crypto.worker.ts`

All Ed25519 operations run in a Web Worker to keep UI at 60fps:

```typescript
import { useMeshWorker } from '@/hooks/useMeshWorker';

const { startBackgroundSync } = useMeshWorker();

// Crypto operations happen in background
// UI remains responsive
```

---

## Data Flow (Offline P2P Sync)

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  Node A  │◄───►│  Node B  │◄───►│  Node C  │
└────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                │
     ▼                ▼                ▼
┌──────────────────────────────────────────┐
│         GossipSub Protocol               │
│  1. A broadcasts message hash            │
│  2. B & C check if they have it          │
│  3. Missing nodes request full data      │
│  4. Data transmitted via WebRTC/BLE      │
│  5. All nodes verify Ed25519 signature     │
│  6. Store in IndexedDB if valid          │
└──────────────────────────────────────────┘
```

---

## Project Structure

```
404-found/
├── app/                    # Next.js app router
├── components/             # React components
├── hooks/                  # React hooks
│   ├── useMesh.ts         # Mesh network hook
│   ├── useLibp2p.ts       # LibP2P hook
│   └── useMeshWorker.ts   # Web Worker hook
├── lib/
│   ├── db.ts              # Dexie.js IndexedDB
│   └── services/
│       ├── libp2pConfig.ts    # LibP2P setup
│       ├── meshDiscovery.ts   # BLE discovery
│       ├── meshConnector.ts   # Connection mgmt
│       ├── cryptoService.ts   # Ed25519 crypto
│       └── gossipEngine.ts    # Sync protocol
├── workers/
│   ├── mesh.worker.ts     # Background sync
│   └── crypto.worker.ts   # Background crypto
├── android/               # Capacitor Android
├── ios/                   # Capacitor iOS
├── capacitor.config.ts    # Capacitor config
└── next.config.mjs        # Next.js config
```

---

## Environment Variables

Create `.env.local`:

```
# 404 Found Mesh Network
NEXT_PUBLIC_MESH_TOPIC=404-found-mesh/v1
NEXT_PUBLIC_NODE_ID_PREFIX=404-node-

# Capacitor (development)
CAPACITOR_ANDROID_STUDIO_PATH=/Applications/Android Studio.app
CAPACITOR_XCODE_PATH=/Applications/Xcode.app
```

---

## Troubleshooting

### LibP2P Connection Issues
- Check firewall settings (ports 4001-4003)
- Verify WebRTC STUN servers are accessible
- Check browser console for signaling errors

### Capacitor Build Errors
```bash
# Clean and rebuild
rm -rf android ios node_modules
npm install
npx cap add android
npx cap add ios
npm run build
npx cap sync
```

### Crypto Performance
- Ensure Web Worker is loading (check console)
- Verify noble-ed25519 is loaded via importScripts
- Check for memory leaks in long-running sessions

### BLE Not Working
- Verify permissions granted in AndroidManifest/Info.plist
- Check if Bluetooth is enabled on device
- For Android: Location permission required for BLE scanning

---

## Dependencies

### Core
- `libp2p`: P2P networking stack
- `@chainsafe/libp2p-gossipsub`: Gossip protocol
- `@chainsafe/libp2p-noise`: Encryption
- `@noble/ed25519`: Cryptographic signatures
- `dexie`: IndexedDB wrapper

### Capacitor
- `@capacitor/core`: Native bridge
- `@capacitor/android`: Android platform
- `@capacitor/ios`: iOS platform
- `@capacitor-community/bluetooth-le`: BLE plugin

### UI
- `next`: React framework
- `tailwindcss`: Styling
- `lucide-react`: Icons

---

## Next Steps

1. **Install dependencies**: `npm install`
2. **Add platforms**: `npx cap add android ios`
3. **Build web**: `npm run build`
4. **Sync**: `npx cap sync`
5. **Run**: Open in Android Studio / Xcode

The app is now ready for offline P2P mesh messaging!
