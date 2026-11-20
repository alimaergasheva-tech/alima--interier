import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { visibleBox } from './helpers';

// Этап 18.3: замеры скорости по порогам D-08 на комнате с полной расстановкой.
// Запуск (production-сборка, видимое окно Chrome, чтобы работала видеокарта):
//   PERF=1 PERF_BUILD=1 E2E_PORT=4173 npm run e2e -- --project=chrome tests/e2e/perf-stage18.spec.ts
// Результат пишется в docs/stage-18/perf-<метка>.json. Метка — переменная PERF_LABEL (по умолчанию «mac»).
// Пороги D-08 проверяются мягко (expect.soft): отчёт создаётся и при превышении.

test.skip(!process.env.PERF, 'замеры скорости включаются переменной PERF=1');
test.use({ headless: false, launchOptions: { args: ['--js-flags=--expose-gc'] } });

const D08 = { fpsMin: 60, frameP95MsMax: 20, sceneReadyMsMax: 3000, modelAppearMsMax: 2000 };

const PLACE: Array<{ id: string; fx: number; fz: number }> = [
  { id: 'sofa_03', fx: -0.2, fz: -0.33 },
  { id: 'modern_coffee_table_02', fx: -0.2, fz: -0.05 },
  { id: 'vintage_electric_kettle', fx: -0.2, fz: -0.05 },
  { id: 'dining_table', fx: 0.22, fz: 0.25 },
  { id: 'dining_chair_02', fx: 0.12, fz: 0.07 },
  { id: 'dining_chair_02', fx: 0.32, fz: 0.07 },
  { id: 'electric_stove', fx: -0.4, fz: 0.15 },
];

