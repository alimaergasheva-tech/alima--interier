import { expect, test } from '@playwright/test';

// Задача 20.2: ползунок и кнопки времени суток; состояние не попадает в проект и историю (D-12, AC-17).

test.beforeEach(async ({ page }) => {
  await page.goto('/?tech=1');
  await expect(page.locator('.view-scene canvas')).toBeVisible();
  await page.waitForFunction(() => window.__planner?.toClient('plan', 0, 0) != null);
});

test('ползунок меняет время суток, подпись и активную кнопку', async ({ page }) => {
  const slider = page.getByRole('slider', { name: 'Время суток' });
  await expect(slider).toBeVisible();
  await expect(page.getByTestId('time-of-day-value')).toHaveText('13:00');
  await slider.fill('17.5');
  await expect(page.getByTestId('time-of-day-value')).toHaveText('17:30');
  await expect(page.getByRole('button', { name: 'Вечер' })).toHaveAttribute('aria-pressed', 'true');
  await slider.fill('12');
  for (const name of ['Утро', 'День', 'Вечер', 'Ночь']) {
    await expect(page.getByRole('button', { name }), name).toHaveAttribute('aria-pressed', 'false');
  }
  expect(await page.evaluate(() => window.__planner!.timeOfDay())).toBe(12);
});

test('быстрые кнопки ставят утро, день, вечер и ночь', async ({ page }) => {
  const expected: Array<[string, number, string]> = [['Утро', 7, '07:00'], ['День', 13, '13:00'], ['Вечер', 17.5, '17:30'], ['Ночь', 23, '23:00']];
  for (const [name, hour, label] of expected) {
    await page.getByRole('button', { name }).click();
    expect(await page.evaluate(() => window.__planner!.timeOfDay()), name).toBe(hour);
    await expect(page.getByTestId('time-of-day-value')).toHaveText(label);
    await expect(page.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true');
  }
});

test('время суток не попадает в историю отмены и не отнимает горячие клавиши у предмета', async ({ page }) => {
  const history = () => page.evaluate(() => window.__planner!.historyLength());
  const before = await history();
  await page.getByRole('button', { name: 'Ночь' }).click();
  await page.getByRole('slider', { name: 'Время суток' }).fill('5');
  await page.getByRole('button', { name: 'Утро' }).click();
  expect(await history(), 'шагов истории не прибавилось').toBe(before);
  await expect(page.getByRole('button', { name: 'Отменить' })).toBeDisabled();

  // Стрелки на ползунке двигают ползунок, а не выбранный предмет.
  const slider = page.getByRole('slider', { name: 'Время суток' });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.__planner!.timeOfDay())).toBeGreaterThan(7);
  expect(await history()).toBe(before);
});
