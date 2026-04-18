import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: { '@arena/shared': resolve(__dirname, '../shared/src/types.ts') },
  },
  server: { proxy: { '/socket.io': { target: 'http://localhost:3000', ws: true } } },
});