async function dragFromCatalog(page: Page, id: string, to: { x: number; y: number }) {
  const card = (await visibleBox(page.locator(`[data-catalog-id="${id}"]`)))!;
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

/** Кадры requestAnimationFrame за заданное время: частота, 95-й процентиль и максимум времени кадра. */
async function frameStats(page: Page, ms: number, motion?: () => Promise<void>) {
  await page.evaluate((duration) => {
    const w = window as unknown as { __frames: number[]; __stop: boolean };
    w.__frames = []; w.__stop = false;
    let last = performance.now();
    const tick = (now: number) => {
      w.__frames.push(now - last); last = now;
      if (!w.__stop) requestAnimationFrame(tick);
    };
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
    return { frames: frames.length, fps: +(1000 * frames.length / total).toFixed(1), meanMs: +(total / frames.length).toFixed(2), p95Ms: +q(0.95).toFixed(2), p99Ms: +q(0.99).toFixed(2), maxMs: +Math.max(...frames).toFixed(2) };
  });
}

const heapMb = (page: Page) => page.evaluate(() => {
  (window as unknown as { gc?: () => void }).gc?.();
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? +(memory.usedJSHeapSize / 1048576).toFixed(1) : null;
});

test('замеры D-08: готовность, появление модели, FPS, переходы между комнатами, память', async ({ page, browserName }, testInfo) => {
  test.skip(testInfo.project.name !== 'chrome');
  test.setTimeout(300_000);
  const report: Record<string, unknown> = { date: new Date().toISOString(), browser: browserName, thresholdsD08: D08, build: process.env.PERF_BUILD ? 'production' : 'dev' };

  await page.goto('/');
  await page.getByRole('button', { name: '2 комнаты' }).click();
  await page.getByLabel('Примерная площадь квартиры').fill('57');
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await page.locator('.template-card').filter({ hasText: '2А' }).click();
  await page.getByRole('button', { name: 'Перейти к настройке' }).click();
  const openStart = Date.now();
  await page.getByRole('button', { name: 'Открыть интерьер' }).click();
  await page.waitForFunction(() => window.__planner?.sceneInfo != null && window.__planner.toClient('plan', 0, 0) != null);
  report.sceneReadyAfterClickMs = Date.now() - openStart;
  report.sceneReadyMs = await page.evaluate(() => window.__planner!.sceneReadyMs);
  report.hardware = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return { gpu: gl && info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null, cores: navigator.hardwareConcurrency, memoryGb: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null, userAgent: navigator.userAgent, dpr: window.devicePixelRatio, screen: `${screen.width}×${screen.height}`, viewport: `${innerWidth}×${innerHeight}` };
  });
  await page.getByLabel('Показать для всех комнат').check();

  const size = await page.evaluate(() => window.__planner!.sceneInfo!.clearCm);
  const c = (await page.evaluate(() => window.__planner!.activeRoomCenter()))!;
  const modelAppearMs: Record<string, number> = {};
  for (const item of PLACE) {
    const p = { x: c.xCm + item.fx * size.width, z: c.zCm + item.fz * size.depth };
    const to = await page.evaluate(([x, z]) => window.__planner!.toClient('plan', x, z)!, [p.x, p.z] as const);
    const before = (await page.evaluate(() => window.__planner!.sceneFurniture)).length;
    const t0 = Date.now();
    await dragFromCatalog(page, item.id, to);
    try {
      await page.waitForFunction((n) => window.__planner!.sceneFurniture.length > n, before, { timeout: 15_000 });
    } catch {
      const status = await page.getByTestId('status').textContent();
      const have = (await page.evaluate(() => window.__planner!.furniture())).map((f) => f.catalogItemId);
      throw new Error(`Предмет «${item.id}» не поставлен. Статус: «${status}». Уже стоят: ${have.join(', ') || 'ничего'}. Окно: ${JSON.stringify(await page.evaluate(() => [innerWidth, innerHeight]))}`);
    }
    // Появление модели: от отпускания кнопки до готовой измеренной модели в 3D (а не до записи в проект).
    await page.waitForFunction((id) => window.__planner!.measured[id] != null, item.id, { timeout: 15_000 });
    modelAppearMs[`${item.id}@${item.fx}`] = Date.now() - t0;
  }
  report.modelAppearMs = modelAppearMs;
  const placed = await page.evaluate(() => window.__planner!.sceneFurniture.length);
  report.furnitureCount = placed;
  expect(placed, 'расстановка выполнена').toBe(PLACE.length);

  const canvas = (await page.locator('.view-scene canvas').boundingBox())!;
  const cx = canvas.x + canvas.width / 2, cy = canvas.y + canvas.height / 2;
  report.fpsIdle = await frameStats(page, 5000);
  let angle = 0;
  report.fpsOrbit = await frameStats(page, 6000, async () => {
    // Вращение камеры: перетаскивание по пустому месту вида.
    await page.mouse.move(canvas.x + 40, canvas.y + 40);
    await page.mouse.down();
    angle += 0.5;
    await page.mouse.move(canvas.x + 40 + 200 * Math.cos(angle), canvas.y + 40 + 60 * Math.sin(angle), { steps: 6 });
    await page.mouse.up();
  });
  void cx; void cy;

  // Повторные переходы между комнатами: время смены и рост памяти.
  const rooms = await page.getByLabel('Активная комната').locator('option').evaluateAll((nodes) => nodes.map((n) => (n as HTMLOptionElement).value));
  expect(rooms.length).toBeGreaterThanOrEqual(2);
  const heapBefore = await heapMb(page);
  const switches: number[] = [];
  for (let i = 0; i < 20; i += 1) {
    const room = rooms[i % rooms.length]!;
    const t0 = Date.now();
    await page.evaluate((id) => window.__planner!.setActiveRoom(id), room);
    await page.waitForFunction((id) => window.__planner!.sceneInfo?.roomId === id, room, { timeout: 15_000 });
    switches.push(Date.now() - t0);
  }
  await page.waitForTimeout(500);
  const heapAfter = await heapMb(page);
  report.roomSwitch = { count: switches.length, meanMs: Math.round(switches.reduce((a, b) => a + b, 0) / switches.length), maxMs: Math.max(...switches), heapBeforeMb: heapBefore, heapAfterMb: heapAfter };

  mkdirSync('docs/stage-18', { recursive: true });
  const file = `docs/stage-18/perf-${process.env.PERF_LABEL ?? 'mac'}.json`;
  writeFileSync(file, JSON.stringify(report, null, 2));
  console.log(`[perf] ${file}\n${JSON.stringify(report, null, 2)}`);

  const idle = report.fpsIdle as { fps: number; p95Ms: number };
  const orbit = report.fpsOrbit as { fps: number; p95Ms: number };
  expect.soft(report.sceneReadyMs as number, 'готовность сцены ≤ 3 с (D-08)').toBeLessThanOrEqual(D08.sceneReadyMsMax);
  expect.soft(Math.max(...Object.values(modelAppearMs)), 'появление модели ≤ 2 с (D-08)').toBeLessThanOrEqual(D08.modelAppearMsMax);
  expect.soft(orbit.p95Ms, 'p95 кадра при вращении ≤ 20 мс (D-08)').toBeLessThanOrEqual(D08.frameP95MsMax);
  expect.soft(idle.fps, 'FPS без движения ≥ 60 (D-08)').toBeGreaterThanOrEqual(D08.fpsMin - 1);
});
