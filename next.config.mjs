import nextPwa from 'next-pwa';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export for Capacitor PWA
  output: 'export',
  distDir: 'frontend/out',
  
  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },
  
  // TypeScript (allow build with errors for dev)
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Trailing slashes for static hosting
  trailingSlash: true,
  
  experimental: {
  },
  
  // Turbopack configuration - silences errors while maintaining Webpack compatibility
  // This allows custom Webpack configs (like next-pwa) to work correctly
  turbopack: {
    // Empty config object silences the turbopack warning
    // Webpack (via next-pwa) handles custom configurations
  },
  
  // Webpack configuration for BROWSER/PWA environment
  // Optimized for @libp2p/webrtc and @libp2p/mdns in browser
  webpack: (config, { isServer }) => {
    // BROWSER-SIDE CONFIGURATION (not SSR)
    if (!isServer) {
      // Disable Node.js modules that don't exist in browsers
      config.resolve.fallback = {
        ...config.resolve.fallback,
        // Core Node.js modules (not available in browser)
        fs: false,
        net: false,
        tls: false,
        crypto: false, // Use Web Crypto API instead
        stream: false,
        os: false,
        path: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        buffer: false,
        process: false,
        querystring: false,
        string_decoder: false,
        util: false,
        events: false,
        punycode: false,
        dgram: false,
        dns: false,
        // Node: prefixed modules (ESM compatibility)
        'node:stream': false,
        'node:process': false,
        'node:util': false,
        'node:events': false,
        'node:buffer': false,
        'node:crypto': false,
      };
      
      // BROWSER: Handle LibP2P ESM modules properly
      // @libp2p/webrtc and @libp2p/mdns are ESM-only and need special handling
      config.module.rules.push({
        test: /\.(js|mjs|jsx|ts|tsx)$/,
        include: [
          /node_modules\/(?:libp2p|@libp2p|@chainsafe|@noble|it-|uint8arrays|multiformats|@multiformats)/,
        ],
        type: 'javascript/auto',
        resolve: {
          fullySpecified: false,
        },
      });
      
      // BROWSER: Ignore native modules that can't be bundled
      // ws (WebSocket library for Node) and electron not needed in browser
      config.externals.push(
        /^node:.*$/,
        'ws',
        'electron',
        'wrtc', // Native WebRTC module (browser has native WebRTC)
      );
    }
    return config;
  },
}

// Configure next-pwa with Stale-while-revalidate strategy
const withPwa = nextPwa({
  dest: 'public', // Service worker output directory
  register: true, // Register service worker
  skipWaiting: true, // Skip waiting for service worker activation
  disable: process.env.NODE_ENV === 'development', // Disable in development
  
  // Runtime caching strategies
  runtimeCaching: [
    {
      // Static assets - Stale-while-revalidate
      urlPattern: /\.(?:js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'static-assets',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
      },
    },
    {
      // Next.js static chunks
      urlPattern: /\/_next\/static\/.*/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'next-static',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
      },
    },
    {
      // API calls - Network first with cache fallback
      urlPattern: /\/api\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api-cache',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 5 * 60, // 5 minutes
        },
        networkTimeoutSeconds: 3,
      },
    },
    {
      // HTML pages - Stale-while-revalidate
      urlPattern: /\/.*$/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'pages',
        expiration: {
          maxEntries: 20,
          maxAgeSeconds: 24 * 60 * 60, // 1 day
        },
      },
    },
  ],
  
  // Fallback for offline
  fallbacks: {
    document: '/offline.html', // Fallback page for offline
  },
});

export default withPwa(nextConfig)
