import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

// Задача 21.1: потолочный светильник в каждой комнате и выключатель; состояние сохраняется при переходах между комнатами.

async function openInterior(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '2 комнаты' }).click();
  await page.getByLabel('Примерная площадь квартиры').fill('57');
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await page.locator('.template-card').filter({ hasText: '2А' }).click();
  await page.getByRole('button', { name: 'Перейти к настройке' }).click();
  await page.getByRole('button', { name: 'Открыть интерьер' }).click();
  await page.waitForFunction(() => window.__planner?.activeRoomCenter() != null && window.__planner.sceneInfo != null && window.__planner.lighting != null);
}

test('выключатель включает свет только в своей комнате, состояние переживает переходы', async ({ page }) => {
  await openInterior(page);
  const toggle = page.getByRole('switch', { name: 'Свет в комнате' });
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  const history = await page.evaluate(() => window.__planner!.historyLength());

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  const first = await page.evaluate(() => Object.keys(window.__planner!.roomLights()));
  expect(first).toHaveLength(1);

  const rooms = await page.getByLabel('Активная комната').locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
  expect(rooms.length).toBeGreaterThan(1);
  const other = rooms.find((id) => id !== first[0])!;
  await page.getByLabel('Активная комната').selectOption(other);
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.getByLabel('Активная комната').selectOption(first[0]!);
  await expect(toggle).toHaveAttribute('aria-checked', 'true');

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  expect(await page.evaluate(() => window.__planner!.historyLength()), 'выключатель не попадает в историю').toBe(history);
});

test('ночью включённый светильник освещает комнату: кадры без света и со светом', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chrome');
  test.setTimeout(90_000);
  mkdirSync('docs/stage-21', { recursive: true });
  await openInterior(page);
  await page.getByRole('button', { name: 'Ночь' }).click();
  const c = (await page.evaluate(() => window.__planner!.activeRoomCenter()))!;
  const size = await page.evaluate(() => window.__planner!.sceneInfo!.clearCm);
  await page.evaluate(([x, z, w, d]) => window.__planner!.lookAt!([x + w * 0.4, 150, z + d * 0.45], [x - w * 0.1, 90, z - d * 0.4]), [c.xCm, c.zCm, size.width, size.depth] as const);
  await page.waitForTimeout(600);
  const brightness = async (png: Buffer) => page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
    const ctx = cv.getContext('2d')!; ctx.drawImage(bmp, 0, 0, 64, 64);
    const d = ctx.getImageData(0, 0, 64, 64).data; let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
    return sum / (d.length / 4);
  }, png.toString('base64'));
  const off = await brightness(await page.locator('.view-scene canvas').screenshot({ path: 'docs/stage-21/01-night-light-off.png' }));
  await page.getByRole('switch', { name: 'Свет в комнате' }).click();
  await page.waitForTimeout(600);
  const on = await brightness(await page.locator('.view-scene canvas').screenshot({ path: 'docs/stage-21/02-night-light-on.png' }));
  console.log('[light21] яркость без света / со светом', off.toFixed(1), on.toFixed(1));
  expect(on, 'со светом заметно светлее').toBeGreaterThan(off + 15);
});
