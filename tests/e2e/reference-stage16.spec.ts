import { test } from '@playwright/test';
import { visibleBox } from './helpers';

// Эталонная комната этапа 16: гостиная схемы 2А с расстановкой. Кадры для визуальной приёмки (docs/stage-16).

const ITEMS: Array<{ id: string; dx: number; dz: number }> = [
  { id: 'sofa_03', dx: 0, dz: -0.3 },
  { id: 'modern_coffee_table_01', dx: 0, dz: 0.02 },
  { id: 'modern_arm_chair_01', dx: -0.3, dz: 0.28 },
  { id: 'wooden_bookshelf_worn', dx: 0.3, dz: 0.3 },
];

test('эталонная комната: кадры', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chrome');
  test.setTimeout(90_000);
  await page.goto('/');
  await page.getByRole('button', { name: '2 комнаты' }).click();
  await page.getByLabel('Примерная площадь квартиры').fill('57');
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await page.locator('.template-card').filter({ hasText: '2А' }).click();
  await page.getByRole('button', { name: 'Перейти к настройке' }).click();
  await page.getByRole('button', { name: 'Открыть интерьер' }).click();
  await page.waitForFunction(() => window.__planner?.activeRoomCenter() != null && window.__planner.sceneInfo != null && window.__planner.toClient('plan', 0, 0) != null);
  await page.getByLabel('Показать для всех комнат').check();

  const sizeCm = await page.evaluate(() => window.__planner!.sceneInfo!.clearCm);
  const center = (await page.evaluate(() => window.__planner!.activeRoomCenter()))!;
  for (const item of ITEMS) {
    const card = await visibleBox(page.locator(`[data-catalog-id="${item.id}"]`));
    if (!card) continue;
    const to = await page.evaluate(
      ([x, z]) => window.__planner!.toClient('plan', x, z)!,
      [center.xCm + item.dx * sizeCm.width, center.zCm + item.dz * sizeCm.depth] as const,
    );
    await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
  }
  // Пустое место под комнатой в 3D: щелчок снимает выбор, перетаскивание с него вращает камеру.
  const canvasBox = (await page.locator('.view-scene canvas').boundingBox())!;
  const empty = { x: canvasBox.x + 100, y: canvasBox.y + canvasBox.height - 30 };
  await page.mouse.click(empty.x, empty.y);
  await page.waitForFunction(() => window.__planner!.sceneFurniture.length >= 3);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'docs/stage-16/01-reference-room.png' });

  await page.mouse.move(empty.x, empty.y);
  await page.mouse.down();
  await page.mouse.move(empty.x + 520, empty.y - 60, { steps: 25 });
  await page.mouse.up();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'docs/stage-16/02-reference-room-angle.png' });
});
