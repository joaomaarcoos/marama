/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // pdf-parse usa pdfjs-dist que chama Object.defineProperty na inicialização
  // do módulo — incompatível com o bundler RSC do webpack. Excluir do bundle
  // faz com que sejam carregados via require() nativo em runtime.
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist'],
  webpack: (config, { dev }) => {
    if (dev) {
      // Avoid stale filesystem cache chunks in local dev, especially in synced folders.
      config.cache = false
    }
    return config
  },
}

export default nextConfig
