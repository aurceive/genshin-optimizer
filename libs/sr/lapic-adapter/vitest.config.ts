import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/sr/lapic-adapter',
  plugins: [nxViteTsPaths()],
  test: {
    name: 'sr-lapic-adapter',
    globals: true,
    cache: { dir: '../../../node_modules/.vitest' },
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/sr/lapic-adapter',
      provider: 'v8',
    },
  },
})
