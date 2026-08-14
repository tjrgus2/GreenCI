import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['packages/core/src/**/*.ts'],
      exclude: [
        'packages/core/src/index.ts',
        'packages/core/src/datasets/generated.ts',
      ],
      thresholds: {
        lines: 85,
        branches: 80,
      },
    },
    include: ['packages/*/tests/**/*.test.ts'],
  },
});
