import { defineConfig } from '@playwright/test';

// Целевые браузеры по SPEC D-08: установленные в системе Chrome и Edge.
// E2E_PORT позволяет не пересекаться с уже запущенным dev-сервером (его HMR-состояние искажает динамические импорты тестов).
const port = Number(process.env.E2E_PORT ?? 5173);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1920, height: 1080 },
  },
  projects: [
    { name: 'chrome', use: { channel: 'chrome' } },
    { name: 'edge', use: { channel: 'msedge' } },
  ],
  webServer: {
    // PERF_BUILD=1: замеры скорости идут на production-сборке, а не на dev-сервере (этап 18.3).
    command: process.env.PERF_BUILD
      ? `VITE_PLANNER_DEBUG=1 npm run build && npm run preview -- --port ${port} --strictPort`
      : `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
