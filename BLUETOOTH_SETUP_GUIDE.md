# 404 Found - Bluetooth Capacitor Setup Guide

Complete guide for configuring native Bluetooth permissions on Android and iOS for background scanning and peer discovery.

---

## Android Configuration

### 1. Required Permissions in `AndroidManifest.xml`

After running `npx cap add android`, edit `android/app/src/main/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.found404.mesh">

    <!-- ========== BLUETOOTH PERMISSIONS ========== -->
    
    <!-- Legacy Bluetooth permissions (Android 11 and lower) -->
    <uses-permission android:name="android.permission.BLUETOOTH" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    
    <!-- Android 12+ (API 31+) Bluetooth permissions -->
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" 
        android:usesPermissionFlags="neverForLocation" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
    
    <!-- Background location for continuous scanning -->
    <uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
    
    <!-- Hardware requirements -->
    <uses-feature android:name="android.hardware.bluetooth_le" android:required="true" />
    <uses-feature android:name="android.hardware.bluetooth" android:required="true" />

    <!-- ========== FOREGROUND SERVICE (Background Scanning) ========== -->
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme">
        
        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:name="com.found404.mesh.MainActivity"
            android:label="@string/title_activity_main"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:launchMode="singleTask"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- Foreground Service for Background BLE Scanning -->
        <service
            android:name=".BleScanService"
            android:enabled="true"
            android:exported="false"
            android:foregroundServiceType="location" />

        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths" />
        </provider>
    </application>
</manifest>
```

### 2. Permission Rationale in `MainActivity.java`

Edit `android/app/src/main/java/com/found404/mesh/MainActivity.java`:

```java
package com.found404.mesh;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    
    private static final int PERMISSION_REQUEST_CODE = 1001;
    
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        requestBluetoothPermissions();
    }
    
    private void requestBluetoothPermissions() {
        String[] permissions;
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12+ (API 31+)
            permissions = new String[] {
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_ADVERTISE,
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_BACKGROUND_LOCATION,
                Manifest.permission.FOREGROUND_SERVICE
            };
        } else {
            // Android 11 and below
            permissions = new String[] {
                Manifest.permission.BLUETOOTH,
                Manifest.permission.BLUETOOTH_ADMIN,
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            };
        }
        
        boolean allGranted = true;
        for (String permission : permissions) {
            if (ContextCompat.checkSelfPermission(this, permission) 
                    != PackageManager.PERMISSION_GRANTED) {
                allGranted = false;
                break;
            }
        }
        
        if (!allGranted) {
            ActivityCompat.requestPermissions(this, permissions, PERMISSION_REQUEST_CODE);
        }
    }
    
    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, 
                                           int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        
        if (requestCode == PERMISSION_REQUEST_CODE) {
            boolean allGranted = true;
            for (int result : grantResults) {
                if (result != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    break;
                }
            }
            
            if (allGranted) {
                // All permissions granted, can proceed with BLE scanning
                System.out.println("[404Found] All Bluetooth permissions granted");
            } else {
                System.out.println("[404Found] Some permissions denied - BLE may not work properly");
            }
        }
    }
}
```

### 3. Background Scanning Service (Optional)

Create `android/app/src/main/java/com/found404/mesh/BleScanService.java` for persistent scanning:

```java
package com.found404.mesh;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

public class BleScanService extends Service {
    
    private static final String CHANNEL_ID = "404FoundBleChannel";
    private static final int NOTIFICATION_ID = 4041;
    
    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }
    
    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("404 Found Mesh Network")
            .setContentText("Scanning for nearby peers...")
            .setSmallIcon(R.drawable.ic_notification)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
        
        startForeground(NOTIFICATION_ID, notification);
        
        // Start BLE scanning logic here
        
        return START_STICKY;
    }
    
    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
    
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "404 Found Mesh",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Background peer discovery");
            
            NotificationManager manager = getSystemService(NotificationManager.class);
            manager.createNotificationChannel(channel);
        }
    }
}
```

### 4. Android Gradle Configuration

Edit `android/app/build.gradle` (add to android block):

```gradle
android {
    compileSdkVersion 34
    
    defaultConfig {
        minSdkVersion 24  // Android 7.0 minimum
        targetSdkVersion 34
        
        // Required for BLE
        manifestPlaceholders = [
            'appAuthRedirectScheme': 'com.found404.mesh'
        ]
    }
    
    buildTypes {
        release {
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}

dependencies {
    implementation 'androidx.core:core:1.12.0'
    implementation 'androidx.appcompat:appcompat:1.6.1'
}
```

