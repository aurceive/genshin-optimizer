import { defineConfig } from 'vitest/config'

import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin'

export default defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/gi/lapic-ui',
  plugins: [nxViteTsPaths()],
  test: {
    name: 'gi-lapic-ui',
    globals: true,
    cache: { dir: '../../../node_modules/.vitest' },
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/gi/lapic-ui',
      provider: 'v8',
    },
  },
})
