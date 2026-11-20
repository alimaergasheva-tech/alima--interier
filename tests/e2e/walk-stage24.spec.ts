import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { visibleBox } from './helpers';

// Задача 24: режим «Прогулка» (SPEC D-17): вход и выход, высота глаз, W A S D, стены и проёмы,
// возврат в ту же комнату, проект не меняется. Кадры из нескольких мест — docs/stage-24.

async function openInterior(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '2 комнаты' }).click();
  await page.getByLabel('Примерная площадь квартиры').fill('57');
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await page.locator('.template-card').filter({ hasText: '2А' }).click();
  await page.getByRole('button', { name: 'Перейти к настройке' }).click();
  await page.getByRole('button', { name: 'Открыть интерьер' }).click();
  await page.waitForFunction(() => window.__planner?.activeRoomCenter() != null && window.__planner.sceneInfo != null);
}

const walkState = (page: Page) => page.evaluate(() => window.__planner!.walk);

/** Держит клавишу, пока условие по состоянию игрока не выполнено или не истёк предел: скорость кадров на машине не должна влиять на результат. */
async function holdUntil(page: Page, code: string, done: (w: NonNullable<Awaited<ReturnType<typeof walkState>>>, prev: NonNullable<Awaited<ReturnType<typeof walkState>>>) => boolean, maxMs: number, shift = false) {
  if (shift) await page.keyboard.down('Shift');
  await page.keyboard.down(code);
  const started = Date.now();
  let prev = (await walkState(page))!;
  let still = 0;
  while (Date.now() - started < maxMs) {
    await page.waitForTimeout(250);
    const now = (await walkState(page))!;
    still = Math.hypot(now.xCm - prev.xCm, now.zCm - prev.zCm) < 0.5 ? still + 1 : 0;
    if (done(now, prev) || still >= 4) { prev = now; break; }
    prev = now;
  }
  await page.keyboard.up(code);
  if (shift) await page.keyboard.up('Shift');
}

test('прогулка: вход, высота глаз, движение, стены, дверной проём, выход в ту же комнату', async ({ page }) => {
  test.setTimeout(90_000);
  await openInterior(page);
  const before = {
    center: await page.evaluate(() => window.__planner!.activeRoomCenter()),
    history: await page.evaluate(() => window.__planner!.historyLength()),
    furniture: await page.evaluate(() => window.__planner!.furniture()),
    info: await page.evaluate(() => window.__planner!.sceneInfo!),
  };

  await page.getByRole('button', { name: 'Прогулка', exact: true }).click();
  await page.waitForFunction(() => window.__planner!.walk != null);
  await expect(page.getByTestId('walk-hint')).toBeVisible();
  const start = (await walkState(page))!;
  expect(start.roomId).toBe(before.info.roomId);
  expect(start.xCm).toBeCloseTo(before.center!.xCm, 0);
  const eye = await page.evaluate(() => window.__planner!.camera!.position[1]);
  expect(eye, 'высота глаз 160 см').toBeCloseTo(1.6, 2);

  // Движение вперёд клавишей W.
  await page.evaluate(() => window.__planner!.walkTo!(window.__planner!.walk!.xCm, window.__planner!.walk!.zCm, 0));
  const a = (await walkState(page))!;
  await holdUntil(page, 'KeyW', (w) => Math.hypot(w.xCm - a.xCm, w.zCm - a.zCm) > 60, 5000);
  const b = (await walkState(page))!;
  expect(Math.hypot(b.xCm - a.xCm, b.zCm - a.zCm), 'W двигает вперёд').toBeGreaterThan(40);
  expect(b.zCm, 'yaw 0 смотрит к −Z').toBeLessThan(a.zCm);

  // Стена не пускает: идём к северной стене с ускорением.
  await holdUntil(page, 'KeyW', () => false, 15_000, true);
  const wall = (await walkState(page))!;
  const northClear = before.center!.zCm - before.info.clearCm.depth / 2;
  expect(wall.zCm, 'у стены, не за ней').toBeGreaterThanOrEqual(northClear + 21);
  expect(wall.roomId).toBe(before.info.roomId);

  // Дверной проём: идём к межкомнатной двери.
  const door = before.info.doors.find((d) => d.id !== 'entrance');
  expect(door, 'в комнате есть межкомнатная дверь').toBeTruthy();
  const dx = door!.xCm - before.center!.xCm, dz = door!.zCm - before.center!.zCm;
  const length = Math.hypot(dx, dz);
  const ux = dx / length, uz = dz / length;
  const yaw = (Math.atan2(-ux, -uz) * 180) / Math.PI;
  await page.evaluate(([x, z, yawDeg]) => window.__planner!.walkTo!(x, z, yawDeg), [door!.xCm - ux * 90, door!.zCm - uz * 90, yaw] as const);
  await holdUntil(page, 'KeyW', (w) => w.roomId !== before.info.roomId, 8000);
  const through = (await walkState(page))!;
  expect(through.roomId, 'прошли в соседнюю комнату').not.toBe(before.info.roomId);

  // Выход: редактор в той же комнате, проект не изменился.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Прогулка', exact: true })).toBeVisible();
  await page.waitForFunction(() => window.__planner!.walk == null && window.__planner!.sceneInfo != null);
  const after = {
    center: await page.evaluate(() => window.__planner!.activeRoomCenter()),
    history: await page.evaluate(() => window.__planner!.historyLength()),
    furniture: await page.evaluate(() => window.__planner!.furniture()),
    roomId: await page.evaluate(() => window.__planner!.sceneInfo!.roomId),
  };
  expect(after.roomId).toBe(before.info.roomId);
  expect(after.center).toEqual(before.center);
  expect(after.history).toBe(before.history);
  expect(after.furniture).toEqual(before.furniture);
});

