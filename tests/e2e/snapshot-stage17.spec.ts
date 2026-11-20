import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { visibleBox } from './helpers';

// Задачи 17, 20.5, 21.5, 23.4: «Качественный снимок» (SPEC D-09). Качество «Черновик» (16 выборок) — чтобы тесты шли быстро.
// Кадры: docs/stage-17, docs/stage-21 (ночь со светом и без), docs/stage-23 (пол).

const PLACE = [
  { id: 'sofa_03', fx: -0.2, fz: -0.33 },
  { id: 'modern_coffee_table_02', fx: -0.2, fz: -0.05 },
  { id: 'dining_table', fx: 0.22, fz: 0.25 },
];

async function openInterior(page: Page, furnish = true) {
  await page.goto('/');
  await page.getByRole('button', { name: '2 комнаты' }).click();
  await page.getByLabel('Примерная площадь квартиры').fill('57');
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await page.locator('.template-card').filter({ hasText: '2А' }).click();
  await page.getByRole('button', { name: 'Перейти к настройке' }).click();
  await page.getByRole('button', { name: 'Открыть интерьер' }).click();
  await page.waitForFunction(() => window.__planner?.activeRoomCenter() != null && window.__planner.sceneInfo != null && window.__planner.toClient('plan', 0, 0) != null);
  if (furnish) {
    await page.getByLabel('Показать для всех комнат').check();
    const size = await page.evaluate(() => window.__planner!.sceneInfo!.clearCm);
    const c = (await page.evaluate(() => window.__planner!.activeRoomCenter()))!;
    for (const item of PLACE) {
      const to = await page.evaluate(([x, z]) => window.__planner!.toClient('plan', x, z)!, [c.xCm + item.fx * size.width, c.zCm + item.fz * size.depth] as const);
      const card = (await visibleBox(page.locator(`[data-catalog-id="${item.id}"]`)))!;
      await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 8 });
      await page.mouse.up();
    }
    await page.waitForFunction((n) => window.__planner!.sceneFurniture.length >= n, PLACE.length, { timeout: 30_000 });
  }
}

async function aim(page: Page) {
  const size = await page.evaluate(() => window.__planner!.sceneInfo!.clearCm);
  const c = (await page.evaluate(() => window.__planner!.activeRoomCenter()))!;
  await page.evaluate(([x, z, w, d]) => window.__planner!.lookAt!([x + w * 0.4, 150, z + d * 0.45], [x - w * 0.1, 80, z - d * 0.3]), [c.xCm, c.zCm, size.width, size.depth] as const);
  await page.waitForTimeout(500);
}

const panel = (page: Page) => page.getByTestId('snapshot-panel');

async function runSnapshot(page: Page, samples = 16) {
  await page.getByLabel('Качество снимка').selectOption(String(samples));
  await page.getByRole('button', { name: 'Качественный снимок' }).click();
  await expect(panel(page)).toHaveAttribute('data-phase', 'done', { timeout: 240_000 });
}

/** Средняя яркость центральной части кадра холста (без панелей по краям). */
async function brightness(page: Page, path: string, region = { x0: 0.25, x1: 0.7, y0: 0.3, y1: 0.75 }) {
  const png = await page.locator('.view-scene canvas').screenshot({ path });
  return page.evaluate(async ([b64, r]) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
    const ctx = cv.getContext('2d')!; ctx.drawImage(bmp, 0, 0);
    const x = Math.floor(bmp.width * r.x0), y = Math.floor(bmp.height * r.y0);
    const w = Math.floor(bmp.width * (r.x1 - r.x0)), h = Math.floor(bmp.height * (r.y1 - r.y0));
    const d = ctx.getImageData(x, y, w, h).data; let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
    return sum / (d.length / 4);
  }, [png.toString('base64'), region] as const);
}

test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chrome'); });

test('снимок: прогресс, готовый кадр, проект не меняется; любое изменение закрывает снимок, редактор работает', async ({ page }) => {
  test.setTimeout(300_000);
  mkdirSync('docs/stage-17', { recursive: true });
  await openInterior(page);
  await page.getByRole('button', { name: 'День' }).click();
  await aim(page);
  const before = await page.evaluate(() => ({ history: window.__planner!.historyLength(), furniture: window.__planner!.furniture() }));

  await page.getByLabel('Качество снимка').selectOption('16');
  await page.getByRole('button', { name: 'Качественный снимок' }).click();
  await expect(panel(page)).toHaveAttribute('data-phase', /preparing|running|done/);
  await expect(panel(page)).toHaveAttribute('data-phase', 'done', { timeout: 240_000 });
  await expect(page.getByTestId('snapshot-done')).toContainText('16 выборок');
  await page.locator('.view-scene canvas').screenshot({ path: 'docs/stage-17/01-day-16.png' });

  const after = await page.evaluate(() => ({ history: window.__planner!.historyLength(), furniture: window.__planner!.furniture() }));
  expect(after.history, 'снимок не добавляет шагов истории').toBe(before.history);
  expect(after.furniture, 'предметы, размеры и положения те же').toEqual(before.furniture);

  // Изменение времени суток закрывает снимок: устаревший результат не остаётся на экране.
  await page.getByRole('button', { name: 'Вечер' }).click();
  await expect(panel(page)).toHaveAttribute('data-phase', 'idle');
  await expect(page.getByTestId('snapshot-note')).toContainText('время суток');
  // Редактор работает: камера отвечает, кадры идут.
  const cam0 = await page.evaluate(() => window.__planner!.camera!.position);
  await page.evaluate(() => window.__planner!.lookAt!([100, 150, 100], [300, 80, 300]));
  await page.waitForFunction((p) => JSON.stringify(window.__planner!.camera!.position) !== JSON.stringify(p), cam0);
});

