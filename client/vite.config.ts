import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: { '@arena/shared': resolve(__dirname, '../shared/src/index.ts') },
  },
  server: {
    proxy: {
      '/rooms': 'http://localhost:3000',
      '/paused-match': 'http://localhost:3000',
      '/socket.io': { target: 'http://localhost:3000', ws: true },
    },
  },
});
