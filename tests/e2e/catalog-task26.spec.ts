import { expect, test, type Page } from '@playwright/test';

async function openInterior(page: Page) {
  await page.goto('/');
  await page.getByLabel('Примерная площадь квартиры').fill('37');
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await page.getByRole('button', { name: 'Перейти к настройке' }).click();
  await page.getByRole('button', { name: 'Открыть интерьер' }).click();
  await page.waitForFunction(() => window.__planner?.toClient('plan', 280, 220) != null);
}

test('панель каталога: разделы, фильтр по комнате, показ для всех комнат', async ({ page }, testInfo) => {
  await openInterior(page);
  const cards = page.locator('[data-catalog-id]');
  const forRoom = await cards.count();
  expect(forRoom).toBeGreaterThan(10);
  await expect(page.locator('.panel-note').first()).toContainText('Кухня-гостиная');
  await page.getByLabel('Раздел каталога').selectOption('Столы');
  const tables = await cards.count();
  expect(tables).toBeGreaterThan(2);
  expect(tables).toBeLessThan(forRoom);
  await page.getByLabel('Раздел каталога').selectOption('');
  await page.getByLabel('Показать для всех комнат').check();
  expect(await cards.count()).toBeGreaterThanOrEqual(30);
  if (testInfo.project.name === 'chrome') await page.screenshot({ path: 'docs/stage-13/01-catalog-panel.png' });
});

test('каждая модель каталога загружается, а её размер в сцене совпадает с карточкой', async ({ page }) => {
  test.setTimeout(240_000);
  const problems: string[] = [];
  page.on('console', (message) => { if (message.type() === 'warning' && message.text().includes('расходятся')) problems.push(message.text()); });
  page.on('pageerror', (error) => problems.push(error.message));
  await openInterior(page);
  await page.getByLabel('Показать для всех комнат').check();
  const ids = await page.locator('[data-catalog-id]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-catalog-id')!));
  expect(ids.length).toBeGreaterThanOrEqual(30);
  const target = await page.evaluate(() => window.__planner!.toClient('plan', 280, 220)!);
  for (const id of ids) {
    const card = page.locator(`[data-catalog-id="${id}"]`);
    await card.scrollIntoViewIfNeeded();
    const box = (await card.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 6 });
    await page.waitForFunction((key) => window.__planner!.measured[key] !== undefined, id, { timeout: 15_000 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
  }
  expect(problems).toEqual([]);
  expect(await page.evaluate(() => window.__planner!.furniture())).toEqual([]);
});
