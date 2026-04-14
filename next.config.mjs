/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // pdf-parse v1 usa require() dinâmico dentro da função — não precisa de
  // serverComponentsExternalPackages nem de webpack externals para pdfjs-dist.
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false
    }
    return config
  },
}

export default nextConfig
