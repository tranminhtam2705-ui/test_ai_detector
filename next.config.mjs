/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['playwright-core'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('playwright-core');
    }
    return config;
  },
};

export default nextConfig;
