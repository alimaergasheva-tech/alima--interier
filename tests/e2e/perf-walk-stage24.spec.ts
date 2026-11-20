import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

// Задача 24.4: замер D-08 в режиме «Прогулка» со всеми включёнными светильниками.
// Запуск (production-сборка, видимое окно Chrome):
//   PERF=1 PERF_BUILD=1 E2E_PORT=4173 npm run e2e -- --project=chrome tests/e2e/perf-walk-stage24.spec.ts
// Результат — docs/stage-24/perf-<метка>.json (PERF_LABEL, по умолчанию «mac»). Пороги проверяются мягко.

test.skip(!process.env.PERF, 'замеры скорости включаются переменной PERF=1');
test.use({ headless: false });

const D08 = { fpsMin: 60, frameP95MsMax: 20 };

async function frameStats(page: Page, ms: number, motion?: () => Promise<void>) {
  await page.evaluate((duration) => {
    const w = window as unknown as { __frames: number[]; __stop: boolean };
    w.__frames = []; w.__stop = false;
    let last = performance.now();
    const tick = (now: number) => { w.__frames.push(now - last); last = now; if (!w.__stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    setTimeout(() => { w.__stop = true; }, duration);
  }, ms);
  const started = Date.now();
  if (motion) while (Date.now() - started < ms) await motion();
  else await page.waitForTimeout(ms);
  await page.waitForTimeout(150);
  return page.evaluate(() => {
    const frames = (window as unknown as { __frames: number[] }).__frames.slice(2);
    const sorted = [...frames].sort((a, b) => a - b);
    const total = frames.reduce((a, b) => a + b, 0);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
    return { frames: frames.length, fps: +(1000 * frames.length / total).toFixed(1), p95Ms: +q(0.95).toFixed(2), p99Ms: +q(0.99).toFixed(2), maxMs: +Math.max(...frames).toFixed(2) };
  });
}

test('замер D-08: прогулка по квартире со всеми включёнными светильниками', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chrome');
  test.setTimeout(240_000);
  await page.goto('/');
  await page.getByRole('button', { name: '2 комнаты' }).click();
  await page.getByLabel('Примерная площадь квартиры').fill('57');
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await page.locator('.template-card').filter({ hasText: '2А' }).click();
  await page.getByRole('button', { name: 'Перейти к настройке' }).click();
  await page.getByRole('button', { name: 'Открыть интерьер' }).click();
  await page.waitForFunction(() => window.__planner?.sceneInfo != null);
  const rooms = await page.getByLabel('Активная комната').locator('option').evaluateAll((nodes) => nodes.map((n) => (n as HTMLOptionElement).value));
  const toggle = page.getByRole('switch', { name: 'Свет в комнате' });
  for (const id of rooms) {
    await page.getByLabel('Активная комната').selectOption(id);
    await page.waitForFunction((r) => window.__planner!.sceneInfo?.roomId === r, id);
    if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  }
  await page.getByRole('button', { name: 'Ночь' }).click();
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Прогулка', exact: true }).click();
  await page.waitForFunction(() => window.__planner!.walk != null);
  const enterMs = Date.now() - t0;
  const idle = await frameStats(page, 5000);
  await page.keyboard.down('Shift');
  await page.keyboard.down('KeyW');
  const moving = await frameStats(page, 6000);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('Shift');
  const report = {
    date: new Date().toISOString(), build: process.env.PERF_BUILD ? 'production' : 'dev', thresholdsD08: D08,
    rooms: rooms.length, enterWalkMs: enterMs, lightsActive: await page.evaluate(() => window.__planner!.walkLights), idle, moving,
  };
  mkdirSync('docs/stage-24', { recursive: true });
  const file = `docs/stage-24/perf-${process.env.PERF_LABEL ?? 'mac'}.json`;
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`[perf-walk] ${file}\n${JSON.stringify(report, null, 2)}`);
  expect.soft(moving.p95Ms, 'p95 кадра при ходьбе ≤ 20 мс (D-08)').toBeLessThanOrEqual(D08.frameP95MsMax);
  expect.soft(idle.fps, 'FPS на месте ≥ 60 (D-08)').toBeGreaterThanOrEqual(D08.fpsMin - 1);
  expect(report.lightsActive.length).toBeLessThanOrEqual(4);
});
