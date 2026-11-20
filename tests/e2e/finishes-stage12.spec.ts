import { expect, test, type Page } from '@playwright/test';

async function openInterior(page: Page) {
  await page.goto('/');
  await page.getByLabel('Примерная площадь квартиры').fill('45');
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await page.getByRole('button', { name: 'Перейти к настройке' }).click();
  await page.getByRole('button', { name: 'Открыть интерьер' }).click();
  await page.waitForFunction(() => window.__planner?.sceneInfo != null);
}

const surfaces = (page: Page) => page.locator('[data-wall-surface]');
const history = (page: Page) => page.evaluate(() => window.__planner!.historyLength());
const finished = (page: Page) => page.evaluate(() => window.__planner!.sceneInfo!.finishedSides);

/** Находит стену, общую для двух комнат, на плане всей квартиры. */
async function sharedWall(page: Page) {
  await page.getByRole('button', { name: 'Вся квартира' }).click();
  const keys = await surfaces(page).evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-wall-surface')!));
  const byWall = new Map<string, string[]>();
  for (const key of keys) {
    const [wall, room] = key.split(':');
    byWall.set(wall!, [...(byWall.get(wall!) ?? []), room!]);
  }
  const [wall, rooms] = [...byWall.entries()].find(([, list]) => list.length === 2)!;
  return { wall, rooms };
}

test('отделка выбранной стороны: обои применяются, другая сторона перегородки не меняется (AC-11)', async ({ page }, testInfo) => {
  await openInterior(page);
  const { wall, rooms } = await sharedWall(page);
  const [roomA, roomB] = rooms as [string, string];
  await page.getByLabel('Активная комната').selectOption(roomA);
  await page.locator(`[data-wall-surface="${wall}:${roomA}"]`).dispatchEvent('pointerdown', { button: 0 });
  await expect(page.getByTestId('finish-surface')).toContainText('сторона');
  expect(await history(page)).toBe(0);

  await page.locator('[data-finish-id="wp-botanical-sage"]').click();
  expect(await history(page)).toBe(1);
  await expect(page.getByTestId('finish-current')).toHaveText('Ботаника, серо-зелёные');
  await expect(page.locator(`[data-wall-surface="${wall}:${roomA}"]`)).toHaveAttribute('data-finish', 'wp-botanical-sage');
  await expect(page.locator(`[data-wall-surface="${wall}:${roomB}"]`)).not.toHaveAttribute('data-finish', /.+/);
  expect(await finished(page)).not.toEqual([]);

  // Соседняя комната: сторона той же перегородки без отделки; своя отделка независима.
  await page.getByLabel('Активная комната').selectOption(roomB);
  await expect.poll(() => finished(page)).toEqual([]);
  await page.getByRole('tab', { name: 'Отделка' }).click();
  await page.locator(`[data-wall-surface="${wall}:${roomB}"]`).dispatchEvent('pointerdown', { button: 0 });
  await page.getByRole('button', { name: 'Краска' }).click();
  await page.locator('[data-finish-id="paint-forest"]').click();
  await expect(page.locator(`[data-wall-surface="${wall}:${roomA}"]`)).toHaveAttribute('data-finish', 'wp-botanical-sage');
  await expect(page.locator(`[data-wall-surface="${wall}:${roomB}"]`)).toHaveAttribute('data-finish', 'paint-forest');

  // Возврат в первую комнату: отделка на месте; отмена снимает последний шаг.
  await page.getByLabel('Активная комната').selectOption(roomA);
  await expect.poll(async () => (await finished(page)).length).toBeGreaterThan(0);
  await page.keyboard.press('Control+z');
  await expect(page.locator(`[data-wall-surface="${wall}:${roomB}"]`)).not.toHaveAttribute('data-finish', /.+/);
  await expect(page.locator(`[data-wall-surface="${wall}:${roomA}"]`)).toHaveAttribute('data-finish', 'wp-botanical-sage');

  if (testInfo.project.name === 'chrome') {
    const box = (await page.locator('.view-scene canvas').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 500, box.y + box.height / 2, { steps: 20 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'docs/stage-12/01-wallpaper-3d.png' });
  }
});

test('панель отделки: много обоев и красок, снятие отделки', async ({ page }) => {
  await openInterior(page);
  await page.getByRole('tab', { name: 'Отделка' }).click();
  await expect(page.getByTestId('finish-hint')).toBeVisible();
  expect(await page.locator('[data-finish-id^="wp-"]').count()).toBeGreaterThanOrEqual(30);
  await page.getByRole('button', { name: 'Краска' }).click();
  expect(await page.locator('[data-finish-id^="paint-"]').count()).toBeGreaterThanOrEqual(12);
  await page.getByRole('button', { name: 'Вся квартира' }).click();
  await surfaces(page).first().dispatchEvent('pointerdown', { button: 0 });
  await page.locator('[data-finish-id="paint-graphite"]').click();
  await expect(page.getByTestId('finish-current')).toHaveText('Графит');
  await page.getByRole('button', { name: 'Снять' }).click();
  await expect(page.getByTestId('finish-current')).toHaveText('без отделки');
  expect(await history(page)).toBe(2);
});

test('отделка сохраняется после изменения стены в настройке', async ({ page }) => {
  await openInterior(page);
  await page.getByRole('button', { name: 'Вся квартира' }).click();
  await surfaces(page).first().dispatchEvent('pointerdown', { button: 0 });
  await page.getByRole('button', { name: 'Краска' }).click();
  await page.locator('[data-finish-id="paint-terracotta"]').click();
  const key = await page.locator('[data-finish="paint-terracotta"]').first().getAttribute('data-wall-surface');
  expect(key).toBeTruthy();
  await page.getByRole('button', { name: 'Настройка квартиры' }).click();
  await page.locator('[data-wall-id]').first().dispatchEvent('pointerdown', { button: 0 });
  const input = page.getByRole('textbox', { name: /комнаты, см/ });
  const current = Number(await input.getAttribute('placeholder'));
  await input.fill(String(current + 10));
  await input.press('Enter');
  await expect(page.getByText('Стена сдвинута.')).toBeVisible();
  await page.getByRole('button', { name: 'Открыть интерьер' }).click();
  await page.getByRole('button', { name: 'Вся квартира' }).click();
  await expect(page.locator(`[data-wall-surface="${key}"]`)).toHaveAttribute('data-finish', 'paint-terracotta');
});
