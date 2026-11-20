import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

// Задача 21.2–21.6: светильники каталога (торшер, люстра) ставятся на план, светят при включённом свете комнаты,
// число источников ограничено, люстра заменяет стандартный светильник комнаты. Кадры — docs/stage-21/lamps-*.png.

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

async function dragCatalogItem(page: Page, id: string, x: number, z: number) {
  const card = page.locator(`[data-catalog-id="${id}"]`);
  await card.scrollIntoViewIfNeeded();
  const box = (await card.boundingBox())!;
  const to = await page.evaluate(([px, pz]) => window.__planner!.toClient('plan', px, pz)!, [x, z] as const);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

test('торшер и люстра: ставятся, светят при включённом свете, источников не больше предела', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  mkdirSync('docs/stage-21', { recursive: true });
  await openInterior(page);
  await page.getByLabel('Показать для всех комнат').check();
  const size = await page.evaluate(() => window.__planner!.sceneInfo!.clearCm);
  const c = (await page.evaluate(() => window.__planner!.activeRoomCenter()))!;
  await dragCatalogItem(page, 'chandelier_02', c.xCm, c.zCm);
  await page.waitForFunction(() => window.__planner!.furniture().some((f) => f.catalogItemId === 'chandelier_02'), null, { timeout: 20_000 });
  await dragCatalogItem(page, 'floor_lamp', c.xCm + size.width * 0.38, c.zCm - size.depth * 0.33);
  await page.waitForFunction(() => window.__planner!.furniture().some((f) => f.catalogItemId === 'floor_lamp'), null, { timeout: 20_000 });

  // Свет выключен — источники не назначены.
  expect(await page.evaluate(() => window.__planner!.lampLights)).toEqual([]);
  await page.getByRole('button', { name: 'Ночь' }).click();
  await page.waitForTimeout(500);
  if (testInfo.project.name === 'chrome') await page.locator('.view-scene canvas').screenshot({ path: 'docs/stage-21/lamps-01-off.png' });

  await page.getByRole('switch', { name: 'Свет в комнате' }).click();
  await page.waitForTimeout(600);
  const lit = await page.evaluate(() => ({ lamps: window.__planner!.lampLights, ids: window.__planner!.furniture().map((f) => `${f.id}:${f.catalogItemId}`) }));
  expect(lit.lamps.length, 'включённые светильники получили источники').toBe(2);
  expect(lit.lamps.length).toBeLessThanOrEqual(3);
  if (testInfo.project.name === 'chrome') await page.locator('.view-scene canvas').screenshot({ path: 'docs/stage-21/lamps-02-on.png' });

  await page.getByRole('switch', { name: 'Свет в комнате' }).click();
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__planner!.lampLights)).toEqual([]);
});
