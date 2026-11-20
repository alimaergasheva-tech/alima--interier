import { expect, test, type Page } from '@playwright/test';
import { findCatalogItem } from '../../src/catalog/techCatalog';
import { ROTATE_HANDLE_LIFT_CM } from '../../src/interaction/rotateHandle';
import { visibleBox } from './helpers';

// Этап 14: поворот ручкой на плане, сдвиг стрелками, отмена переноса при смене комнаты.

type Furniture = { id: string; catalogItemId: string; xCm: number; zCm: number; rotationDeg: number };

const furniture = (page: Page) => page.evaluate(() => window.__planner!.furniture()) as Promise<Furniture[]>;
const clientPoint = (page: Page, surface: 'plan' | 'scene', xCm: number, zCm: number) =>
  page.evaluate(([s, x, z]) => window.__planner!.toClient(s, x, z)!, [surface, xCm, zCm] as const);

async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
}

async function cardCenter(page: Page, catalogId: string) {
  const box = (await visibleBox(page.locator(`[data-catalog-id="${catalogId}"]`)))!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function placeSofa(page: Page) {
  await dragTo(page, await cardCenter(page, 'sofa_03'), await clientPoint(page, 'plan', 210, 175));
  await page.waitForFunction(() => window.__planner!.measured['sofa_03'] != null);
  expect(await furniture(page)).toHaveLength(1);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?tech=1');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => window.__planner?.camera != null && window.__planner.toClient('plan', 0, 0) != null);
});

test('ручка поворота: шаг 15°, Alt — свободный угол, один шаг истории', async ({ page }) => {
  await placeSofa(page);
  const handle = page.getByTestId('rotate-handle');
  const handleCenter = async () => {
    const box = (await handle.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  // Указатель справа от центра: тыл предмета повёрнут вправо, угол 270°.
  await dragTo(page, await handleCenter(), await clientPoint(page, 'plan', 360, 175));
  expect((await furniture(page))[0]).toMatchObject({ xCm: 210, zCm: 175, rotationDeg: 270 });

  // Без Alt угол округляется до 15°, с Alt — до градуса.
  await dragTo(page, await handleCenter(), await clientPoint(page, 'plan', 310, 125));
  expect((await furniture(page))[0]?.rotationDeg).toBe(300);
  await page.keyboard.down('Alt');
  await dragTo(page, await handleCenter(), await clientPoint(page, 'plan', 310, 125));
  await page.keyboard.up('Alt');
  expect((await furniture(page))[0]?.rotationDeg).toBe(297);

  // Отмена возвращает прежний угол одним шагом.
  await page.keyboard.press('Control+KeyZ');
  expect((await furniture(page))[0]?.rotationDeg).toBe(300);
});

test('ручка поворота: недопустимый угол отклоняется с причиной', async ({ page }) => {
  // Диван вплотную к стене (как в tech-scene): поворот на 15° вывел бы угол наружу.
  await dragTo(page, await cardCenter(page, 'sofa_03'), await clientPoint(page, 'plan', 140, 175));
  await page.waitForFunction(() => window.__planner!.measured['sofa_03'] != null);
  const box = (await page.getByTestId('rotate-handle').boundingBox())!;
  await dragTo(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, await clientPoint(page, 'plan', 114, 78));
  expect((await furniture(page))[0]).toMatchObject({ xCm: 140, rotationDeg: 0 });
  await expect(page.getByTestId('status')).toContainText('Предмет выходит за стену');
});

test('стрелки сдвигают выбранный предмет на 1 см, с Shift — на 10 см', async ({ page }) => {
  await placeSofa(page);
  await page.keyboard.press('ArrowRight');
  expect((await furniture(page))[0]).toMatchObject({ xCm: 211, zCm: 175 });
  await page.keyboard.press('Shift+ArrowDown');
  expect((await furniture(page))[0]).toMatchObject({ xCm: 211, zCm: 185 });
  await page.keyboard.press('Control+KeyZ');
  expect((await furniture(page))[0]).toMatchObject({ xCm: 211, zCm: 175 });
});

test('смена комнаты во время переноса отменяет кандидат', async ({ page }) => {
  await placeSofa(page);
  const from = await clientPoint(page, 'plan', 210, 175);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + 20, { steps: 4 });
  expect(await page.evaluate(() => window.__planner!.draft())).not.toBeNull();
  await page.evaluate(() => window.__planner!.setActiveRoom(null));
  expect(await page.evaluate(() => window.__planner!.draft())).toBeNull();
  await page.mouse.up();
});

test('ручка поворота в 3D: тот же результат, камера не вращается', async ({ page }) => {
  await placeSofa(page);
  const sofa = findCatalogItem('sofa_03')!;
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

  // Центр шара: над тыльным краем (угол 0 — в сторону −Z).
  const handleZ = 175 - sofa.sizeCm.depth / 2;
  const handle = await page.evaluate(
    ([x, z, y]) => window.__planner!.project3d!(x, y, z),
    [210, handleZ, sofa.sizeCm.height + ROTATE_HANDLE_LIFT_CM] as const,
  );
  const cameraBefore = await page.evaluate(() => window.__planner!.camera!.position);
  await dragTo(page, handle, await clientPoint(page, 'scene', 360, 175));
  expect((await furniture(page))[0]).toMatchObject({ xCm: 210, zCm: 175, rotationDeg: 270 });
  expect(await page.evaluate(() => window.__planner!.camera!.position)).toEqual(cameraBefore);
});
