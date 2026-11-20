import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { buildWorld, WORLD } from '../../src/scene3d/worldLayout';

// Задача 20.3: внешний мир за окнами. Кадры утро, день, вечер, ночь одной камерой — docs/stage-20.

/** Средняя яркость PNG-кадра 0–255 (декодирование в самой странице). */
async function brightness(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, 64, 64);
    const data = ctx.getImageData(0, 0, 64, 64).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
    return sum / (data.length / 4);
  }, png.toString('base64'));
}

test('мир строится детерминированно и не заходит в контур квартиры', () => {
  const bounds = { minX: 0, maxX: 6, minZ: 0, maxZ: 4 };
  const a = buildWorld(bounds), b = buildWorld(bounds);
  expect(a).toEqual(b);
  expect(a.houses.length).toBeGreaterThan(WORLD.houses / 2);
  expect(a.trees.length).toBeGreaterThan(WORLD.trees / 2);
  for (const item of [...a.houses, ...a.trees]) {
    const inside = item.x > -WORLD.clearMargin && item.x < 6 + WORLD.clearMargin && item.z > -WORLD.clearMargin && item.z < 4 + WORLD.clearMargin;
    expect(inside, `объект в зоне отступа: ${item.x.toFixed(1)}, ${item.z.toFixed(1)}`).toBe(false);
  }
});

test('кадры утро, день, вечер, ночь: мир виден и меняется со временем суток', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chrome');
  test.setTimeout(120_000);
  mkdirSync('docs/stage-20', { recursive: true });
  await page.goto('/');
  await page.getByRole('button', { name: '2 комнаты' }).click();
  await page.getByLabel('Примерная площадь квартиры').fill('57');
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await page.locator('.template-card').filter({ hasText: '2А' }).click();
  await page.getByRole('button', { name: 'Перейти к настройке' }).click();
  await page.getByRole('button', { name: 'Открыть интерьер' }).click();
  await page.waitForFunction(() => window.__planner?.activeRoomCenter() != null && window.__planner.sceneInfo != null && window.__planner.world != null);
  const world = (await page.evaluate(() => window.__planner!.world))!;
  expect(world.houses).toBeGreaterThan(10);
  expect(world.trees).toBeGreaterThan(20);

  const size = await page.evaluate(() => window.__planner!.sceneInfo!.clearCm);
  const c = (await page.evaluate(() => window.__planner!.activeRoomCenter()))!;
  const top = c.zCm - size.depth / 2;
  const presets = [['Утро', '01-morning'], ['День', '02-day'], ['Вечер', '03-evening'], ['Ночь', '04-night']] as const;
  const levels: Record<string, number> = {};
  for (const [name, file] of presets) {
    await page.getByRole('button', { name }).click();
    // Кадр A: взгляд из комнаты на окно (витраж, D-22) — как мир выглядит в проёме.
    await page.evaluate(([x, z]) => window.__planner!.lookAt!([x, 130, z + 140], [x, 175, z]), [c.xCm + 100, top] as const);
    await page.waitForTimeout(600);
    await page.locator('.view-scene canvas').screenshot({ path: `docs/stage-20/${file}.png` });
    // Кадр B: взгляд поверх стены наружу — небо, дома, деревья без витража; по нему сверяется яркость.
    await page.evaluate(([x, z]) => window.__planner!.lookAt!([x, 450, z + 150], [x, 400, z - 400]), [c.xCm, top] as const);
    await page.waitForTimeout(600);
    const shot = await page.locator('.view-scene canvas').screenshot({ path: `docs/stage-20/${file}-outlook.png` });
    levels[name] = await brightness(page, shot);
  }
  console.log('[world] средняя яркость кадров', JSON.stringify(levels));
  expect(levels['День']!, 'днём светлее, чем ночью').toBeGreaterThan(levels['Ночь']! + 40);
  expect(levels['Утро']!, 'утром светлее, чем ночью').toBeGreaterThan(levels['Ночь']! + 30);
});
