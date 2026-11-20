import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { visibleBox } from './helpers';

// Задача 16.3: проба браузерного path tracing (SPEC D-09) на обставленной комнате: 64 и 256 выборок.
// Записывает время BVH и трассировки, размер холста и браузер в docs/stage-16/pathtrace-<метка>.json
// и кадры pt-64.png, pt-256.png. Метка: PERF_LABEL (по умолчанию mac).

const PLACE = [
  { id: 'sofa_03', fx: -0.2, fz: -0.33 },
  { id: 'modern_coffee_table_02', fx: -0.2, fz: -0.05 },
  { id: 'vintage_electric_kettle', fx: -0.2, fz: -0.05 },
  { id: 'dining_table', fx: 0.22, fz: 0.25 },
  { id: 'dining_chair_02', fx: 0.12, fz: 0.07 },
  { id: 'dining_chair_02', fx: 0.32, fz: 0.07 },
  { id: 'electric_stove', fx: -0.4, fz: 0.15 },
];

test('path tracing: 64 и 256 выборок на обставленной комнате', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chrome');
  test.setTimeout(900_000);
  const out = 'docs/stage-16';
  const label = process.env.PERF_LABEL ?? 'mac';
  mkdirSync(out, { recursive: true });
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/?pathtrace');
  await page.getByRole('button', { name: '2 комнаты' }).click();
  await page.getByLabel('Примерная площадь квартиры').fill('57');
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await page.locator('.template-card').filter({ hasText: '2А' }).click();
  await page.getByRole('button', { name: 'Перейти к настройке' }).click();
  await page.getByRole('button', { name: 'Открыть интерьер' }).click();
  await page.waitForFunction(() => window.__planner?.activeRoomCenter() != null && window.__planner.sceneInfo != null && window.__planner.toClient('plan', 0, 0) != null);
  await page.getByLabel('Показать для всех комнат').check();
  const size = await page.evaluate(() => window.__planner!.sceneInfo!.clearCm);
  const c = (await page.evaluate(() => window.__planner!.activeRoomCenter()))!;
  for (const item of PLACE) {
    const to = await page.evaluate(([x, z]) => window.__planner!.toClient('plan', x, z)!, [c.xCm + item.fx * size.width, c.zCm + item.fz * size.depth] as const);
    const card = (await visibleBox(page.locator(`[data-catalog-id="${item.id}"]`)))!;
    await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
  }
  await page.waitForFunction((n) => window.__planner!.sceneFurniture.length >= n, PLACE.length, { timeout: 30_000 });
  await page.getByRole('button', { name: 'День' }).click();
  await page.evaluate(([x, z, w, d]) => window.__planner!.lookAt!([x + w * 0.4, 150, z + d * 0.45], [x - w * 0.1, 80, z - d * 0.3]), [c.xCm, c.zCm, size.width, size.depth] as const);
  await page.waitForTimeout(800);
  await page.locator('.view-scene canvas').screenshot({ path: `${out}/pt-00-raster.png` });

  const results: Record<string, unknown> = {};
  for (const samples of [64, 256]) {
    await page.evaluate(() => { delete (window as { __pathTraceResult?: unknown }).__pathTraceResult; });
    await page.getByRole('button', { name: `${samples} выборок` }).click();
    await page.waitForFunction(() => window.__pathTraceResult != null, null, { timeout: 420_000 });
    const result = await page.evaluate(() => window.__pathTraceResult!);
    results[String(samples)] = result;
    expect(result.error, `ошибка трассировки: ${String(result.error)} ${String(result.stack ?? '')}`).toBeUndefined();
    await page.locator('.view-scene canvas').screenshot({ path: `${out}/pt-${samples}.png` });
    await page.getByRole('button', { name: 'Закрыть / отмена' }).click();
    await page.waitForTimeout(500);
    // после отмены редактор работает: кадры идут, камера отвечает
    const cam = await page.evaluate(() => window.__planner!.camera?.position);
    expect(cam, 'редактор восстановлен после трассировки').toBeTruthy();
  }
  writeFileSync(`${out}/pathtrace-${label}.json`, JSON.stringify({ date: new Date().toISOString(), label, results, consoleErrors: errors.slice(0, 5) }, null, 2));
  console.log('[pathtrace]', JSON.stringify(results));
});
