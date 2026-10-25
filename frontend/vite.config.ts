import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Listen on the network too, so phones joining TV mode can load the page.
  server: { host: true },
})
