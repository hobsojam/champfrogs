import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:3000',
  },
  // Reuses the already-running server in CI; starts one locally.
  // Requires a client build in ./dist (npm run build).
  webServer: {
    command: 'node ../server/index.js',
    url: 'http://localhost:3000/health',
    reuseExistingServer: true,
    env: { STATIC_DIR: './dist' },
  },
});
