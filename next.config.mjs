/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Exclui pdf-parse/pdfjs-dist do bundle RSC (Next.js 14 usa esta chave).
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'pdfjs-dist'],
  },
  webpack: (config, { isServer, dev }) => {
    if (isServer) {
      // Força pdf-parse como external no webpack do servidor (dev e produção).
      // Isso faz webpack gerar require('pdf-parse') em vez de tentar empacotar
      // o ESM do pdfjs-dist que usa Object.defineProperty na inicialização.
      const existing = Array.isArray(config.externals)
        ? config.externals
        : config.externals != null ? [config.externals] : []
      config.externals = [
        ...existing,
        (ctx, callback) => {
          if (ctx.request === 'pdf-parse') return callback(null, 'commonjs pdf-parse')
          callback()
        },
      ]
    }
    if (dev) {
      config.cache = false
    }
    return config
  },
}

export default nextConfig
