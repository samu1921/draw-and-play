import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  sourcemap: true,
  clean: true,
  // The domain library ships as TypeScript source and is bundled in.
  noExternal: ['@draw-and-play/domain'],
});
