/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  webpack: (config, { dev }) => {
    if (dev) {
      // Avoid stale filesystem cache chunks in local dev, especially in synced folders.
      config.cache = false
    }
    return config
  },
}

export default nextConfig
