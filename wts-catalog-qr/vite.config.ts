import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so `npm run build` works as a static demo (GitHub Pages or any host).
export default defineConfig({
  plugins: [react()],
  base: './',
});