---

## iOS Configuration

### 1. Required Permissions in `Info.plist`

After running `npx cap add ios`, edit `ios/App/App/Info.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- ========== BLUETOOTH PERMISSIONS ========== -->
    
    <!-- Description shown when requesting Bluetooth permission (iOS 13+) -->
    <key>NSBluetoothAlwaysUsageDescription</key>
    <string>404 Found uses Bluetooth to discover and connect to nearby devices for mesh networking, even when the app is in the background.</string>
    
    <!-- Description for Bluetooth when in use (iOS 13+) -->
    <key>NSBluetoothPeripheralUsageDescription</key>
    <string>404 Found needs Bluetooth to communicate with nearby peers in the mesh network.</string>
    
    <!-- ========== BACKGROUND MODES (CRITICAL FOR BACKGROUND SCANNING) ========== -->
    
    <key>UIBackgroundModes</key>
    <array>
        <!-- Background Bluetooth LE access -->
        <string>bluetooth-central</string>
        <!-- Act as Bluetooth peripheral -->
        <string>bluetooth-peripheral</string>
        <!-- Background processing -->
        <string>processing</string>
        <!-- Keep app alive in background -->
        <string>fetch</string>
    </array>
    
    <!-- ========== LOCATION PERMISSIONS (Optional but recommended for enhanced discovery) ========== -->
    
    <key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
    <string>Location helps identify nearby peers more accurately in the mesh network.</string>
    
    <key>NSLocationWhenInUseUsageDescription</key>
    <string>Location helps identify nearby peers in the mesh network.</string>
    
    <key>NSLocationAlwaysUsageDescription</key>
    <string>Location helps maintain mesh connectivity in the background.</string>
    
    <!-- ========== APP CONFIGURATION ========== -->
    
    <key>CFBundleDevelopmentRegion</key>
    <string>en</string>
    
    <key>CFBundleDisplayName</key>
    <string>404 Found</string>
    
    <key>CFBundleExecutable</key>
    <string>$(EXECUTABLE_NAME)</string>
    
    <key>CFBundleIdentifier</key>
    <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
    
    <key>CFBundleInfoDictionaryVersion</key>
    <string>6.0</string>
    
    <key>CFBundleName</key>
    <string>$(PRODUCT_NAME)</string>
    
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
    
    <key>CFBundleVersion</key>
    <string>1</string>
    
    <key>LSRequiresIPhoneOS</key>
    <true/>
    
    <key>UILaunchStoryboardName</key>
    <string>LaunchScreen</string>
    
    <key>UIMainStoryboardFile</key>
    <string>Main</string>
    
    <key>UIRequiredDeviceCapabilities</key>
    <array>
        <string>armv7</string>
        <string>bluetooth-le</string>
    </array>
    
    <key>UISupportedInterfaceOrientations</key>
    <array>
        <string>UIInterfaceOrientationPortrait</string>
        <string>UIInterfaceOrientationLandscapeLeft</string>
        <string>UIInterfaceOrientationLandscapeRight</string>
    </array>
    
    <key>UIViewControllerBasedStatusBarAppearance</key>
    <true/>
</dict>
</plist>
```

### 2. Swift Bridge for Bluetooth (if needed)

Create `ios/App/App/BluetoothHelper.swift` for advanced control:

```swift
import Foundation
import CoreBluetooth

@objc public class BluetoothHelper: NSObject {
    
    private var centralManager: CBCentralManager?
    
    @objc public static let shared = BluetoothHelper()
    
    @objc public func requestPermissions() {
        // Initialize CBCentralManager which triggers permission dialog
        centralManager = CBCentralManager(delegate: self, queue: nil)
    }
    
    @objc public func isBluetoothEnabled() -> Bool {
        return centralManager?.state == .poweredOn
    }
}

extension BluetoothHelper: CBCentralManagerDelegate {
    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn:
            print("[404Found] Bluetooth is powered on")
        case .poweredOff:
            print("[404Found] Bluetooth is powered off")
        case .unauthorized:
            print("[404Found] Bluetooth unauthorized - check permissions")
        case .unsupported:
            print("[404Found] Bluetooth not supported on this device")
        case .unknown, .resetting:
            print("[404Found] Bluetooth state: \(central.state)")
        @unknown default:
            print("[404Found] Unknown Bluetooth state")
        }
    }
}
```

