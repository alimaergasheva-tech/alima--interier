import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

// Задача 20.4: свет комнаты следует за временем суток. Кадры одной камеры в четыре момента — docs/stage-20/room-*.png.

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

test('свет комнаты: днём солнце, ночью луна и тёмная комната; одна камера в четыре момента', async ({ page }, testInfo) => {
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
  await page.waitForFunction(() => window.__planner?.activeRoomCenter() != null && window.__planner.sceneInfo != null && window.__planner.lighting != null);

  const size = await page.evaluate(() => window.__planner!.sceneInfo!.clearCm);
  const c = (await page.evaluate(() => window.__planner!.activeRoomCenter()))!;
  const presets = [['Утро', '01-morning'], ['День', '02-day'], ['Вечер', '03-evening'], ['Ночь', '04-night']] as const;
  const levels: Record<string, number> = {};
  const lights: Record<string, { key: string; keyIntensity: number }> = {};
  for (const [name, file] of presets) {
    await page.getByRole('button', { name }).click();
    // Одна и та же камера: из угла комнаты к противоположной стене с окном.
    await page.evaluate(([x, z, w, d]) => window.__planner!.lookAt!([x + w * 0.4, 150, z + d * 0.45], [x - w * 0.1, 90, z - d * 0.4]), [c.xCm, c.zCm, size.width, size.depth] as const);
    await page.waitForFunction(() => window.__planner!.lighting != null);
    await page.waitForTimeout(600);
    lights[name] = (await page.evaluate(() => window.__planner!.lighting))!;
    const shot = await page.locator('.view-scene canvas').screenshot({ path: `docs/stage-20/room-${file}.png` });
    levels[name] = await brightness(page, shot);
  }
  console.log('[light] источники', JSON.stringify(lights));
  console.log('[light] средняя яркость кадров', JSON.stringify(levels));
  expect(lights['День']!.key).toBe('sun');
  expect(lights['Утро']!.key).toBe('sun');
  expect(lights['Ночь']!.key).toBe('moon');
  expect(lights['День']!.keyIntensity).toBeGreaterThan(lights['Ночь']!.keyIntensity * 4);
  expect(levels['День']!, 'днём светлее, чем ночью').toBeGreaterThan(levels['Ночь']! + 25);
  expect(levels['Ночь']!, 'ночью комната тёмная, но не чёрная').toBeGreaterThan(8);
});