test('отмена во время трассировки и «Остановить»: редактор жив, остановленный кадр остаётся', async ({ page }) => {
  test.setTimeout(300_000);
  await openInterior(page);
  await aim(page);
  const history = await page.evaluate(() => window.__planner!.historyLength());

  await page.getByLabel('Качество снимка').selectOption('256');
  await page.getByRole('button', { name: 'Качественный снимок' }).click();
  await expect(panel(page)).toHaveAttribute('data-phase', 'running', { timeout: 60_000 });
  await expect(page.getByTestId('snapshot-progress')).toContainText('из 256');
  await page.getByRole('button', { name: 'Отмена' }).click();
  await expect(panel(page)).toHaveAttribute('data-phase', 'idle');
  const cam0 = await page.evaluate(() => window.__planner!.camera!.position);
  await page.evaluate(() => window.__planner!.lookAt!([120, 150, 120], [300, 80, 300]));
  await page.waitForFunction((p) => JSON.stringify(window.__planner!.camera!.position) !== JSON.stringify(p), cam0);

  await aim(page);
  await page.getByRole('button', { name: 'Качественный снимок' }).click();
  await expect(panel(page)).toHaveAttribute('data-phase', 'running', { timeout: 60_000 });
  await page.waitForFunction(() => /Выборок [2-9]\d* из 256|Выборок \d{2,} из 256/.test(document.querySelector('[data-testid="snapshot-progress"]')?.textContent ?? ''), null, { timeout: 120_000 });
  await page.getByRole('button', { name: 'Остановить' }).click();
  await expect(panel(page)).toHaveAttribute('data-phase', 'done');
  await expect(page.getByTestId('snapshot-done')).toContainText('остановлено');
  await page.getByRole('button', { name: 'Закрыть' }).click();
  await expect(panel(page)).toHaveAttribute('data-phase', 'idle');
  expect(await page.evaluate(() => window.__planner!.historyLength())).toBe(history);
});

test('ночью свет ламп виден в снимке: комната со светом заметно ярче, чем без света (20.5, 21.5)', async ({ page }) => {
  test.setTimeout(420_000);
  mkdirSync('docs/stage-21', { recursive: true });
  await openInterior(page);
  await page.getByRole('button', { name: 'Ночь' }).click();
  await aim(page);
  await runSnapshot(page);
  const off = await brightness(page, 'docs/stage-21/snapshot-night-off.png');
  await page.getByRole('button', { name: 'Закрыть' }).click();
  await page.getByRole('switch', { name: 'Свет в комнате' }).click();
  await aim(page);
  await runSnapshot(page);
  const on = await brightness(page, 'docs/stage-21/snapshot-night-on.png');
  console.log('[snapshot] ночь без света / со светом', Math.round(off), Math.round(on));
  expect(on, `со светом ${on} должно быть ярче, чем без света ${off}`).toBeGreaterThan(off * 1.3);
});

test('покрытие пола входит в снимок: светлый дуб ярче тёмного ореха (23.4)', async ({ page }) => {
  test.setTimeout(420_000);
  mkdirSync('docs/stage-23', { recursive: true });
  await openInterior(page, false);
  await page.getByRole('button', { name: 'День' }).click();
  await page.getByRole('tab', { name: 'Отделка' }).click();
  await page.getByRole('button', { name: 'Пол', exact: true }).click();
  const size = await page.evaluate(() => window.__planner!.sceneInfo!.clearCm);
  const c = (await page.evaluate(() => window.__planner!.activeRoomCenter()))!;
  const lookDown = async () => {
    await page.evaluate(([x, z, w, d]) => window.__planner!.lookAt!([x + w * 0.35, 190, z + d * 0.4], [x - w * 0.05, 0, z - d * 0.1]), [c.xCm, c.zCm, size.width, size.depth] as const);
    await page.waitForTimeout(500);
  };
  const floorRegion = { x0: 0.3, x1: 0.8, y0: 0.5, y1: 0.9 };
  const result: Record<string, number> = {};
  for (const id of ['laminate-oak', 'laminate-walnut']) {
    await page.locator(`[data-finish-id="floor-${id}"]`).click();
    await lookDown();
    await runSnapshot(page);
    result[id] = await brightness(page, `docs/stage-23/snapshot-${id}.png`, floorRegion);
    await page.getByRole('button', { name: 'Закрыть' }).click();
  }
  console.log('[snapshot] пол', JSON.stringify(result));
  expect(result['laminate-oak']!, 'дуб светлее ореха в снимке').toBeGreaterThan(result['laminate-walnut']! * 1.25);
});
