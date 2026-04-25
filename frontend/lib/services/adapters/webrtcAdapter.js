/**
 * WebRTCAdapter - WebRTC transport adapter for browser tab P2P
 * 
 * Implements the transport interface using WebRTC for high-bandwidth
 * peer-to-peer transfers between browser tabs during local testing.
 * Uses BroadcastChannel for signaling between tabs.
 */

/**
 * WebRTC Adapter class
 */
class WebRTCAdapter {
  constructor() {
    this.isDiscovering = false;
    this.peerDiscoveredCallback = null;
    this.discoveredPeers = new Map();
    this.peerConnections = new Map();
    this.dataChannels = new Map();
    this.broadcastChannel = null;
    this.localPeerId = this._generatePeerId();
    this.SIGNALING_CHANNEL = '404found-webrtc-signaling';
  }

  /**
   * _generatePeerId(): Generate a unique peer ID
   * @private
   */
  _generatePeerId() {
    return `webrtc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * initialize(): Initialize WebRTC adapter
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async initialize() {
    try {
      // Set up BroadcastChannel for signaling
      this.broadcastChannel = new BroadcastChannel(this.SIGNALING_CHANNEL);
      
      // Listen for signaling messages
      this.broadcastChannel.onmessage = (event) => {
        this._handleSignalingMessage(event.data);
      };

      // Announce presence
      this._announcePresence();

      console.log('[WebRTCAdapter] WebRTC initialized');
      return { success: true };
    } catch (error) {
      console.error('[WebRTCAdapter] Initialization failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * _announcePresence(): Announce presence to other tabs
   * @private
   */
  _announcePresence() {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        type: 'announce',
        peerId: this.localPeerId,
        timestamp: Date.now()
      });
    }
  }

  /**
   * _handleSignalingMessage(message): Handle signaling messages
   * @private
   */
  _handleSignalingMessage(message) {
    switch (message.type) {
      case 'announce':
        this._handlePeerAnnounce(message);
        break;
      case 'offer':
        this._handleOffer(message);
        break;
      case 'answer':
        this._handleAnswer(message);
        break;
      case 'ice-candidate':
        this._handleIceCandidate(message);
        break;
      default:
        console.warn('[WebRTCAdapter] Unknown message type:', message.type);
    }
  }

  /**
   * _handlePeerAnnounce(message): Handle peer announcement
   * @private
   */
  _handlePeerAnnounce(message) {
    if (message.peerId === this.localPeerId) {
      return; // Ignore self
    }

    const peer = {
      id: message.peerId,
      name: `WebRTC Peer ${message.peerId.substr(-6)}`,
      timestamp: message.timestamp,
      transport: 'webrtc'
    };

    // Update or add peer
    this.discoveredPeers.set(peer.id, peer);

    // Notify callback
    if (this.peerDiscoveredCallback) {
      this.peerDiscoveredCallback(peer);
    }

    console.log(`[WebRTCAdapter] Discovered peer: ${peer.id}`);
  }

  /**
   * startDiscovery(): Start discovering peers via WebRTC
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async startDiscovery() {
    try {
      if (this.isDiscovering) {
        console.warn('[WebRTCAdapter] Already discovering');
        return { success: false, error: 'Already discovering' };
      }

      // Initialize if not already done
      await this.initialize();

      this.isDiscovering = true;

      // Announce presence periodically
      this.discoveryInterval = setInterval(() => {
        this._announcePresence();
      }, 5000);

      // Auto-stop after 30 seconds
      setTimeout(() => {
        if (this.isDiscovering) {
          this.stopDiscovery();
        }
      }, 30000);

      console.log('[WebRTCAdapter] Discovery started');
      return { success: true };
    } catch (error) {
      console.error('[WebRTCAdapter] Discovery failed:', error);
      this.isDiscovering = false;
      return { success: false, error: error.message };
    }
  }

  /**
   * stopDiscovery(): Stop discovering peers
   * @returns {Promise<void>}
   */
  async stopDiscovery() {
    try {
      if (this.discoveryInterval) {
        clearInterval(this.discoveryInterval);
        this.discoveryInterval = null;
      }
      this.isDiscovering = false;
      console.log('[WebRTCAdapter] Discovery stopped');
    } catch (error) {
      console.error('[WebRTCAdapter] Failed to stop discovery:', error);
    }
  }

  /**
   * onPeerDiscovered(callback): Register callback for peer discovery
   * @param {Function} callback - Callback function
   */
  onPeerDiscovered(callback) {
    this.peerDiscoveredCallback = callback;
  }

  /**
   * sendData(peerId, buffer): Send data to a specific peer
   * @param {string} peerId - Peer identifier
   * @param {Uint8Array} buffer - Data to send
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async sendData(peerId, buffer) {
    try {
      // Get or create peer connection
      let peerConnection = this.peerConnections.get(peerId);
      
      if (!peerConnection) {
        peerConnection = await this._createPeerConnection(peerId);
        this.peerConnections.set(peerId, peerConnection);
      }

      // Get or create data channel
      let dataChannel = this.dataChannels.get(peerId);
      
      if (!dataChannel || dataChannel.readyState !== 'open') {
        dataChannel = await this._createDataChannel(peerConnection, peerId);
        this.dataChannels.set(peerId, dataChannel);
      }

      // Send data
      dataChannel.send(buffer);
      
      console.log(`[WebRTCAdapter] Sent ${buffer.length} bytes to ${peerId}`);
      return { success: true };
    } catch (error) {
      console.error('[WebRTCAdapter] Send data failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * _createPeerConnection(peerId): Create WebRTC peer connection
   * @private
   */
  async _createPeerConnection(peerId) {
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    };

    const peerConnection = new RTCPeerConnection(config);

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.broadcastChannel.postMessage({
          type: 'ice-candidate',
          peerId: this.localPeerId,
          targetPeerId: peerId,
          candidate: event.candidate
        });
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log(`[WebRTCAdapter] Connection state: ${peerConnection.connectionState}`);
    };

    return peerConnection;
  }

  /**
   * _createDataChannel(peerConnection, peerId): Create data channel
   * @private
   */
  async _createDataChannel(peerConnection, peerId) {
    const dataChannel = peerConnection.createDataChannel('404found-data', {
      ordered: true
    });

    return new Promise((resolve, reject) => {
      dataChannel.onopen = () => {
        console.log(`[WebRTCAdapter] Data channel open for ${peerId}`);
        resolve(dataChannel);
      };

      dataChannel.onerror = (error) => {
        console.error('[WebRTCAdapter] Data channel error:', error);
        reject(error);
      };
    });
  }

  /**
   * _handleOffer(message): Handle WebRTC offer
   * @private
   */
  async _handleOffer(message) {
    try {
      const peerConnection = await this._createPeerConnection(message.peerId);
      this.peerConnections.set(message.peerId, peerConnection);

      await peerConnection.setRemoteDescription(new RTCSessionDescription(message.offer));

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      this.broadcastChannel.postMessage({
        type: 'answer',
        peerId: this.localPeerId,
        targetPeerId: message.peerId,
        answer: answer
      });

      // Set up data channel for incoming connection
      peerConnection.ondatachannel = (event) => {
        const dataChannel = event.channel;
        this.dataChannels.set(message.peerId, dataChannel);
        
        dataChannel.onmessage = (event) => {
          console.log(`[WebRTCAdapter] Received data from ${message.peerId}`);
        };
      };
    } catch (error) {
      console.error('[WebRTCAdapter] Failed to handle offer:', error);
    }
  }

  /**
   * _handleAnswer(message): Handle WebRTC answer
   * @private
   */
  async _handleAnswer(message) {
    try {
      const peerConnection = this.peerConnections.get(message.peerId);
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(message.answer));
      }
    } catch (error) {
      console.error('[WebRTCAdapter] Failed to handle answer:', error);
    }
  }

  /**
   * _handleIceCandidate(message): Handle ICE candidate
   * @private
   */
  async _handleIceCandidate(message) {
    try {
      const peerConnection = this.peerConnections.get(message.peerId);
      if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
      }
    } catch (error) {
      console.error('[WebRTCAdapter] Failed to handle ICE candidate:', error);
    }
  }

  /**
   * getDiscoveredPeers(): Get list of discovered peers
   */
  getDiscoveredPeers() {
    return Array.from(this.discoveredPeers.values());
  }

  /**
   * isCurrentlyDiscovering(): Check if currently discovering
   */
  isCurrentlyDiscovering() {
    return this.isDiscovering;
  }

  /**
   * cleanup(): Clean up resources
   */
  cleanup() {
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
      this.broadcastChannel = null;
    }

    if (this.discoveryInterval) {
      clearInterval(this.discoveryInterval);
      this.discoveryInterval = null;
    }

    // Close all peer connections
    for (const [peerId, connection] of this.peerConnections) {
      connection.close();
    }
    this.peerConnections.clear();

    // Close all data channels
    for (const [peerId, channel] of this.dataChannels) {
      channel.close();
    }
    this.dataChannels.clear();

    this.discoveredPeers.clear();
  }
}

export { WebRTCAdapter };
