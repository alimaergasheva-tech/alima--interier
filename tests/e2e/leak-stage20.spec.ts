import { expect, test } from '@playwright/test';

// Задача 20.6: смена часа суток много раз не наращивает ресурсы отрисовщика и не пересобирает шейдеры.

test('смена часа 200 раз: геометрии, текстуры и программы не растут', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chrome');
  test.setTimeout(120_000);
  await page.goto('/');
  await page.getByRole('button', { name: '2 комнаты' }).click();
  await page.getByLabel('Примерная площадь квартиры').fill('57');
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await page.locator('.template-card').filter({ hasText: '2А' }).click();
  await page.getByRole('button', { name: 'Перейти к настройке' }).click();
  await page.getByRole('button', { name: 'Открыть интерьер' }).click();
  await page.waitForFunction(() => window.__planner?.renderInfo != null && window.__planner.lighting != null);
  const info = () => page.evaluate(() => window.__planner!.renderInfo!());
  const slider = page.locator('#time-of-day-slider');
  // прогрев: все четыре пресета, чтобы шейдеры и текстуры уже созданы
  for (const name of ['Утро', 'День', 'Вечер', 'Ночь', 'День']) {
    await page.getByRole('button', { name, exact: true }).click();
    await page.waitForTimeout(150);
  }
  const before = await info();
  for (let i = 0; i < 200; i++) {
    await slider.evaluate((el, v) => {
      const input = el as HTMLInputElement;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, String(v));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, (i * 1.75) % 24);
    if (i % 20 === 0) await page.waitForTimeout(50);
  }
  await page.waitForTimeout(300);
  const after = await info();
  expect(after.geometries, 'геометрии выросли').toBeLessThanOrEqual(before.geometries);
  expect(after.textures, 'текстуры выросли').toBeLessThanOrEqual(before.textures);
  expect(after.programs, 'шейдеры пересобирались').toBeLessThanOrEqual(before.programs);
  console.log('[leak]', JSON.stringify({ before, after }));
});
