import { expect, test } from '@playwright/test';
import { visibleBox } from './helpers';

test('кадры стартового сценария', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chrome');
  await page.goto('/');
  await page.screenshot({ path: 'docs/stage-7/01-parameters.png' });
  await page.getByLabel('Примерная площадь квартиры').fill('45');
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await page.screenshot({ path: 'docs/stage-7/02-templates.png' });
  await page.getByRole('button', { name: 'Перейти к настройке' }).click();
  await expect(page.locator('[data-room-id]')).toHaveCount(4);
  await page.screenshot({ path: 'docs/stage-7/03-setup.png' });
});

test('мастер проверяет площадь и сохраняет параметры при возврате', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Начните с вашей квартиры' })).toBeVisible();
  await page.getByRole('button', { name: '2 комнаты' }).click();
  const area = page.getByLabel('Примерная площадь квартиры');
  await area.fill('abc');
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await expect(page.getByText('Введите площадь в м²')).toBeVisible();
  await area.fill('68,3');
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await expect(page.locator('.template-card')).toHaveCount(3);
  await expect(page.locator('.template-card').first()).toContainText('2В');
  await expect(page.locator('.template-card').first()).toContainText('68,3 м²');
  await page.getByRole('button', { name: 'Изменить параметры' }).click();
  await expect(page.getByRole('button', { name: '2 комнаты' })).toHaveAttribute('aria-pressed', 'true');
  await expect(area).toHaveValue('68,3');
});

for (const count of [1, 2, 3] as const) {
  test(`${count} жилые комнаты: схема передаётся пустой в настройку`, async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: `${count} ${count === 1 ? 'комната' : 'комнаты'}` }).click();
    await page.getByLabel('Примерная площадь квартиры').fill(count === 1 ? '37' : count === 2 ? '57' : '80');
    await page.getByRole('button', { name: 'Показать схемы' }).click();
    await expect(page.locator('.template-card')).toHaveCount(3);
    await page.locator('.template-card').filter({ hasText: `${count}А` }).click();
    await page.getByRole('button', { name: 'Перейти к настройке' }).click();
    await expect(page.getByText('Сумма площадей помещений:')).toBeVisible();
    await expect(page.locator('[data-room-id]')).toHaveCount(count === 1 ? 3 : count === 2 ? 4 : 5);
    expect(await page.evaluate(() => window.__planner!.furniture())).toEqual([]);
  });
}

test('возврат сохраняет квартиру, явная замена загружает другую пустую схему', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Примерная площадь квартиры').fill('45');
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await page.getByRole('button', { name: 'Перейти к настройке' }).click();
  await page.getByRole('button', { name: 'Открыть интерьер' }).click();
  await page.waitForFunction(() => window.__planner?.toClient('plan', 280, 220) != null);
  const card = (await visibleBox(page.locator('[data-catalog-id="modern_coffee_table_01"]')))!;
  const target = await page.evaluate(() => window.__planner!.toClient('plan', 280, 220)!);
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.__planner!.furniture())).toHaveLength(1);

  await page.getByRole('button', { name: 'Настройка квартиры' }).click();
  await page.getByRole('button', { name: 'Другие схемы' }).click();
  await page.getByRole('button', { name: 'Перейти к настройке' }).click();
  expect(await page.evaluate(() => window.__planner!.furniture())).toHaveLength(1);

  await page.getByRole('button', { name: 'Другие схемы' }).click();
  await page.locator('.template-card').nth(1).click();
  await expect(page.getByText('При замене схемы текущие изменения квартиры будут удалены.')).toBeVisible();
  await page.getByRole('button', { name: 'Заменить квартиру и перейти к настройке' }).click();
  expect(await page.evaluate(() => window.__planner!.furniture())).toEqual([]);
});

test('4-комнатная схема 4А: выбор, настройка, потолок 350 см', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: '4 комнаты' }).click();
  await page.getByLabel('Примерная площадь квартиры').fill('140');
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await expect(page.locator('.template-card')).toHaveCount(1);
  await expect(page.locator('.template-card')).toContainText('4А');
  if (testInfo.project.name === 'chrome') await page.screenshot({ path: 'docs/stage-7/04-four-room-template.png' });
  await page.getByRole('button', { name: 'Перейти к настройке' }).click();
  await expect(page.locator('[data-room-id]')).toHaveCount(15);
  await expect(page.getByRole('textbox', { name: 'Высота потолка, см' })).toHaveAttribute('placeholder', '350');
  expect(await page.evaluate(() => window.__planner!.furniture())).toEqual([]);
  if (testInfo.project.name === 'chrome') await page.screenshot({ path: 'docs/stage-7/05-four-room-setup.png' });
});
