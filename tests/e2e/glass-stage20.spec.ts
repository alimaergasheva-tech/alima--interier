import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

// Задача 20.5: окна показывают небо и мир, меняющиеся со временем суток. Кадры docs/stage-20/glass-*.png.

async function brightness(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (base64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    // Середина кадра: проём окна, без панелей интерфейса по краям.
    ctx.drawImage(bitmap, bitmap.width * 0.3, bitmap.height * 0.3, bitmap.width * 0.4, bitmap.height * 0.4, 0, 0, 64, 64);
    const data = ctx.getImageData(0, 0, 64, 64).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
    return sum / (data.length / 4);
  }, png.toString('base64'));
}

test('сквозь витраж видны небо и мир: днём светло, ночью темно', async ({ page }, testInfo) => {
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
  const size = await page.evaluate(() => window.__planner!.sceneInfo!.clearCm);
  const c = (await page.evaluate(() => window.__planner!.activeRoomCenter()))!;
  const top = c.zCm - size.depth / 2;
  const levels: Record<string, number> = {};
  for (const [name, file] of [['Утро', 'morning'], ['День', 'day'], ['Вечер', 'evening'], ['Ночь', 'night']] as const) {
    await page.getByRole('button', { name }).click();
    await page.evaluate(([x, z]) => window.__planner!.lookAt!([x, 140, z + 260], [x, 150, z]), [c.xCm + 100, top] as const);
    await page.waitForTimeout(700);
    const shot = await page.locator('.view-scene canvas').screenshot({ path: `docs/stage-20/glass-${file}.png` });
    levels[name] = await brightness(page, shot);
  }
  console.log('[glass] яркость проёма окна', JSON.stringify(levels));
  expect(levels['День']!, 'днём за витражом светлее, чем ночью').toBeGreaterThan(levels['Ночь']! + 30);
});
