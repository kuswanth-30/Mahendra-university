/**
 * Geospatial Service - GPS-based filtering and Safe Routes
 * 
 * Implements location-based filtering for messages:
 * - Filters data based on user's current GPS location
 * - Safe Routes: messages displayed only within validity window and distance radius
 * - GeoJSON parsing and distance calculations
 */

/**
 * Geolocation Point
 * @typedef {Object} GeoPoint
 * @property {number} latitude - Latitude in degrees
 * @property {number} longitude - Longitude in degrees
 */

class GeoService {
  constructor() {
    this.currentLocation = null;
    this.locationWatchId = null;
    this.defaultRadius = 2000; // 2km default radius
  }

  /**
   * Initialize geolocation service
   * @returns {Promise<{success: boolean, location?: GeoPoint, error?: string}>}
   */
  async initialize() {
    try {
      if (!navigator.geolocation) {
        return { success: false, error: 'Geolocation not supported' };
      }

      // Get current location
      const position = await this._getCurrentPosition();
      
      this.currentLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp
      };

      console.log('[GeoService] Initialized with location:', this.currentLocation);
      
      // Start watching for location changes
      this._startLocationWatch();
      
      return { success: true, location: this.currentLocation };
    } catch (error) {
      console.error('[GeoService] Initialization failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current location
   * @returns {Promise<GeoPoint>}
   */
  async getCurrentLocation() {
    if (this.currentLocation) {
      return this.currentLocation;
    }

    const position = await this._getCurrentPosition();
    this.currentLocation = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      timestamp: position.timestamp
    };

    return this.currentLocation;
  }

  /**
   * Filter messages based on location
   * @param {Array} messages - Messages to filter
   * @param {Object} options - Filter options
   * @param {number} [options.radius] - Radius in meters (default 2km)
   * @param {GeoPoint} [options.location] - User location (default current)
   * @returns {Array} Filtered messages
   */
  filterByLocation(messages, options = {}) {
    const radius = options.radius || this.defaultRadius;
    const location = options.location || this.currentLocation;

    if (!location) {
      console.warn('[GeoService] No location available, returning all messages');
      return messages;
    }

    return messages.filter(message => {
      // Skip messages without location
      if (!message.metadata?.location) {
        return false;
      }

      const messageLocation = message.metadata.location;
      const distance = this._calculateDistance(
        location.latitude,
        location.longitude,
        messageLocation.latitude,
        messageLocation.longitude
      );

      return distance <= radius;
    });
  }

  /**
   * Filter Safe Routes based on validity window and distance
   * @param {Array} routes - Route messages to filter
   * @param {Object} options - Filter options
   * @param {number} [options.radius] - Radius in meters (default 2km)
   * @param {GeoPoint} [options.location] - User location (default current)
   * @returns {Array} Filtered routes
   */
  filterSafeRoutes(routes, options = {}) {
    const radius = options.radius || this.defaultRadius;
    const location = options.location || this.currentLocation;
    const now = Date.now();

    if (!location) {
      console.warn('[GeoService] No location available, returning all routes');
      return routes;
    }

    return routes.filter(route => {
      // Check if route type
      if (route.type !== 'route') {
        return false;
      }

      // Check validity window
      const validityWindow = route.content?.properties?.validityWindow || 24; // hours
      const routeTimestamp = route.metadata?.timestamp || 0;
      const expiresAt = routeTimestamp + (validityWindow * 60 * 60 * 1000);

      if (now > expiresAt) {
        return false; // Route expired
      }

      // Check distance if route has location
      if (route.metadata?.location) {
        const messageLocation = route.metadata.location;
        const distance = this._calculateDistance(
          location.latitude,
          location.longitude,
          messageLocation.latitude,
          messageLocation.longitude
        );

        return distance <= radius;
      }

      // If no location, include route (global route)
      return true;
    });
  }

  /**
   * Check if a message is within distance radius
   * @param {Object} message - Message to check
   * @param {number} radius - Radius in meters
   * @param {GeoPoint} [location] - User location (default current)
   * @returns {boolean}
   */
  isWithinRadius(message, radius, location = null) {
    const userLocation = location || this.currentLocation;
    
    if (!userLocation || !message.metadata?.location) {
      return false;
    }

    const messageLocation = message.metadata.location;
    const distance = this._calculateDistance(
      userLocation.latitude,
      userLocation.longitude,
      messageLocation.latitude,
      messageLocation.longitude
    );

    return distance <= radius;
  }

  /**
   * Calculate distance between two points using Haversine formula
   * @param {number} lat1 - Latitude of point 1
   * @param {number} lon1 - Longitude of point 1
   * @param {number} lat2 - Latitude of point 2
   * @param {number} lon2 - Longitude of point 2
   * @returns {number} Distance in meters
   * @private
   */
  _calculateDistance(lat1, lon1, lat2, lon2) {
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
   * Get current position using Geolocation API
   * @returns {Promise<GeolocationPosition>}
   * @private
   */
  _getCurrentPosition() {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000 // 1 minute cache
        }
      );
    });
  }

  /**
   * Start watching for location changes
   * @private
   */
  _startLocationWatch() {
    if (this.locationWatchId !== null) {
      return; // Already watching
    }

    this.locationWatchId = navigator.geolocation.watchPosition(
      (position) => {
        this.currentLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        };
        console.log('[GeoService] Location updated:', this.currentLocation);
      },
      (error) => {
        console.error('[GeoService] Location watch error:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  }

  /**
   * Stop watching for location changes
   */
  stopLocationWatch() {
    if (this.locationWatchId !== null) {
      navigator.geolocation.clearWatch(this.locationWatchId);
      this.locationWatchId = null;
      console.log('[GeoService] Location watch stopped');
    }
  }

  /**
   * Parse GeoJSON from route payload
   * @param {Object} geojson - GeoJSON object
   * @returns {Object} Parsed GeoJSON with coordinates
   */
  parseGeoJSON(geojson) {
    if (!geojson || !geojson.type) {
      return null;
    }

    // Handle LineString (route path)
    if (geojson.type === 'LineString' && geojson.coordinates) {
      return {
        type: 'LineString',
        coordinates: geojson.coordinates,
        center: this._calculateCenter(geojson.coordinates)
      };
    }

    // Handle Polygon (danger zone)
    if (geojson.type === 'Polygon' && geojson.coordinates) {
      return {
        type: 'Polygon',
        coordinates: geojson.coordinates,
        center: this._calculateCenter(geojson.coordinates[0])
      };
    }

    return geojson;
  }

  /**
   * Calculate center point of coordinates
   * @param {Array} coordinates - Array of [lon, lat] pairs
   * @returns {Object} { latitude, longitude }
   * @private
   */
  _calculateCenter(coordinates) {
    if (!coordinates || coordinates.length === 0) {
      return null;
    }

    let sumLat = 0;
    let sumLon = 0;

    for (const coord of coordinates) {
      sumLat += coord[1]; // latitude
      sumLon += coord[0]; // longitude
    }

    return {
      latitude: sumLat / coordinates.length,
      longitude: sumLon / coordinates.length
    };
  }
}

export const geoService = new GeoService();
export default geoService;
