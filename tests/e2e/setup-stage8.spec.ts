import { expect, test, type Page } from '@playwright/test';

async function openSetup(page: Page) {
  await page.goto('/');
  await page.getByLabel('Примерная площадь квартиры').fill('45');
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await page.getByRole('button', { name: 'Перейти к настройке' }).click();
  await expect(page.getByTestId('wall-hint')).toBeVisible();
}

const selectWall = (page: Page, index: number) =>
  page.locator('[data-wall-id]').nth(index).dispatchEvent('pointerdown', { button: 0 });

test('стена выбирается на плане, предпросмотр показывает комнаты и площади, применение — один шаг истории', async ({ page }, testInfo) => {
  await openSetup(page);
  expect(await page.evaluate(() => window.__planner!.historyLength())).toBe(0);
  await selectWall(page, 0);
  await expect(page.getByTestId('wall-info')).toBeVisible();
  await expect(page.locator('.plan-wall-hit.is-selected').first()).toBeVisible();
  const input = page.getByRole('textbox', { name: /комнаты, см/ });
  const current = Number(await input.getAttribute('placeholder'));
  await input.fill(String(current + 30).replace('.', ','));
  const preview = page.getByTestId('setup-preview');
  await expect(preview).toContainText('→');
  await expect(preview).toContainText('Площадь по внешнему контуру');
  await expect(page.locator('.plan-floor.is-affected').first()).toBeVisible();
  expect(await page.evaluate(() => window.__planner!.historyLength())).toBe(0); // предпросмотр не в истории
  if (testInfo.project.name === 'chrome') await page.screenshot({ path: 'docs/stage-8/01-wall-preview.png' });
  await input.press('Enter');
  await expect(page.getByText('Стена сдвинута.')).toBeVisible();
  expect(await page.evaluate(() => window.__planner!.historyLength())).toBe(1);
  await expect(input).toHaveAttribute('placeholder', String(current + 30));
});

test('невалидный сдвиг блокируется с причиной, состояние не меняется', async ({ page }) => {
  await openSetup(page);
  await selectWall(page, 0);
  const input = page.getByRole('textbox', { name: /комнаты, см/ });
  const before = await input.getAttribute('placeholder');
  await input.fill('30');
  await expect(page.getByTestId('setup-issue').first()).toContainText(/вне допустимых 80–1500 см|выходит за пределы стены/);
  await expect(page.getByRole('button', { name: 'Применить' })).toBeDisabled();
  await input.press('Enter');
  expect(await page.evaluate(() => window.__planner!.historyLength())).toBe(0);
  await expect(input).toHaveAttribute('placeholder', before!);
  await page.getByRole('button', { name: 'Сбросить' }).click();
  await expect(page.getByTestId('setup-preview')).toContainText('Введите новое значение');
});

test('высота потолка: применяется в пределах, блокируется вне пределов и при конфликте с окном', async ({ page }) => {
  await openSetup(page);
  const ceiling = page.getByRole('textbox', { name: 'Высота потолка, см' });
  await ceiling.fill('200');
  await expect(page.getByTestId('setup-issue').first()).toContainText('вне допустимых 220–400 см');
  await ceiling.fill('225');
  await expect(page.getByTestId('setup-issue').first()).toContainText('Окно выше потолка');
  await expect(page.getByRole('button', { name: 'Применить' })).toBeDisabled();
  await ceiling.fill('300');
  await ceiling.press('Enter');
  await expect(page.getByText('Высота потолка изменена.')).toBeVisible();
  expect(await page.evaluate(() => window.__planner!.historyLength())).toBe(1);
  await expect(ceiling).toHaveAttribute('placeholder', '300');
});
