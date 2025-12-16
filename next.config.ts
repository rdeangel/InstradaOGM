import type { NextConfig } from 'next';

// NOTE: Security headers are now evaluated at RUNTIME (in the async headers() function)
// This allows ALLOW_HTTP to be changed without rebuilding the application
// Previously, allowHttp was evaluated at BUILD TIME, which caused issues when
// ALLOW_HTTP was changed after building

const nextConfig: NextConfig = {
  output: 'standalone',
  /* config options here */
  env: {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    NEXT_PUBLIC_APP_VERSION: require('./package.json').version,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // NOTE: Backup uploads use streaming (busboy) to handle large files (1GB+)
  // without loading them into memory. No special Next.js body size configuration needed.
  // The actual upload size limit is controlled by NGINX (client_max_body_size 1G).
  // See: src/app/api/settings/backup/versions/route.ts and src/app/api/settings/backup/route.ts

  webpack: (config, { isServer }) => {
    if (isServer) {
      // Mark Node.js built-in modules as external to prevent bundling issues
      config.externals = config.externals || [];
      config.externals.push({
        'https': 'commonjs https',
        'http': 'commonjs http',
        'fs': 'commonjs fs',
        'path': 'commonjs path',
        'child_process': 'commonjs child_process',
      });
    }
    return config;
  },
};

export default nextConfig;
