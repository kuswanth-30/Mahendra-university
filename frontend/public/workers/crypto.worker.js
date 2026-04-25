/**
 * Crypto Worker - Background Ed25519 Operations for 404 Found
 * 
 * Runs in separate thread to keep UI responsive at 60fps
 * Handles: key generation, signing, verification, export/import
 * 
 * Message Protocol:
 * - INIT: Initialize crypto with stored keys or generate new
 * - SIGN: Sign a payload
 * - VERIFY: Verify a signed message
 * - EXPORT: Export keys (with optional password)
 * - IMPORT: Import keys from backup
 * - WIPE: Destroy all keys
 */

// Web Crypto API is available in WebWorkers
const KEY_ALGORITHM = 'Ed25519';

// State
let keyPair = null;
let keyId = null;
let publicKeyBase64 = null;

/**
 * Generate new Ed25519 key pair
 */
async function generateKeyPair() {
  keyPair = await crypto.subtle.generateKey(
    { name: KEY_ALGORITHM },
    true, // Extractable for storage
    ['sign', 'verify']
  );
  
  keyId = `key-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Export public key for sharing
  const publicKeySpki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  publicKeyBase64 = arrayBufferToBase64(publicKeySpki);
  
  return {
    keyId,
    publicKey: publicKeyBase64,
  };
}

/**
 * Import key pair from stored data
 */
async function importKeyPair(storedKeys) {
  const { publicKey: pubKeyB64, privateKey: privKeyB64, keyId: storedKeyId } = storedKeys;
  
  // Import public key
  const publicKeyBuffer = base64ToArrayBuffer(pubKeyB64);
  const publicKey = await crypto.subtle.importKey(
    'spki',
    publicKeyBuffer,
    { name: KEY_ALGORITHM },
    true,
    ['verify']
  );
  
  // Import private key
  const privateKeyBuffer = base64ToArrayBuffer(privKeyB64);
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    { name: KEY_ALGORITHM },
    true,
    ['sign']
  );
  
  keyPair = { publicKey, privateKey };
  keyId = storedKeyId;
  publicKeyBase64 = pubKeyB64;
  
  return { keyId, publicKey: publicKeyBase64 };
}

/**
 * Sign a message payload
 */
async function signMessage(payload) {
  if (!keyPair) {
    throw new Error('No keys available');
  }
  
  const payloadString = JSON.stringify(payload);
  const encoder = new TextEncoder();
  const data = encoder.encode(payloadString);
  
  const signature = await crypto.subtle.sign(
    { name: KEY_ALGORITHM },
    keyPair.privateKey,
    data
  );
  
  return {
    payload,
    signature: arrayBufferToBase64(signature),
    publicKey: publicKeyBase64,
    timestamp: Date.now(),
    keyId,
  };
}

/**
 * Verify a signed message
 */
async function verifyMessage(signedMessage) {
  const { payload, signature, publicKey: signerPubKey, timestamp } = signedMessage;
  
  // Validate timestamp
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  
  if (timestamp > now + 60000) {
    return { valid: false, error: 'Message timestamp in future', tampered: true };
  }
  if (timestamp < now - maxAge) {
    return { valid: false, error: 'Message too old', tampered: false };
  }
  
  try {
    // Import signer's public key
    const publicKeyBuffer = base64ToArrayBuffer(signerPubKey);
    const signerPublicKey = await crypto.subtle.importKey(
      'spki',
      publicKeyBuffer,
      { name: KEY_ALGORITHM },
      false,
      ['verify']
    );
    
    // Verify
    const payloadString = JSON.stringify(payload);
    const data = new TextEncoder().encode(payloadString);
    const signatureBuffer = base64ToArrayBuffer(signature);
    
    const isValid = await crypto.subtle.verify(
      { name: KEY_ALGORITHM },
      signerPublicKey,
      signatureBuffer,
      data
    );
    
    if (isValid) {
      return { valid: true, payload };
    } else {
      return { valid: false, error: 'Signature verification failed', tampered: true };
    }
  } catch (error) {
    return { valid: false, error: error.message, tampered: false };
  }
}

/**
 * Export keys for backup
 */
async function exportKeys(password = null) {
  if (!keyPair) {
    return { success: false, error: 'No keys to export' };
  }
  
  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  
  const exportData = {
    publicKey: publicKeyJwk,
    privateKey: privateKeyJwk,
    keyId,
    createdAt: Date.now(),
    version: '1.0',
  };
  
  let exportString = JSON.stringify(exportData);
  
  // Encrypt if password provided
  if (password) {
    exportString = await encryptExport(exportString, password);
  }
  
  return { success: true, exportData: btoa(exportString) };
}

/**
 * Import keys from backup
 */
async function importKeys(exportData, password = null) {
  try {
    let jsonString = atob(exportData);
    
    if (password) {
      jsonString = await decryptExport(jsonString, password);
    }
    
    const exportObj = JSON.parse(jsonString);
    
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      exportObj.publicKey,
      { name: KEY_ALGORITHM },
      true,
      ['verify']
    );
    
    const privateKey = await crypto.subtle.importKey(
      'jwk',
      exportObj.privateKey,
      { name: KEY_ALGORITHM },
      true,
      ['sign']
    );
    
    keyPair = { publicKey, privateKey };
    keyId = exportObj.keyId || `imported-${Date.now()}`;
    
    const publicKeySpki = await crypto.subtle.exportKey('spki', publicKey);
    publicKeyBase64 = arrayBufferToBase64(publicKeySpki);
    
    return { success: true, keyId, publicKey: publicKeyBase64 };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Wipe all keys
 */
async function wipeKeys() {
  keyPair = null;
  keyId = null;
  publicKeyBase64 = null;
  
  // Force garbage collection hint
  if (typeof gc !== 'undefined') {
    gc();
  }
  
  return { success: true };
}

// Helper functions

async function encryptExport(data, password) {
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);
  const passwordHash = await crypto.subtle.digest('SHA-256', passwordData);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    passwordHash,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encoder.encode(data)
  );
  
  const result = new Uint8Array(iv.length + encrypted.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(encrypted), iv.length);
  
  return arrayBufferToBase64(result.buffer);
}

async function decryptExport(encryptedData, password) {
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);
  const passwordHash = await crypto.subtle.digest('SHA-256', passwordData);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    passwordHash,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  const data = base64ToArrayBuffer(encryptedData);
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    ciphertext
  );
  
  return new TextDecoder().decode(decrypted);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Message handler
self.onmessage = async (event) => {
  const { id, type, payload } = event.data;
  
  try {
    let result;
    
    switch (type) {
      case 'INIT':
        if (payload.existingKeys) {
          result = await importKeyPair(payload.existingKeys);
        } else {
          result = await generateKeyPair();
        }
        break;
        
      case 'SIGN':
        result = await signMessage(payload.data);
        break;
        
      case 'VERIFY':
        result = await verifyMessage(payload.signedMessage);
        break;
        
      case 'EXPORT':
        result = await exportKeys(payload.password);
        break;
        
      case 'IMPORT':
        result = await importKeys(payload.exportData, payload.password);
        break;
        
      case 'WIPE':
        result = await wipeKeys();
        break;
        
      case 'GET_PUBLIC_KEY':
        result = { keyId, publicKey: publicKeyBase64 };
        break;
        
      default:
        result = { error: `Unknown command: ${type}` };
    }
    
    self.postMessage({ id, type, result, error: null });
  } catch (error) {
    self.postMessage({ id, type, result: null, error: error.message });
  }
};

// Signal ready
self.postMessage({ type: 'READY', result: { ready: true } });
