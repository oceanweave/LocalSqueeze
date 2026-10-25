import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: ["sharp", "@neslinesli93/qpdf-wasm"]
    }
  }
});