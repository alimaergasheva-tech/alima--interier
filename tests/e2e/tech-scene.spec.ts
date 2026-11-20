import { expect, test, type Page } from '@playwright/test';

// Техническая сцена этапа 4: реальные переносы мышью в плане и в 3D (AC-02, AC-06–AC-08).

type Furniture = { id: string; catalogItemId: string; xCm: number; zCm: number; rotationDeg: number };

const furniture = (page: Page) => page.evaluate(() => window.__planner!.furniture()) as Promise<Furniture[]>;
const clientPoint = (page: Page, surface: 'plan' | 'scene', xCm: number, zCm: number) =>
  page.evaluate(([s, x, z]) => window.__planner!.toClient(s, x, z)!, [surface, xCm, zCm] as const);
const cameraPosition = (page: Page) => page.evaluate(() => window.__planner!.camera!.position);

async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, release = true) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  if (release) await page.mouse.up();
}

async function cardCenter(page: Page, catalogId: string) {
  const box = (await page.locator(`[data-catalog-id="${catalogId}"]`).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => window.__planner?.camera != null && window.__planner.toClient('plan', 0, 0) != null);
});

test('комната пуста при старте, план и 3D строятся из одной модели', async ({ page }) => {
  expect(await furniture(page)).toEqual([]);
  // Чистый размер 420 × 350 см: ширина пола на плане в пикселях, делённая на масштаб.
  const scale = Number(await page.getByTestId('plan').getAttribute('data-scale'));
  const floor = (await page.getByTestId('plan-floor').boundingBox())!;
  expect(floor.width / scale).toBeCloseTo(420, 0);
  expect(floor.height / scale).toBeCloseTo(350, 0);
  await expect(page.locator('.plan-dim').first()).toHaveText('420 см');
});

test('перенос из каталога на план и в 3D даёт совпадающие координаты', async ({ page }) => {
  await dragTo(page, await cardCenter(page, 'sofa_03'), await clientPoint(page, 'plan', 210, 100));
  await dragTo(page, await cardCenter(page, 'modern_arm_chair_01'), await clientPoint(page, 'scene', 100, 280));

  const items = await furniture(page);
  expect(items).toHaveLength(2);
  expect(items[0]).toMatchObject({ catalogItemId: 'sofa_03', xCm: 210, zCm: 100, rotationDeg: 0 });
  // Через 3D точка получается лучом до пола; после привязки к сетке 5 см она совпадает с заданной.
  expect(items[1]).toMatchObject({ catalogItemId: 'modern_arm_chair_01', xCm: 100, zCm: 280 });

  // Масштаб на плане: контур дивана шириной 273 см (AC-02).
  const scale = Number(await page.getByTestId('plan').getAttribute('data-scale'));
  // Берётся геометрия контура без обводки: обводка добавляет пиксели, но не сантиметры.
  const rect = page.locator(`[data-furniture-id="${items[0]!.id}"] rect`);
  expect(Number(await rect.getAttribute('width')) / scale).toBeCloseTo(273, 6);
  expect(Number(await rect.getAttribute('height')) / scale).toBeCloseTo(93, 6);

  // Масштаб в сцене: фактический размер загруженной модели совпадает с карточкой до 1 см.
  await page.waitForFunction(() => Object.keys(window.__planner!.measured).length === 2);
  const measured = await page.evaluate(() => window.__planner!.measured);
  expect(Math.abs(measured['sofa_03']!.width - 273)).toBeLessThan(1);
  expect(Math.abs(measured['sofa_03']!.depth - 93)).toBeLessThan(1);
  expect(Math.abs(measured['modern_arm_chair_01']!.width - 82)).toBeLessThan(1);

  // Предмет, поставленный через 3D, стоит на плане в той же точке.
  const chairOnPlan = (await page.locator(`[data-furniture-id="${items[1]!.id}"] rect`).boundingBox())!;
  const expected = await clientPoint(page, 'plan', 100, 280);
  expect(chairOnPlan.x + chairOnPlan.width / 2).toBeCloseTo(expected.x, 0);
  expect(chairOnPlan.y + chairOnPlan.height / 2).toBeCloseTo(expected.y, 0);
});

test('выход за стену: красное превью, причина текстом, положение не фиксируется', async ({ page }) => {
  const status = page.getByTestId('status');
  await dragTo(page, await cardCenter(page, 'sofa_03'), await clientPoint(page, 'plan', 210, 175));
  const [sofa] = await furniture(page);

  // Существующий предмет: центр остаётся в комнате, угол выходит за стену.
  await dragTo(page, await clientPoint(page, 'plan', 210, 175), await clientPoint(page, 'plan', 380, 175), false);
  await expect(page.locator('.plan-item.is-draft.is-invalid')).toBeVisible();
  await expect(status).toHaveText('Предмет выходит за стену');
  expect(await page.evaluate(() => window.__planner!.draft())).toEqual({ valid: false, overSurface: true });
  await page.mouse.up();
  expect(await furniture(page)).toEqual([sofa]);
  await expect(status).toContainText('Положение не изменено');

  // Новый предмет из каталога в недопустимое место не добавляется.
  await dragTo(page, await cardCenter(page, 'modern_arm_chair_01'), await clientPoint(page, 'scene', 400, 175));
  expect(await furniture(page)).toHaveLength(1);
  await expect(status).toContainText('Предмет не добавлен');

  // То же через 3D для существующего предмета.
  await dragTo(page, await clientPoint(page, 'scene', 210, 175), await clientPoint(page, 'scene', 30, 175));
  expect(await furniture(page)).toEqual([sofa]);
  expect(await page.evaluate(() => window.__planner!.historyLength())).toBe(1);
});

