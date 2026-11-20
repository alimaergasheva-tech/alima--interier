import { expect, test } from '@playwright/test';

// Проверка окружения браузерных тестов (задача 2.4): приложение открывается,
// 3D-холст создаётся с рабочим WebGL-контекстом. Не является проверкой будущих функций.
test('приложение открывается и создаёт 3D-холст', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/?tech=1');
  await expect(page.getByRole('heading', { name: 'Планировщик интерьера' })).toBeVisible();

  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const hasWebGl = await canvas.evaluate(
    (element) => (element as HTMLCanvasElement).getContext('webgl2') !== null,
  );
  expect(hasWebGl).toBe(true);
  expect(errors).toEqual([]);
});