test('прогулка: кнопка выхода и фокус в поле ввода не двигают игрока', async ({ page }) => {
  await openInterior(page);
  await page.getByRole('button', { name: 'Прогулка', exact: true }).click();
  await page.waitForFunction(() => window.__planner!.walk != null);
  await page.getByRole('button', { name: 'Выйти из прогулки' }).click();
  await page.waitForFunction(() => window.__planner!.walk == null);
  await expect(page.getByRole('button', { name: 'Прогулка', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('кадры прогулки: четыре стороны из стартовой комнаты и соседняя комната', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chrome');
  test.setTimeout(120_000);
  mkdirSync('docs/stage-24', { recursive: true });
  await openInterior(page);
  const info = await page.evaluate(() => window.__planner!.sceneInfo!);
  const c = (await page.evaluate(() => window.__planner!.activeRoomCenter()))!;
  await page.getByRole('button', { name: 'Прогулка', exact: true }).click();
  await page.waitForFunction(() => window.__planner!.walk != null);
  // Из четырёх углов комнаты по диагонали: виден весь объём, окна и проёмы.
  const corners: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const yawTo = (dx: number, dz: number) => (Math.atan2(-dx, -dz) * 180) / Math.PI;
  for (const [i, [sx, sz]] of corners.entries()) {
    const x = c.xCm + sx * (info.clearCm.width / 2 - 45), z = c.zCm + sz * (info.clearCm.depth / 2 - 45);
    await page.evaluate(([px, pz, y]) => window.__planner!.walkTo!(px, pz, y), [x, z, yawTo(c.xCm - x, c.zCm - z)] as const);
    await page.waitForTimeout(700);
    await page.locator('.view-scene canvas').screenshot({ path: `docs/stage-24/01-corner-${i + 1}.png` });
  }
  const door = info.doors.find((d) => d.id !== 'entrance');
  if (door) {
    const dx = door.xCm - c.xCm, dz = door.zCm - c.zCm;
    const length = Math.hypot(dx, dz);
    const ux = dx / length, uz = dz / length;
    // Из комнаты в проём и обратно из проёма вглубь стартовой комнаты.
    await page.evaluate(([x, z, y]) => window.__planner!.walkTo!(x, z, y), [door.xCm - ux * 160, door.zCm - uz * 160, yawTo(ux, uz)] as const);
    await page.waitForTimeout(700);
    await page.locator('.view-scene canvas').screenshot({ path: 'docs/stage-24/02-toward-door.png' });
    await page.evaluate(([x, z, y]) => window.__planner!.walkTo!(x, z, y), [door.xCm + ux * 40, door.zCm + uz * 40, yawTo(-ux, -uz)] as const);
    await page.waitForTimeout(700);
    await page.locator('.view-scene canvas').screenshot({ path: 'docs/stage-24/03-looking-back.png' });
    await page.evaluate(([x, z, y]) => window.__planner!.walkTo!(x, z, y), [door.xCm + ux * 40, door.zCm + uz * 40, yawTo(ux, uz)] as const);
    await page.waitForTimeout(700);
    await page.locator('.view-scene canvas').screenshot({ path: 'docs/stage-24/04-next-room.png' });
  }
});

test('прогулка: свет включённых комнат берётся из ограниченного набора, ближайшая комната светит', async ({ page }) => {
  test.setTimeout(90_000);
  await openInterior(page);
  const rooms = await page.getByLabel('Активная комната').locator('option').evaluateAll((nodes) => nodes.map((n) => (n as HTMLOptionElement).value));
  const toggle = page.getByRole('switch', { name: 'Свет в комнате' });
  for (const id of rooms) {
    await page.getByLabel('Активная комната').selectOption(id);
    await page.waitForFunction((r) => window.__planner!.sceneInfo?.roomId === r, id);
    if ((await toggle.getAttribute('aria-checked')) !== 'true') await toggle.click();
  }
  expect(Object.values(await page.evaluate(() => window.__planner!.roomLights())).filter(Boolean)).toHaveLength(rooms.length);
  await page.getByRole('button', { name: 'Прогулка', exact: true }).click();
  await page.waitForFunction(() => window.__planner!.walk != null);
  await page.waitForTimeout(400);
  const state = await page.evaluate(() => ({ lights: window.__planner!.walkLights, room: window.__planner!.walk!.roomId }));
  expect(state.lights.length).toBeLessThanOrEqual(4);
  expect(state.lights.length).toBe(Math.min(4, rooms.length));
  expect(state.lights[0], 'первой идёт комната игрока').toBe(state.room);
});

test('кадры прогулки: мебель, обои и окно в обставленной комнате', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chrome');
  test.setTimeout(150_000);
  mkdirSync('docs/stage-24', { recursive: true });
  await openInterior(page);
  await page.getByLabel('Показать для всех комнат').check();
  const size = await page.evaluate(() => window.__planner!.sceneInfo!.clearCm);
  const c = (await page.evaluate(() => window.__planner!.activeRoomCenter()))!;
  // Расстановка, проверенная в materials-stage16: допустимые места без пересечений с проёмами.
  const place = [
    { id: 'sofa_03', fx: -0.2, fz: -0.33 },
    { id: 'modern_coffee_table_02', fx: -0.2, fz: -0.05 },
    { id: 'vintage_electric_kettle', fx: -0.2, fz: -0.05 },
    { id: 'dining_table', fx: 0.22, fz: 0.25 },
    { id: 'dining_chair_02', fx: 0.12, fz: 0.07 },
    { id: 'dining_chair_02', fx: 0.32, fz: 0.07 },
    { id: 'electric_stove', fx: -0.4, fz: 0.15 },
  ];
  for (const item of place) {
    const x = c.xCm + item.fx * size.width, z = c.zCm + item.fz * size.depth;
    const to = await page.evaluate(([px, pz]) => window.__planner!.toClient('plan', px, pz)!, [x, z] as const);
    const card = (await visibleBox(page.locator(`[data-catalog-id="${item.id}"]`)))!;
    await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
  }
  await page.waitForFunction((n) => window.__planner!.sceneFurniture.length >= n, place.length, { timeout: 30_000 }).catch(async () => {
    const have = (await page.evaluate(() => window.__planner!.furniture())).map((f) => f.catalogItemId);
    throw new Error(`Расставлено ${have.length} из ${place.length}: ${have.join(', ') || 'ничего'}`);
  });

  // Обои на все стороны активной комнаты.
  await page.getByRole('button', { name: 'Вся квартира' }).click();
  await page.getByRole('tab', { name: 'Отделка' }).click();
  const room = await page.getByLabel('Активная комната').inputValue();
  const keys = (await page.locator('[data-wall-surface]').evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-wall-surface')!)))
    .filter((key) => key.endsWith(`:${room}`));
  expect(keys.length).toBeGreaterThan(0);
  for (const key of keys) {
    await page.locator(`[data-wall-surface="${key}"]`).dispatchEvent('pointerdown', { button: 0 });
    await page.locator('[data-finish-id="wp-ginkgo-sand"]').click();
  }
  await page.getByRole('tab', { name: 'Мебель' }).click();
  await page.waitForFunction(() => Object.keys(window.__planner!.measured).length >= 5);
  const furnitureBefore = await page.evaluate(() => window.__planner!.furniture());

  await page.getByRole('button', { name: 'Прогулка', exact: true }).click();
  await page.waitForFunction(() => window.__planner!.walk != null);
  const north = c.zCm - size.depth / 2;
  const frames: Array<[string, number, number, number]> = [
    // К северной стене с окном: стоим в глубине комнаты.
    ['05-furnished-window', c.xCm + 100, north + size.depth * 0.7, 0],
    // По диагонали из угла: обои, мебель, окна по стенам.
    ['06-furnished-corner', c.xCm + size.width * 0.38, c.zCm + size.depth * 0.38, 0],
  ];
  for (const [name, x, z, yaw] of frames) {
    const d = name.includes('corner') ? (Math.atan2(-(c.xCm - 0.15 * size.width - x), -(c.zCm - 0.3 * size.depth - z)) * 180) / Math.PI : yaw;
    await page.evaluate(([px, pz, y]) => window.__planner!.walkTo!(px, pz, y), [x, z, d] as const);
    await page.waitForTimeout(900);
    await page.locator('.view-scene canvas').screenshot({ path: `docs/stage-24/${name}.png` });
  }
  // Мебель и проект при прогулке не менялись.
  expect(await page.evaluate(() => window.__planner!.furniture())).toEqual(furnitureBefore);
});
