import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.js'

// Unit- en emulatortests; de browsertests in e2e/ draaien met Playwright (npm run test:e2e).
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: { exclude: [...configDefaults.exclude, 'e2e/**'] },
  }),
)
