/**
 * Crypto Web Worker
 * Offloads Ed25519 signing/verification to background thread
 * Ensures UI stays at 60fps during cryptographic operations
 */

importScripts('https://cdn.jsdelivr.net/npm/@noble/ed25519@2.1.0/+esm');

interface WorkerMessage {
  type: 'SIGN' | 'VERIFY' | 'HASH' | 'INIT';
  payload?: any;
  id: string;
}

interface WorkerResponse {
  type: 'SIGN_RESULT' | 'VERIFY_RESULT' | 'HASH_RESULT' | 'ERROR';
  result?: any;
  error?: string;
  id: string;
}

// Worker state
let isInitialized = false;
let keyPair: { publicKey: Uint8Array; privateKey: Uint8Array } | null = null;

/**
 * Handle messages from main thread
 */
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, payload, id } = event.data;

  try {
    switch (type) {
      case 'INIT':
        await handleInit(id);
        break;

      case 'SIGN':
        await handleSign(payload, id);
        break;

      case 'VERIFY':
        await handleVerify(payload, id);
        break;

      case 'HASH':
        handleHash(payload, id);
        break;

      default:
        sendError('Unknown message type', id);
    }
  } catch (error) {
    sendError(error instanceof Error ? error.message : 'Unknown error', id);
  }
};

/**
 * Initialize crypto in worker
 */
async function handleInit(id: string): Promise<void> {
  try {
    // @ts-ignore - noble-ed25519 loaded via importScripts
    const ed25519 = self.nobleEd25519;

    const privateKey = ed25519.utils.randomPrivateKey();
    const publicKey = await ed25519.getPublicKey(privateKey);

    keyPair = { privateKey, publicKey };
    isInitialized = true;

    const response: WorkerResponse = {
      type: 'SIGN_RESULT',
      result: { initialized: true, publicKey: Array.from(publicKey) },
      id,
    };

    self.postMessage(response);
  } catch (error) {
    sendError('Failed to initialize crypto', id);
  }
}

/**
 * Sign data in worker
 */
async function handleSign(payload: any, id: string): Promise<void> {
  if (!isInitialized || !keyPair) {
    sendError('Crypto not initialized', id);
    return;
  }

  try {
    // @ts-ignore
    const ed25519 = self.nobleEd25519;
    const { sha256 } = await import('https://cdn.jsdelivr.net/npm/@noble/hashes@1.5.0/sha256/+esm');

    const timestamp = Date.now();
    const messageData = { ...payload, _timestamp: timestamp };
    const messageBytes = new TextEncoder().encode(JSON.stringify(messageData));
    const messageHash = sha256(messageBytes);

    const signature = await ed25519.sign(messageHash, keyPair.privateKey);

    const response: WorkerResponse = {
      type: 'SIGN_RESULT',
      result: {
        data: messageData,
        signature: Array.from(signature),
        timestamp,
      },
      id,
    };

    self.postMessage(response);
  } catch (error) {
    sendError('Signing failed', id);
  }
}

/**
 * Verify signature in worker
 */
async function handleVerify(payload: any, id: string): Promise<void> {
  try {
    // @ts-ignore
    const ed25519 = self.nobleEd25519;
    const { sha256 } = await import('https://cdn.jsdelivr.net/npm/@noble/hashes@1.5.0/sha256/+esm');

    const { data, signature, publicKey } = payload;

    const messageBytes = new TextEncoder().encode(JSON.stringify(data));
    const messageHash = sha256(messageBytes);

    const isValid = await ed25519.verify(
      new Uint8Array(signature),
      messageHash,
      new Uint8Array(publicKey)
    );

    const response: WorkerResponse = {
      type: 'VERIFY_RESULT',
      result: { valid: isValid },
      id,
    };

    self.postMessage(response);
  } catch (error) {
    sendError('Verification failed', id);
  }
}

/**
 * Hash data in worker
 */
function handleHash(payload: any, id: string): void {
  try {
    const { sha256 } = self.nobleHashes;
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const hash = sha256(bytes);

    const response: WorkerResponse = {
      type: 'HASH_RESULT',
      result: { hash: Array.from(hash) },
      id,
    };

    self.postMessage(response);
  } catch (error) {
    sendError('Hashing failed', id);
  }
}

/**
 * Send error response
 */
function sendError(message: string, id: string): void {
  const response: WorkerResponse = {
    type: 'ERROR',
    error: message,
    id,
  };

  self.postMessage(response);
}

// Export for TypeScript
export {};
