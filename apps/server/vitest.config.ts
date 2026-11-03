import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests share one test database, so files run one after another.
    fileParallelism: false,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
});
