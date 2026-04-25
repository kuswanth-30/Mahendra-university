/**
 * Geospatial Service - Location-based filtering for Gossip Protocol
 * 
 * Implements Haversine formula for distance calculation and Grid Cell ID
 * generation for privacy-preserving location sharing.
 */

class GeospatialService {
  constructor() {
    this.currentLocation = null; // { lat, long }
    this.gridCellSize = 0.01; // Grid cell size in degrees (~1km at equator)
  }

  /**
   * setCurrentLocation(lat, long): Set the current device location
   * @param {number} lat - Latitude
   * @param {number} long - Longitude
   */
  setCurrentLocation(lat, long) {
    this.currentLocation = { lat, long };
    console.log(`[Geospatial] Current location set: ${lat}, ${long}`);
  }

  /**
   * getCurrentLocation(): Get the current device location
   * @returns {Object|null} Current location { lat, long }
   */
  getCurrentLocation() {
    return this.currentLocation;
  }

  /**
   * haversineDistance(lat1, lon1, lat2, lon2): Calculate distance between two points
   * Uses the Haversine formula for great-circle distance
   * 
   * @param {number} lat1 - Latitude of point 1
   * @param {number} lon1 - Longitude of point 1
   * @param {number} lat2 - Latitude of point 2
   * @param {number} lon2 - Longitude of point 2
   * @returns {number} Distance in meters
   */
  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * generateGridCellId(lat, long): Generate Grid Cell ID for privacy
   * Hashes the general area (grid cell) instead of exact location
   * 
   * @param {number} lat - Latitude
   * @param {number} long - Longitude
   * @returns {string} Grid Cell ID (hash)
   */
  async generateGridCellId(lat, long) {
    // Round to grid cell size
    const gridLat = Math.floor(lat / this.gridCellSize) * this.gridCellSize;
    const gridLong = Math.floor(long / this.gridCellSize) * this.gridCellSize;

    // Create string representation of grid cell
    const gridCellString = `${gridLat.toFixed(4)},${gridLong.toFixed(4)}`;

    // Hash the grid cell string
    const encoder = new TextEncoder();
    const data = encoder.encode(gridCellString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return hashHex.substring(0, 16); // Return first 16 characters
  }

  /**
   * isWithinRadius(messageLat, messageLong, radius): Check if message is within radius
   * 
   * @param {number} messageLat - Message latitude
   * @param {number} messageLong - Message longitude
   * @param {number} radius - Radius in meters
   * @returns {boolean} True if within radius
   */
  isWithinRadius(messageLat, messageLong, radius) {
    if (!this.currentLocation) {
      console.warn('[Geospatial] Current location not set');
      return false;
    }

    const distance = this.haversineDistance(
      this.currentLocation.lat,
      this.currentLocation.long,
      messageLat,
      messageLong
    );

    return distance <= radius;
  }

  /**
   * sharesGridCell(peerGridCellId): Check if peer shares the same grid cell
   * 
   * @param {string} peerGridCellId - Peer's grid cell ID
   * @returns {Promise<boolean>} True if same grid cell
   */
  async sharesGridCell(peerGridCellId) {
    if (!this.currentLocation) {
      return false;
    }

    const ourGridCellId = await this.generateGridCellId(
      this.currentLocation.lat,
      this.currentLocation.long
    );

    return ourGridCellId === peerGridCellId;
  }

  /**
   * setGridCellSize(size): Set the grid cell size in degrees
   * @param {number} size - Grid cell size in degrees
   */
  setGridCellSize(size) {
    this.gridCellSize = size;
    console.log(`[Geospatial] Grid cell size set to: ${size} degrees`);
  }

  /**
   * getGridCellSize(): Get the current grid cell size
   * @returns {number} Grid cell size in degrees
   */
  getGridCellSize() {
    return this.gridCellSize;
  }
}

// Export singleton instance
export const geospatialService = new GeospatialService();
export default geospatialService;
