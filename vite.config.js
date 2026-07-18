import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['.ngrok-free.dev']
  },
  build: {
    // Code-splitting: en vez de un único bundle de ~2 MB, separa las librerías en
    // chunks. Baja el PICO de memoria del build (rollup/esbuild minifican piezas más
    // pequeñas) — mitiga los OOM al compilar en servidores con poca RAM — y mejora la
    // caché del navegador. leaflet solo lo usa el mapa de zonas de entrega (carga aparte).
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('leaflet')) return 'vendor-leaflet'
          if (id.includes('react-dom') || id.includes('react-router') || id.includes('/scheduler/') || /\/react\//.test(id)) return 'vendor-react'
          if (id.includes('socket.io')) return 'vendor-socket'
          return 'vendor'
        },
      },
    },
    chunkSizeWarningLimit: 1200,
  },
})
