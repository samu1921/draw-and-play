import vue from '@vitejs/plugin-vue';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/**
 * Writes the files of the build into the service worker (public/sw.js), so it can keep all of them right at
 * installation: every page then opens offline, also one that was never opened before. A new build changes the
 * list and with it the service worker, which then replaces the old files.
 */
function precacheList(): Plugin {
  let outDir = 'dist';
  const files: string[] = [];
  return {
    name: 'dap-precache',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    generateBundle(_options, bundle) {
      files.push(...Object.keys(bundle).filter((name) => name.startsWith('assets/')));
    },
    closeBundle() {
      const sw = path.join(outDir, 'sw.js');
      const list = ['/index.html', '/theme-init.js', '/favicon.svg', ...files.sort().map((name) => `/${name}`)];
      const build = createHash('sha256').update(list.join('\n')).digest('hex').slice(0, 12);
      const source = readFileSync(sw, 'utf8').replace("'__BUILD__'", JSON.stringify(build)).replace('[/* __PRECACHE__ */]', JSON.stringify(list));
      writeFileSync(sw, source);
    },
  };
}

export default defineConfig({
  plugins: [vue(), precacheList()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', ws: true },
    },
  },
});
