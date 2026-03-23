import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/libs/zzz/lapic-adapter',
  plugins: [nxViteTsPaths()],
  test: {
    name: 'zzz-lapic-adapter',
    globals: true,
    cache: { dir: '../../../node_modules/.vitest' },
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/zzz/lapic-adapter',
      provider: 'v8',
    },
  },
})