test('предмет нельзя поставить в другой предмет', async ({ page }) => {
  const status = page.getByTestId('status');
  await dragTo(page, await cardCenter(page, 'sofa_03'), await clientPoint(page, 'plan', 210, 55));

  // Кресло на диван: красный кандидат, причина с названием предмета, ничего не добавлено.
  await dragTo(page, await cardCenter(page, 'modern_arm_chair_01'), await clientPoint(page, 'plan', 210, 60), false);
  await expect(page.locator('.plan-item.is-draft.is-invalid')).toBeVisible();
  await expect(status).toHaveText('Пересекается с предметом «Диван»');
  await page.mouse.up();
  expect(await furniture(page)).toHaveLength(1);
  await expect(status).toContainText('Предмет не добавлен');

  // Диван занимает z от 8,5 до 101,5 см; кресло глубиной 99 см с центром в z = 155 стоит ниже с зазором.
  await dragTo(page, await cardCenter(page, 'modern_arm_chair_01'), await clientPoint(page, 'plan', 210, 155));
  expect(await furniture(page)).toHaveLength(2);
});

test('перенос в 3D не вращает камеру, после отказа камера снова управляется', async ({ page }) => {
  await dragTo(page, await cardCenter(page, 'modern_coffee_table_01'), await clientPoint(page, 'scene', 210, 175));
  const before = await cameraPosition(page);

  // Допустимый перенос существующего предмета в 3D.
  await dragTo(page, await clientPoint(page, 'scene', 210, 175), await clientPoint(page, 'scene', 300, 250));
  expect((await furniture(page))[0]).toMatchObject({ xCm: 300, zCm: 250 });
  expect(await cameraPosition(page)).toEqual(before);

  // Недопустимое отпускание, затем вращение вида по пустому месту.
  await dragTo(page, await clientPoint(page, 'scene', 300, 250), await clientPoint(page, 'scene', 410, 250));
  expect((await furniture(page))[0]).toMatchObject({ xCm: 300, zCm: 250 });
  expect(await cameraPosition(page)).toEqual(before);

  const canvas = (await page.locator('canvas').boundingBox())!;
  await dragTo(page, { x: canvas.x + 60, y: canvas.y + 60 }, { x: canvas.x + 260, y: canvas.y + 90 });
  await page.waitForTimeout(200);
  expect(await cameraPosition(page)).not.toEqual(before);
});

test('поворот клавишами, отмена переноса и история', async ({ page }) => {
  const status = page.getByTestId('status');
  await dragTo(page, await cardCenter(page, 'sofa_03'), await clientPoint(page, 'plan', 140, 175));

  // У стены поворот на 15° вывел бы угол наружу: поворот отклоняется с причиной.
  await page.keyboard.press('KeyR');
  expect((await furniture(page))[0]).toMatchObject({ rotationDeg: 0 });
  await expect(status).toContainText('Предмет выходит за стену');

  // В середине комнаты поворот проходит; Shift+R возвращает.
  await dragTo(page, await clientPoint(page, 'plan', 140, 175), await clientPoint(page, 'plan', 210, 175));
  await page.keyboard.press('KeyR');
  await page.keyboard.press('KeyR');
  expect((await furniture(page))[0]).toMatchObject({ xCm: 210, rotationDeg: 30 });
  await page.keyboard.press('Shift+KeyR');
  expect((await furniture(page))[0]).toMatchObject({ rotationDeg: 15 });

  // Esc во время переноса отменяет кандидат.
  await dragTo(page, await clientPoint(page, 'plan', 210, 175), await clientPoint(page, 'plan', 230, 190), false);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect((await furniture(page))[0]).toMatchObject({ xCm: 210, zCm: 175 });
  expect(await page.evaluate(() => window.__planner!.draft())).toBeNull();

  // Отмена и повтор.
  await page.keyboard.press('Control+KeyZ');
  expect((await furniture(page))[0]).toMatchObject({ rotationDeg: 30 });
  await page.keyboard.press('Control+KeyY');
  expect((await furniture(page))[0]).toMatchObject({ rotationDeg: 15 });

  // Delete удаляет выбранный предмет.
  await page.mouse.click(...(Object.values(await clientPoint(page, 'plan', 210, 175)) as [number, number]));
  await page.keyboard.press('Delete');
  expect(await furniture(page)).toHaveLength(0);
});
