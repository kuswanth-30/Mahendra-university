/**
 * Webpack Configuration for 404 Found WebWorkers
 * 
 * Builds dedicated workers for:
 * - Crypto operations (Ed25519 signing/verification)
 * - Sync operations (Gossip protocol, network I/O)
 * 
 * Workers run in background threads to keep UI at 60fps
 */

const path = require('path');

module.exports = {
  mode: 'production',
  target: 'webworker',
  entry: {
    'crypto.worker': './frontend/public/workers/crypto.worker.js',
    'sync.worker': './frontend/public/workers/sync.worker.js',
    'mesh.worker': './frontend/public/workers/mesh.worker.js',
  },
  output: {
    path: path.resolve(__dirname, 'frontend/public/workers'),
    filename: '[name].bundle.js',
    clean: false, // Don't clean, we keep source files
  },
  resolve: {
    extensions: ['.js', '.ts', '.mjs'],
    fallback: {
      fs: false,
      net: false,
      tls: false,
      crypto: false, // Use Web Crypto API in workers
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
      util: false,
      events: false,
      querystring: false,
      string_decoder: false,
      punycode: false,
      dgram: false,
      dns: false,
    },
  },
  module: {
    rules: [
      {
        test: /\.(js|mjs|ts)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', { targets: { browsers: ['last 2 versions'] } }],
              '@babel/preset-typescript',
            ],
          },
        },
      },
    ],
  },
  optimization: {
    minimize: true,
    sideEffects: false,
  },
  performance: {
    hints: false, // Disable performance warnings for workers
  },
};
