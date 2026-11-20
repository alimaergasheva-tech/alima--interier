import { expect, test, type Page } from '@playwright/test';
import { visibleBox } from './helpers';

async function openInterior(page: Page) {
  await page.goto('/');
  await page.getByLabel('Примерная площадь квартиры').fill('37');
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await page.getByRole('button', { name: 'Перейти к настройке' }).click();
  await page.getByRole('button', { name: 'Открыть интерьер' }).click();
  await page.waitForFunction(() => window.__planner?.toClient('plan', 280, 220) != null && window.__planner.project3d != null);
}

async function placeTable(page: Page, x: number, z: number) {
  const card = (await visibleBox(page.locator('[data-catalog-id="modern_coffee_table_01"]')))!;
  const target = await page.evaluate(([px, pz]) => window.__planner!.toClient('plan', px!, pz!)!, [x, z]);
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__planner!.furniture().length)).toBe(1);
  await page.waitForFunction(() => window.__planner!.sceneFurniture.length === 1);
}

async function clearSelection(page: Page) {
  const box = (await page.locator('.view-scene canvas').boundingBox())!;
  await page.mouse.click(box.x + 8, box.y + box.height - 8);
  await expect.poll(() => page.evaluate(() => window.__planner!.selection())).toBeNull();
}

const furniture = (page: Page) => page.evaluate(() => window.__planner!.furniture()[0]!);
const planIds = (page: Page) => page.locator('[data-testid="plan"] [data-furniture-id]').evaluateAll((n) => n.map((e) => e.getAttribute('data-furniture-id')));
const sceneIds = (page: Page) => page.evaluate(() => window.__planner!.sceneFurniture);

test('выбор, перенос и поворот синхронны между планом и 3D', async ({ page }) => {
  await openInterior(page);
  await placeTable(page, 200, 200);
  const item = await furniture(page);
  const footprint = page.locator(`[data-testid="plan"] [data-furniture-id="${item.id}"]`);

  // План → 3D: выбор на плане попадает в общее состояние, 3D читает то же выделение.
  await clearSelection(page); // снять выбор щелчком вне предметов
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const onPlan = await page.evaluate(([x, z]) => window.__planner!.toClient('plan', x!, z!)!, [item.xCm, item.zCm]);
  await page.mouse.click(onPlan.x, onPlan.y);
  await expect(footprint).toHaveClass(/is-selected/);
  expect(await page.evaluate(() => (window.__planner!.selection() as { id: string } | null)?.id)).toBe(item.id);

  // 3D → план: выбор в 3D подсвечивает контур на плане.
  await clearSelection(page);
  await expect(footprint).not.toHaveClass(/is-selected/);
  const in3d = await page.evaluate(([x, z]) => window.__planner!.project3d!(x!, 37, z!), [item.xCm, item.zCm]);
  await page.mouse.click(in3d.x, in3d.y);
  await expect(footprint).toHaveClass(/is-selected/);

  // Перенос в 3D сразу виден на плане: центр контура совпадает с координатами модели.
  const start = await page.evaluate(([x, z]) => window.__planner!.project3d!(x!, 37, z!), [item.xCm, item.zCm]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 90, start.y + 40, { steps: 10 });
  await page.mouse.up();
  const moved = await furniture(page);
  expect(Math.hypot(moved.xCm - item.xCm, moved.zCm - item.zCm)).toBeGreaterThan(10);
  const centre = await page.evaluate(([x, z]) => window.__planner!.toClient('plan', x!, z!)!, [moved.xCm, moved.zCm]);
  const box = (await footprint.locator('rect').first().boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - centre.x)).toBeLessThan(3);
  expect(Math.abs(box.y + box.height / 2 - centre.y)).toBeLessThan(3);

  // Поворот клавишей меняет модель, контур на плане поворачивается.
  await page.keyboard.press('r');
  await expect.poll(async () => (await furniture(page)).rotationDeg).toBe(15);
  await expect(footprint).toHaveAttribute('transform', /rotate\(-15\)/);
});

test('смена комнаты и изменение стены перестраивают план и 3D без лишних предметов и старых контуров', async ({ page }) => {
  await openInterior(page);
  await placeTable(page, 200, 200);
  const id = (await furniture(page)).id;
  expect(await planIds(page)).toEqual([id]);
  expect(await sceneIds(page)).toEqual([id]);

  // Другая комната: предмета нет ни на плане, ни в 3D; возврат — предмет на месте, один.
  const select = page.getByLabel('Активная комната');
  const rooms = await select.locator('option').evaluateAll((o) => o.map((e) => (e as HTMLOptionElement).value));
  const home = await select.inputValue();
  await select.selectOption(rooms.find((r) => r !== home)!);
  await expect.poll(() => planIds(page)).toEqual([]);
  expect(await sceneIds(page)).toEqual([]);
  await select.selectOption(home);
  await expect.poll(() => planIds(page)).toEqual([id]);
  await page.waitForFunction(() => window.__planner!.sceneFurniture.length === 1);
  expect(await sceneIds(page)).toEqual([id]);

  // Сдвиг стены в настройке: размеры плана и 3D комнаты совпадают с моделью, предмет один.
  const before = await page.evaluate(() => window.__planner!.sceneInfo!.clearCm);
  await page.getByRole('button', { name: 'Настройка квартиры' }).click();
  await page.locator('[data-wall-id]').first().dispatchEvent('pointerdown', { button: 0 });
  const input = page.getByRole('textbox', { name: /комнаты, см/ });
  const current = Number(await input.getAttribute('placeholder'));
  await input.fill(String(current + 20));
  await input.press('Enter');
  await expect(page.getByText('Стена сдвинута.')).toBeVisible();
  await page.getByRole('button', { name: 'Открыть интерьер' }).click();
  await page.waitForFunction(() => window.__planner!.sceneInfo != null);
  const after = await page.evaluate(() => window.__planner!.sceneInfo!.clearCm);
  expect(after.width + after.depth).toBeCloseTo(before.width + before.depth + 20, 0);
  const scale = Number(await page.getByTestId('plan').getAttribute('data-scale'));
  const floor = (await page.getByTestId('plan-floor').boundingBox())!;
  expect(floor.width / scale).toBeCloseTo(after.width, 0);
  expect(floor.height / scale).toBeCloseTo(after.depth, 0);
  expect(await planIds(page)).toEqual([id]);
  await page.waitForFunction(() => window.__planner!.sceneFurniture.length === 1);
  expect(await sceneIds(page)).toEqual([id]);
  expect(await page.evaluate(() => window.__planner!.furniture().length)).toBe(1);
});