### 3. iOS Build Configuration

In Xcode (after `npx cap open ios`):

1. **Select Target**: Click on "App" target
2. **Signing & Capabilities**: 
   - Add your Apple ID/Team
   - Enable "Background Modes" capability
   - Check: "Uses Bluetooth LE accessories", "Acts as a Bluetooth LE accessory"
   - Check: "Background processing", "Fetch"
   
3. **Build Settings**:
   - Deployment Target: iOS 13.0 or higher (Bluetooth LE requires iOS 13+)
   - Swift Language Version: Swift 5

4. **Privacy Policy** (App Store requirement):
   - You MUST include a privacy policy URL that explains Bluetooth usage
   - The app will be rejected without proper privacy disclosure

---

## Usage in Your App

### Initialize and Scan

```javascript
import { hardwareBridge } from '@/lib/services/hardwareBridge.js';

// Initialize the bridge
await hardwareBridge.initialize();

// Request explicit permissions (if needed)
const permResult = await hardwareBridge.requestPermissions();
if (!permResult.granted) {
  console.error('Bluetooth permissions denied');
  return;
}

// Set up discovery handler
hardwareBridge.onPeerDiscovered((peer) => {
  console.log('Found peer:', peer.name, peer.id);
  
  // Connect to the peer
  await hardwareBridge.connectToPeer(peer.id);
});

// Start scanning
const scanResult = await hardwareBridge.scanForPeers({
  duration: 15000, // 15 seconds
  allowDuplicates: false
});

console.log(`Scan complete: ${scanResult.peersFound} peers found`);
```

### Send/Receive Data

```javascript
// Send data to connected peer
await hardwareBridge.sendToPeer(deviceId, {
  type: 'HELLO',
  message: 'Hello from 404 Found!',
  publicKey: myPublicKey
});

// Listen for incoming data
hardwareBridge.onDataReceived((deviceId, data) => {
  console.log(`Received from ${deviceId}:`, data);
  
  // Handle the message
  if (data.type === 'HELLO') {
    // Respond or process
  }
});
```

---

## Permission Summary

| Platform | Permission | Required For | When Prompted |
|----------|-----------|--------------|---------------|
| Android 12+ | `BLUETOOTH_SCAN` | Discovering peers | First scan |
| Android 12+ | `BLUETOOTH_CONNECT` | Connecting to peers | First connect |
| Android 12+ | `BLUETOOTH_ADVERTISE` | Broadcasting presence | First advertise |
| Android 12+ | `ACCESS_FINE_LOCATION` | Location-based discovery | First scan |
| Android 12+ | `ACCESS_BACKGROUND_LOCATION` | Background scanning | After location permission |
| Android 12+ | `FOREGROUND_SERVICE` | Persistent background | App install |
| Android 11- | `BLUETOOTH` | All BLE operations | App install |
| Android 11- | `BLUETOOTH_ADMIN` | BLE admin functions | App install |
| Android 11- | `ACCESS_FINE_LOCATION` | BLE scanning | First scan |
| iOS 13+ | `NSBluetoothAlwaysUsageDescription` | Background BLE | First BLE use |
| iOS 13+ | `NSBluetoothPeripheralUsageDescription` | BLE peripheral | First BLE use |

---

## Troubleshooting

### Android Issues

1. **Scan fails silently**: Check if location services are enabled (required for BLE on Android)
2. **Background scan stops**: Ensure `FOREGROUND_SERVICE` permission and service is running
3. **"Permission denied" on Android 12+**: Request `BLUETOOTH_SCAN` at runtime, not just in manifest

### iOS Issues

1. **No permission dialog**: Check `NSBluetoothAlwaysUsageDescription` is in Info.plist
2. **Background scanning stops**: Verify `bluetooth-central` in `UIBackgroundModes`
3. **App rejected by App Store**: Must provide privacy policy explaining Bluetooth use
4. **Scan finds no devices**: Ensure device Bluetooth is on and app has permission

---

## Next Steps

1. Add Android platform: `npm run cap:add:android`
2. Edit `AndroidManifest.xml` with permissions from this guide
3. Add iOS platform: `npm run cap:add:ios`
4. Edit `Info.plist` with permissions from this guide
5. Build and test: `npm run build:cap`
