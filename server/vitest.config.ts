// server/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@arena/shared': new URL('../shared/src/index.ts', import.meta.url).pathname,
    },
  },
});
