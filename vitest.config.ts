import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: rootDir,
  tsconfig: path.resolve(rootDir, 'tsconfig.base.json'),
  resolve: {
    alias: {
      '@azzel/shared': path.resolve(rootDir, 'packages/shared/src/index.ts'),
      '@': path.resolve(rootDir, 'apps/web/src'),
    },
  },
  test: {
    environment: 'node',
    include: [
      'packages/shared/src/**/*.test.ts',
      'apps/web/src/**/*.test.ts',
      'apps/runners/src/**/*.test.ts',
    ],
  },
});
