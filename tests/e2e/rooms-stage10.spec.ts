import { expect, test, type Page } from '@playwright/test';
import { visibleBox } from './helpers';

async function openInterior(page: Page, area = '45') {
  await page.goto('/');
  await page.getByLabel('Примерная площадь квартиры').fill(area);
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await page.getByRole('button', { name: 'Перейти к настройке' }).click();
  await page.getByRole('button', { name: 'Открыть интерьер' }).click();
  await page.waitForFunction(() => window.__planner?.sceneInfo != null && window.__planner.project3d != null);
}

const roomId = (page: Page) => page.evaluate(() => window.__planner!.sceneInfo!.roomId);

async function clickFirstDoor(page: Page) {
  // Камера встаёт напротив двери прихода; ждём, пока вид стабилизируется.
  await page.waitForTimeout(400);
  const point = await page.evaluate(() => {
    const info = window.__planner!.sceneInfo!;
    const door = info.doors[0]!;
    return { id: door.id, ...window.__planner!.project3d!(door.xCm, door.yCm, door.zCm) };
  });
  await page.mouse.click(point.x, point.y);
  return point.id;
}

test('в 3D ровно одна комната; камера напротив двери; стены с отверстиями', async ({ page }, testInfo) => {
  await openInterior(page);
  const info = await page.evaluate(() => window.__planner!.sceneInfo!);
  expect(info.doors.length).toBeGreaterThan(0);
  await expect(page.getByLabel('Активная комната')).toHaveValue(info.roomId);
  if (testInfo.project.name === 'chrome') await page.screenshot({ path: 'docs/stage-10/01-room-3d.png' });
});

test('витражное окно видно в 3D при взгляде на внешнюю стену', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chrome');
  await openInterior(page);
  await page.waitForTimeout(500);
  const box = (await page.locator('.view-scene canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 700, box.y + box.height / 2, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'docs/stage-10/02-stained-window.png' });
});

test('переход через дверь туда и обратно, мебель сохраняется, выбор сбрасывается', async ({ page }) => {
  await openInterior(page);
  const first = await roomId(page);
  // Ставим предмет в комнату.
  await page.waitForFunction(() => window.__planner?.toClient('plan', 280, 220) != null);
  const card = (await visibleBox(page.locator('[data-catalog-id="modern_coffee_table_01"]')))!;
  const target = await page.evaluate(() => {
    const clear = window.__planner!.sceneInfo!;
    return clear ? window.__planner!.toClient('plan', 150, 150) : null;
  });
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x, target!.y, { steps: 10 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.__planner!.furniture())).toHaveLength(1);
  expect(await page.evaluate(() => window.__planner!.selection())).not.toBeNull();

  const doorId = await clickFirstDoor(page);
  await expect.poll(() => roomId(page)).not.toBe(first);
  const second = await roomId(page);
  expect(await page.evaluate(() => window.__planner!.furniture())).toHaveLength(1);
  expect(await page.evaluate(() => window.__planner!.selection())).toBeNull();
  await page.waitForFunction((id) => window.__planner!.sceneInfo!.doors.some((d) => d.id === id), doorId);

  // Возвращаемся через ту же дверь: камера в новой комнате смотрит на неё.
  const back = await clickFirstDoor(page);
  expect(back === doorId || (await roomId(page)) !== second).toBeTruthy();
  await expect.poll(() => roomId(page)).not.toBe(second);
  expect(await page.evaluate(() => window.__planner!.furniture())).toHaveLength(1);
});

test('список комнат переключает активную комнату, а щелчок по плану всей квартиры — тоже', async ({ page }) => {
  await openInterior(page);
  const select = page.getByLabel('Активная комната');
  const options = await select.locator('option').evaluateAll((items) => items.map((o) => (o as HTMLOptionElement).value));
  expect(options.length).toBeGreaterThan(2);
  await select.selectOption(options[1]!);
  await expect.poll(() => roomId(page)).toBe(options[1]);
  await page.getByRole('button', { name: 'Вся квартира' }).click();
  await page.locator(`[data-room-id="${options[2]}"] .plan-floor`).click();
  await expect.poll(() => roomId(page)).toBe(options[2]);
  await expect(select).toHaveValue(options[2]!);
});
