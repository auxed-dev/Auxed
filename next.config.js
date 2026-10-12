/**
 * @type {import('next').NextConfig}
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // microphone: the AUX IN broadcaster captures the venue's line-in through getUserMedia.
  { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=(self)' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig = {
  // NEXT_DIST_DIR lets a production build run alongside `next dev` without clobbering .next.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '*.mzstatic.com' },
    ],
  },
  // Load the database drivers from node_modules at runtime instead of bundling them.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), '@electric-sql/pglite', 'pg', 'pg-native'];
    }
    return config;
  },
  // PASS THE AUX lives at /pass ("aux" is a reserved file name on Windows); keep early /aux links working.
  async redirects() {
    return [{ source: '/aux/:path*', destination: '/pass/:path*', permanent: true }];
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache' }, { key: 'Service-Worker-Allowed', value: '/' }] },
    ];
  },
};

module.exports = nextConfig;
