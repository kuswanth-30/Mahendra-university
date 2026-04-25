/**
 * LibP2P Configuration for 404 Found Mesh Network
 * Sets up P2P node with GossipSub, WebRTC, and WebSocket transports
 */

import { createLibp2p, Libp2pOptions } from 'libp2p';
import { webSockets } from '@libp2p/websockets';
import { webRTC } from '@libp2p/webrtc';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { identify } from '@libp2p/identify';
import { bootstrap } from '@libp2p/bootstrap';

// 404 Found mesh topic
export const MESH_TOPIC = '404-found-mesh/v1';

// Bootstrap nodes (can be empty for pure P2P mode)
const BOOTSTRAP_LIST: string[] = [];

/**
 * Create LibP2P node configuration
 */
export function createLibp2pConfig(): Libp2pOptions {
  const config: Libp2pOptions = {
    transports: [
      webSockets(),
      webRTC({
        // WebRTC for browser-to-browser communication
        rtcConfiguration: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
          ],
        },
      }),
      // TCP for Capacitor native (Node.js environment)
      ...(typeof window === 'undefined' ? [tcp()] : []),
    ],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
    services: {
      identify: identify(),
      pubsub: gossipsub({
        emitSelf: false,
        gossipIncoming: true,
        fallbackToFloodsub: true,
        allowedTopics: [MESH_TOPIC],
        scoreParams: {
          topics: {
            [MESH_TOPIC]: {
              topicWeight: 1,
            },
          },
        },
      }),
    },
    connectionManager: {
      minConnections: 0,
      maxConnections: 20,
      autoDial: true,
    },
    peerDiscovery: BOOTSTRAP_LIST.length > 0 
      ? [
          bootstrap({
            list: BOOTSTRAP_LIST,
            timeout: 0,
            tagName: 'bootstrap',
            tagValue: 50,
            tagTTL: 120000,
          }),
        ]
      : undefined,
  };

  return config;
}

/**
 * Initialize LibP2P node
 */
export async function createMeshNode() {
  const config = createLibp2pConfig();
  const node = await createLibp2p(config);
  
  console.log('404 FOUND: [LIBP2P] Node created with ID:', node.peerId.toString());
  
  // Subscribe to mesh topic
  await node.services.pubsub?.subscribe(MESH_TOPIC);
  console.log('404 FOUND: [LIBP2P] Subscribed to topic:', MESH_TOPIC);
  
  return node;
}

export { createLibp2p };
