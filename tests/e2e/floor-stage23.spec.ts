import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

// Задача 23.3: панель «Пол» в интерьере и цвет пола на 2D-плане; покрытие входит в историю отмены.

async function openInterior(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '2 комнаты' }).click();
  await page.getByLabel('Примерная площадь квартиры').fill('57');
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await page.locator('.template-card').filter({ hasText: '2А' }).click();
  await page.getByRole('button', { name: 'Перейти к настройке' }).click();
  await page.getByRole('button', { name: 'Открыть интерьер' }).click();
  await page.waitForFunction(() => window.__planner?.activeRoomCenter() != null && window.__planner.sceneInfo != null);
  await page.getByRole('tab', { name: 'Отделка' }).click();
  await page.getByRole('button', { name: 'Пол', exact: true }).click();
}

test('панель «Пол»: выбор покрытия, цвет на плане, отмена и повтор', async ({ page }) => {
  await openInterior(page);
  await expect(page.getByTestId('floor-current')).toHaveText('по умолчанию');
  const history = await page.evaluate(() => window.__planner!.historyLength());
  const floorRect = page.getByTestId('plan-floor');
  const before = await floorRect.evaluate((el) => getComputedStyle(el).fill);

  await page.locator('[data-finish-id="floor-laminate-walnut"]').click();
  await expect(page.getByTestId('floor-current')).toHaveText('Орех');
  await expect(floorRect).toHaveAttribute('data-floor-finish', 'floor-laminate-walnut');
  expect(await floorRect.evaluate((el) => getComputedStyle(el).fill), 'цвет пола на плане изменился').not.toBe(before);
  expect(await page.evaluate(() => window.__planner!.historyLength())).toBe(history + 1);

  await page.locator('[data-finish-id="floor-carpet-sand"]').click();
  await expect(page.getByTestId('floor-current')).toHaveText('Песочный');

  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('floor-current')).toHaveText('Орех');
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('floor-current')).toHaveText('по умолчанию');
  await expect(floorRect).not.toHaveAttribute('data-floor-finish', /.+/);
  await page.keyboard.press('Control+y');
  await expect(page.getByTestId('floor-current')).toHaveText('Орех');
});

test('кадры покрытий: ламинат, линолеум, ковролин одной камерой', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chrome');
  test.setTimeout(120_000);
  mkdirSync('docs/stage-23', { recursive: true });
  await openInterior(page);
  const size = await page.evaluate(() => window.__planner!.sceneInfo!.clearCm);
  const c = (await page.evaluate(() => window.__planner!.activeRoomCenter()))!;
  await page.evaluate(([x, z, w, d]) => window.__planner!.lookAt!([x + w * 0.35, 190, z + d * 0.4], [x - w * 0.05, 0, z - d * 0.1]), [c.xCm, c.zCm, size.width, size.depth] as const);
  for (const id of ['laminate-oak', 'laminate-walnut', 'laminate-grey', 'linoleum-beige', 'linoleum-green', 'carpet-grey', 'carpet-blue']) {
    await page.locator(`[data-finish-id="floor-${id}"]`).click();
    await page.waitForTimeout(500);
    await page.locator('.view-scene canvas').screenshot({ path: `docs/stage-23/${id}.png` });
  }
});
