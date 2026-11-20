import { expect, test, type Page } from '@playwright/test';
import { visibleBox } from './helpers';

// 16.2: крупные кадры материалов на реальных моделях каталога (docs/stage-16) для визуальной приёмки по D-07:
// ткань и кожа, дерево, металл, стекло (витраж), отделка стен.

const PLACE: Array<{ id: string; fx: number; fz: number }> = [
  { id: 'sofa_03', fx: -0.2, fz: -0.33 },
  { id: 'modern_coffee_table_02', fx: -0.2, fz: -0.05 },
  { id: 'vintage_electric_kettle', fx: -0.2, fz: -0.05 },
  { id: 'dining_table', fx: 0.22, fz: 0.25 },
  { id: 'dining_chair_02', fx: 0.12, fz: 0.07 },
  { id: 'dining_chair_02', fx: 0.32, fz: 0.07 },
  { id: 'electric_stove', fx: -0.4, fz: 0.15 },
];

async function dragFromCatalog(page: Page, id: string, to: { x: number; y: number }) {
  const card = (await visibleBox(page.locator(`[data-catalog-id="${id}"]`)))!;
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

test('материалы на реальных моделях: кадры', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chrome');
  test.setTimeout(120_000);
  await page.goto('/');
  await page.getByRole('button', { name: '2 комнаты' }).click();
  await page.getByLabel('Примерная площадь квартиры').fill('57');
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await page.locator('.template-card').filter({ hasText: '2А' }).click();
  await page.getByRole('button', { name: 'Перейти к настройке' }).click();
  await page.getByRole('button', { name: 'Открыть интерьер' }).click();
  await page.waitForFunction(() => window.__planner?.activeRoomCenter() != null && window.__planner.sceneInfo != null && window.__planner.toClient('plan', 0, 0) != null);
  await page.getByLabel('Показать для всех комнат').check();

  const size = await page.evaluate(() => window.__planner!.sceneInfo!.clearCm);
  const c = (await page.evaluate(() => window.__planner!.activeRoomCenter()))!;
  const at = (fx: number, fz: number) => ({ x: c.xCm + fx * size.width, z: c.zCm + fz * size.depth });

  for (const item of PLACE) {
    const p = at(item.fx, item.fz);
    const to = await page.evaluate(([x, z]) => window.__planner!.toClient('plan', x, z)!, [p.x, p.z] as const);
    await dragFromCatalog(page, item.id, to);
  }
  expect((await page.evaluate(() => window.__planner!.furniture())).map((f) => f.catalogItemId).sort(), 'все предметы расставлены')
    .toEqual(PLACE.map((p) => p.id).sort());

  // Отделка: обои на все стороны стен активной комнаты.
  await page.getByRole('button', { name: 'Вся квартира' }).click();
  await page.getByRole('tab', { name: 'Отделка' }).click();
  const room = await page.getByLabel('Активная комната').inputValue();
  const keys = (await page.locator('[data-wall-surface]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-wall-surface')!)))
    .filter((key) => key.endsWith(`:${room}`));
  const applyWallpaper = async (finishId: string) => {
    await page.getByRole('tab', { name: 'Отделка' }).click();
    for (const key of keys) {
      await page.locator(`[data-wall-surface="${key}"]`).dispatchEvent('pointerdown', { button: 0 });
      await page.locator(`[data-finish-id="${finishId}"]`).click();
    }
    await page.getByRole('tab', { name: 'Мебель' }).click();
  };
  await applyWallpaper('wp-ginkgo-sand');
  await page.getByRole('tab', { name: 'Мебель' }).click();
  await page.waitForFunction(() => window.__planner!.sceneFurniture.length >= 7 && Object.keys(window.__planner!.measured).length >= 5);

  const Y = 60;
  const shot = async (name: string, from: [number, number, number], target: [number, number, number]) => {
    await page.evaluate(([f, t]) => window.__planner!.lookAt!(f, t), [from, target] as const);
    await page.waitForTimeout(900);
    const box = (await page.locator('.view-scene canvas').boundingBox())!;
    await page.screenshot({ path: `docs/stage-16/${name}.png`, clip: box });
  };
  const sofa = at(-0.2, -0.2);
  const dining = at(0.22, 0.18);
  const stove = at(-0.4, 0.15);
  const top = c.zCm - size.depth / 2;
  await shot('03-fabric-leather-stone', [sofa.x + 40, 130, sofa.z + 230], [sofa.x, Y, sofa.z]);
  await shot('04-wood', [dining.x - 120, 120, dining.z + 200], [dining.x, 50, dining.z]);
  await shot('05-metal', [stove.x + 160, 110, stove.z + 140], [stove.x, 50, stove.z]);
  await shot('06-glass-window', [c.xCm + 100, 140, top + 280], [c.xCm + 100, 140, top]);
  await shot('07-wallpaper-wide', [c.xCm + size.width * 0.4, 170, c.zCm + size.depth * 0.45], [c.xCm - size.width * 0.15, 90, c.zCm - size.depth * 0.3]);
  // Тёмные тропики для сравнения контраста с мебелью.
  await applyWallpaper('wp-tropical-emerald');
  await page.waitForTimeout(500);
  await shot('08-wallpaper-tropical', [c.xCm + size.width * 0.4, 170, c.zCm + size.depth * 0.45], [c.xCm - size.width * 0.15, 90, c.zCm - size.depth * 0.3]);
});
