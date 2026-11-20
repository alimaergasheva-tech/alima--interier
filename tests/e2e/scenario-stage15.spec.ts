import { expect, test, type Page } from '@playwright/test';
import { visibleBox } from './helpers';

// Этап 15: один сценарий от мастера до интерьера и обратно для схем на 1, 2 и 3 комнаты
// (проверка реальных функций, без заглушек): настройка → интерьер → возврат → отмена и повтор.

const historyLength = (page: Page) => page.evaluate(() => window.__planner!.historyLength());
const furnitureCount = async (page: Page) => (await page.evaluate(() => window.__planner!.furniture())).length;

for (const count of [1, 2, 3] as const) {
  test(`сквозной сценарий: схема на ${count} ${count === 1 ? 'комнату' : 'комнаты'}`, async ({ page }) => {
    // 1. Мастер и выбор схемы.
    await page.goto('/');
    await page.getByRole('button', { name: `${count} ${count === 1 ? 'комната' : 'комнаты'}` }).click();
    await page.getByLabel('Примерная площадь квартиры').fill(count === 1 ? '37' : count === 2 ? '57' : '80');
    await page.getByRole('button', { name: 'Показать схемы' }).click();
    await page.locator('.template-card').filter({ hasText: `${count}А` }).click();
    await page.getByRole('button', { name: 'Перейти к настройке' }).click();
    await expect(page.getByTestId('wall-hint')).toBeVisible();

    // 2. Настройка: стена сдвигается на 30 см, один шаг истории.
    await page.locator('[data-wall-id]').nth(0).dispatchEvent('pointerdown', { button: 0 });
    const input = page.getByRole('textbox', { name: /комнаты, см/ });
    const current = Number(await input.getAttribute('placeholder'));
    await input.fill(String(current + 30).replace('.', ','));
    await input.press('Enter');
    await expect(page.getByText('Стена сдвинута.')).toBeVisible();
    expect(await historyLength(page)).toBe(1);

    // 3. Интерьер: геометрию здесь править нельзя (15.1), мебель ставится на план.
    await page.getByRole('button', { name: 'Открыть интерьер' }).click();
    await expect(page.getByRole('textbox', { name: /комнаты, см/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Настройка квартиры' })).toBeVisible();
    await page.waitForFunction(() => window.__planner?.activeRoomCenter() != null && window.__planner.toClient('plan', 0, 0) != null);
    const center = (await page.evaluate(() => window.__planner!.activeRoomCenter()))!;
    const card = (await visibleBox(page.locator('[data-catalog-id="modern_coffee_table_01"]')))!;
    const target = (await page.evaluate(([x, z]) => window.__planner!.toClient('plan', x, z)!, [center.xCm, center.zCm] as const));
    await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 10 });
    await page.mouse.up();
    expect(await furnitureCount(page)).toBe(1);
    expect(await historyLength(page)).toBe(2);
    await page.waitForFunction(() => window.__planner!.measured['modern_coffee_table_01'] != null);

    // 4. Возврат в настройку и назад ничего не очищает (15.2).
    await page.getByRole('button', { name: 'Настройка квартиры' }).click();
    await expect(page.getByTestId('wall-hint')).toBeVisible();
    expect(await furnitureCount(page)).toBe(1);
    await page.getByRole('button', { name: 'Открыть интерьер' }).click();
    expect(await furnitureCount(page)).toBe(1);
    expect(await historyLength(page)).toBe(2);

    // Переход в другую комнату не создаёт шагов истории и не теряет мебель; отмена работает и оттуда.
    const rooms = await page.getByLabel('Активная комната').locator('option').allTextContents();
    await page.getByLabel('Активная комната').selectOption({ label: rooms[1]! });
    expect(await historyLength(page)).toBe(2);
    expect(await furnitureCount(page)).toBe(1);

    // 5. Отмена и повтор по всему сценарию (15.6): мебель, затем геометрия.
    await page.keyboard.press('Control+KeyZ');
    expect(await furnitureCount(page)).toBe(0);
    await page.keyboard.press('Control+KeyZ');
    expect(await historyLength(page)).toBe(0);
    await page.keyboard.press('Control+KeyY');
    await page.keyboard.press('Control+KeyY');
    expect(await historyLength(page)).toBe(2);
    expect(await furnitureCount(page)).toBe(1);
  });
}

test('AC-13: у комнаты без подходящих предметов каталог пуст, остальная работа продолжается', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel('Примерная площадь квартиры').fill('37');
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await page.locator('.template-card').filter({ hasText: '1В' }).click();
  await page.getByRole('button', { name: 'Перейти к настройке' }).click();
  await page.getByRole('button', { name: 'Открыть интерьер' }).click();
  await page.waitForFunction(() => window.__planner?.activeRoomCenter() != null);

  await page.getByLabel('Активная комната').selectOption({ label: 'Туалет' });
  await expect(page.getByTestId('catalog-empty')).toBeVisible();
  await expect(page.getByTestId('catalog-empty')).toContainText('ничего нет');
  // Показ для всех комнат возвращает карточки, редактор по-прежнему отвечает.
  await page.getByLabel('Показать для всех комнат').check();
  await expect(page.locator('[data-catalog-id]').first()).toBeVisible();
  await expect(page.getByTestId('catalog-empty')).toHaveCount(0);
  expect(errors).toEqual([]);
});
