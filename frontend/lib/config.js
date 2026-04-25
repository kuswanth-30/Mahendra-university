/**
 * Application Configuration for 404 Found
 */

export const CONFIG = {
  // Time-to-Live for messages in milliseconds (default 72 hours)
  MESSAGE_TTL: 72 * 60 * 60 * 1000,
  
  // How often to run the housekeeper service (default every 6 hours)
  HOUSEKEEPER_INTERVAL: 6 * 60 * 60 * 1000,
  
  // Mesh Network Settings
  MESH_NODE_ID_PREFIX: 'found404-node-',
  
  // Sharding Settings (Shamir's Secret Sharing)
  SHARDING_TOTAL: 3,  // Total number of fragments
  SHARDING_THRESHOLD: 2,  // Minimum fragments needed for reconstruction
  
  // Debug mode
  DEBUG: process.env.NODE_ENV === 'development',
};

export default CONFIG;
