import { expect, test, type Page } from '@playwright/test';

async function openSetup(page: Page) {
  await page.goto('/');
  await page.getByLabel('Примерная площадь квартиры').fill('45');
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await page.getByRole('button', { name: 'Перейти к настройке' }).click();
  await expect(page.getByTestId('wall-hint')).toBeVisible();
}

const select = (page: Page, id: string) => page.locator(`[data-opening-id="${id}"]`).dispatchEvent('pointerdown', { button: 0 });
const history = (page: Page) => page.evaluate(() => window.__planner!.historyLength());

test('дверь: положение числом, предпросмотр, один общий проём, шаг истории', async ({ page }, testInfo) => {
  await openSetup(page);
  await select(page, 'door-room-2');
  await expect(page.getByTestId('opening-panel')).toContainText('Дверь');
  await expect(page.locator('.plan-opening.is-selected')).toHaveCount(1);
  const position = page.getByLabel('От угла комнаты, см');
  const current = Number(await position.getAttribute('placeholder'));
  await position.fill(String(current + 20));
  await expect(page.getByTestId('setup-preview')).toContainText(`От угла: ${current} см → ${current + 20} см`);
  expect(await history(page)).toBe(0);
  if (testInfo.project.name === 'chrome') await page.screenshot({ path: 'docs/stage-9/01-door-panel.png' });
  await position.press('Enter');
  await expect(page.getByText('Проём изменён.')).toBeVisible();
  expect(await history(page)).toBe(1);
  await expect(page.locator('[data-opening-id="door-room-2"]')).toHaveCount(1);
  await expect(position).toHaveAttribute('placeholder', String(current + 20));
  await expect(page.locator('[data-opening-id="door-room-2"] .plan-opening-label')).toContainText(`${current + 20} см`);
});

test('проём за пределами стены и вне диапазонов блокируется с причиной', async ({ page }) => {
  await openSetup(page);
  await select(page, 'door-room-2');
  const position = page.getByLabel('От угла комнаты, см');
  await position.fill('5000');
  await expect(page.getByTestId('setup-issue').first()).toContainText('выходит за пределы стены');
  await expect(page.getByRole('button', { name: 'Применить' })).toBeDisabled();
  await position.press('Enter');
  expect(await history(page)).toBe(0);
  await position.fill('');
  await page.getByLabel('Ширина, см').fill('30');
  await expect(page.getByTestId('setup-issue').first()).toContainText('вне допустимых 60–200 см');
});

test('окно: подоконник и высота в пределах D-04', async ({ page }) => {
  await openSetup(page);
  await select(page, 'window-room-1');
  await expect(page.getByTestId('opening-panel')).toContainText('Окно');
  await page.getByLabel('Подоконник, см').fill('160');
  await expect(page.getByTestId('setup-issue').first()).toContainText('вне допустимых 0–150 см');
  await page.getByLabel('Подоконник, см').fill('100');
  await page.getByLabel('Высота, см').fill('150');
  await page.getByLabel('Высота, см').press('Enter');
  await expect(page.getByText('Проём изменён.')).toBeVisible();
  expect(await history(page)).toBe(1);
});

test('створка двери: направление и петли переключаются, шаги истории', async ({ page }) => {
  await openSetup(page);
  await select(page, 'door-room-2');
  const swing = page.getByRole('group', { name: 'Направление открывания' }).getByRole('button');
  const inactive = swing.and(page.locator('[aria-pressed="false"]'));
  await inactive.click();
  expect(await history(page)).toBe(1);
  await expect(swing.and(page.locator('[aria-pressed="true"]'))).toHaveCount(1);
  const hinge = page.getByRole('group', { name: 'Сторона петель' }).getByRole('button').and(page.locator('[aria-pressed="false"]'));
  await hinge.click();
  expect(await history(page)).toBe(2);
  await page.keyboard.press('Control+z');
  expect(await history(page)).toBe(1);
});
