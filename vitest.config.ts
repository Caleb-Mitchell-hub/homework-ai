import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    globals: false,
    pool: 'forks',
    setupFiles: ['./tests/setup.ts'],
    // Note: component tests under tests/components/ set `// @vitest-environment happy-dom` per-file.
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
