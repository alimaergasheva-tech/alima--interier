import { expect, test } from '@playwright/test';
import { visibleBox } from './helpers';
import { twoRoomApartmentWithWindow } from '../unit/fixtures';

test('план показывает общую квартиру, двери и окна из одной модели', async ({ page }) => {
  await page.goto('/?tech=1');
  await page.evaluate(async (apartment) => {
    const projectPath = '/src/store/projectStore.ts';
    const uiPath = '/src/store/uiStore.ts';
    const { useProjectStore } = await import(/* @vite-ignore */ projectPath);
    const { useUiStore } = await import(/* @vite-ignore */ uiPath);
    useProjectStore.getState().loadApartment(apartment);
    useUiStore.getState().setActiveRoom('room-a');
  }, twoRoomApartmentWithWindow());

  await expect(page.locator('[data-room-id="room-a"]')).toBeVisible();
  await expect(page.locator('[data-room-id="room-b"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Вся квартира' }).click();
  await expect(page.locator('[data-room-id="room-b"]')).toBeVisible();
  await expect(page.locator('[data-opening-id="door-ab"]')).toBeVisible();
  await expect(page.locator('[data-opening-id="window-a"]')).toBeVisible();
  await expect(page.locator('[data-opening-id="door-ab"] .plan-opening-label')).toHaveText('110 см · 80 см');
  await expect(page.locator('[data-room-id="room-b"] .plan-dim').first()).toHaveText('200 см');
  const scale = Number(await page.getByTestId('plan').getAttribute('data-scale'));
  const floor = (await page.locator('[data-room-id="room-b"] .plan-floor').boundingBox())!;
  expect(floor.width / scale).toBeCloseTo(200, 0);
});

test('масштаб и сдвиг плана сохраняют координаты проекта', async ({ page }) => {
  await page.goto('/?tech=1');
  await page.waitForFunction(() => window.__planner?.toClient('plan', 210, 175) != null);
  const point = async () => page.evaluate(() => window.__planner!.toClient('plan', 210, 175)!);
  const before = await point();
  await page.mouse.move(before.x, before.y);
  await page.mouse.wheel(0, -100);
  const afterZoom = await point();
  expect(afterZoom.x).toBeCloseTo(before.x, 0);
  expect(afterZoom.y).toBeCloseTo(before.y, 0);
  const scale = Number(await page.getByTestId('plan').getAttribute('data-scale'));
  expect(scale).toBeGreaterThan(1);

  await page.mouse.move(before.x, before.y);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(before.x + 35, before.y + 25);
  await page.mouse.up({ button: 'middle' });
  const afterPan = await point();
  expect(afterPan.x - afterZoom.x).toBeCloseTo(35, 0);
  expect(afterPan.y - afterZoom.y).toBeCloseTo(25, 0);

  const card = (await visibleBox(page.locator('[data-catalog-id="modern_coffee_table_01"]')))!;
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  await page.mouse.down();
  await page.mouse.move(afterPan.x, afterPan.y, { steps: 10 });
  await page.mouse.up();
  const placed = await page.evaluate(() => window.__planner!.furniture());
  expect(placed[0]).toMatchObject({ xCm: 210, zCm: 175 });

  await page.getByRole('button', { name: 'Вписать' }).click();
  const reset = await point();
  expect(reset.x).toBeCloseTo(before.x, 0);
  expect(reset.y).toBeCloseTo(before.y, 0);
});
