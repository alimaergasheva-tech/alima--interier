import { expect, test, type Page } from '@playwright/test';
import { visibleBox } from './helpers';

// Этап 18.2: фокус полей и клавиатура, отмена переноса, конфликт камеры и переноса предмета.

type Furniture = { id: string; catalogItemId: string; xCm: number; zCm: number; rotationDeg: number };
const furniture = (page: Page) => page.evaluate(() => window.__planner!.furniture()) as Promise<Furniture[]>;
const clientPoint = (page: Page, surface: 'plan' | 'scene', xCm: number, zCm: number) =>
  page.evaluate(([s, x, z]) => window.__planner!.toClient(s, x, z)!, [surface, xCm, zCm] as const);
const historyLength = (page: Page) => page.evaluate(() => window.__planner!.historyLength());
const cameraPosition = (page: Page) => page.evaluate(() => [...window.__planner!.camera!.position]);

async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, release = true) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  if (release) await page.mouse.up();
}

async function placeSofa(page: Page) {
  const box = (await visibleBox(page.locator('[data-catalog-id="sofa_03"]')))!;
  await dragTo(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, await clientPoint(page, 'plan', 210, 175));
  await page.waitForFunction(() => window.__planner!.measured['sofa_03'] != null);
  expect(await furniture(page)).toHaveLength(1);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/?tech=1');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => window.__planner?.camera != null && window.__planner.toClient('plan', 0, 0) != null);
});

test('в поле ввода клавиши R, Delete, стрелки и Ctrl+Z не действуют на предмет и проект', async ({ page }) => {
  await placeSofa(page);
  await dragTo(page, await clientPoint(page, 'plan', 210, 175), await clientPoint(page, 'plan', 210, 175));
  await page.evaluate(() => window.__planner!.selection());
  const before = { items: await furniture(page), history: await historyLength(page) };

  // Служебное поле: тест защиты проверяет сам обработчик, а не конкретное поле экрана.
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'probe-input';
    document.body.append(input);
    input.focus();
  });
  for (const key of ['KeyR', 'Shift+KeyR', 'ArrowLeft', 'ArrowDown', 'Shift+ArrowRight', 'Delete', 'Backspace', 'Control+KeyZ', 'Control+KeyY']) {
    await page.keyboard.press(key);
  }
  await page.locator('#probe-input').evaluate((node) => node.remove());
  expect(await furniture(page)).toEqual(before.items);
  expect(await historyLength(page)).toBe(before.history);
});

test('Escape во время переноса на плане возвращает предмет и не добавляет шагов истории', async ({ page }) => {
  await placeSofa(page);
  const before = { items: await furniture(page), history: await historyLength(page) };
  await dragTo(page, await clientPoint(page, 'plan', 210, 175), await clientPoint(page, 'plan', 300, 200), false);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(await furniture(page)).toEqual(before.items);
  expect(await historyLength(page)).toBe(before.history);
  // После отмены перенос работает как прежде.
  await dragTo(page, await clientPoint(page, 'plan', 210, 175), await clientPoint(page, 'plan', 250, 175));
  expect((await furniture(page))[0]?.xCm).toBeGreaterThan(220);
});

test('потеря фокуса окна во время переноса отменяет его', async ({ page }) => {
  await placeSofa(page);
  const before = { items: await furniture(page), history: await historyLength(page) };
  await dragTo(page, await clientPoint(page, 'plan', 210, 175), await clientPoint(page, 'plan', 300, 200), false);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.up();
  expect(await furniture(page)).toEqual(before.items);
  expect(await historyLength(page)).toBe(before.history);
});

test('перенос предмета в 3D не вращает камеру, а перетаскивание пустого пола вращает', async ({ page }) => {
  await placeSofa(page);
  const cameraBefore = await cameraPosition(page);
  await dragTo(page, await clientPoint(page, 'scene', 210, 175), await clientPoint(page, 'scene', 250, 200));
  expect(await cameraPosition(page), 'камера стоит на месте при переносе предмета').toEqual(cameraBefore);
  expect((await furniture(page))[0]?.xCm).not.toBe(210);

  // Пустое место вида (низ окна, вне панели времени суток в левом верхнем углу): камера должна повернуться.
  const canvas = (await page.locator('.view-scene canvas').boundingBox())!;
  await dragTo(page, { x: canvas.x + 60, y: canvas.y + canvas.height - 40 }, { x: canvas.x + 260, y: canvas.y + canvas.height - 70 });
  await page.waitForTimeout(200);
  expect(await cameraPosition(page)).not.toEqual(cameraBefore);
});
