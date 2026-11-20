import { expect, test, type Page } from '@playwright/test';
import { visibleBox } from './helpers';

// AC-13 (13.6): ошибка загрузки одной модели не ломает остальную работу, повтор её восстанавливает.

const SOFA_URL = '**/models/sofa_03/sofa_03.gltf';

type Furniture = { id: string; catalogItemId: string };
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

test.beforeEach(async ({ page }) => {
  await page.goto('/?tech=1');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => window.__planner?.camera != null && window.__planner.toClient('plan', 0, 0) != null);
});

test('сбой загрузки модели: причина и повтор, остальные предметы работают', async ({ page }) => {
  const wait = { timeout: 10_000 };
  await page.route(SOFA_URL, (route) => route.abort());
  await dragTo(page, await cardCenter(page, 'sofa_03'), await clientPoint(page, 'plan', 210, 100));

  await test.step('предмет в проекте, в интерфейсе причина и кнопка повтора', async () => {
    expect(await furniture(page)).toHaveLength(1);
    const alert = page.getByTestId('model-error');
    await expect(alert).toBeVisible(wait);
    await expect(alert).toContainText('Диван');
    await expect(alert.getByRole('button', { name: 'Повторить загрузку' })).toBeVisible();
  });

  await test.step('другой предмет загружается и ставится', async () => {
    await dragTo(page, await cardCenter(page, 'modern_arm_chair_01'), await clientPoint(page, 'plan', 100, 280));
    expect(await furniture(page)).toHaveLength(2);
    await page.waitForFunction(() => window.__planner!.measured['modern_arm_chair_01'] != null, undefined, wait);
    expect(await page.evaluate(() => window.__planner!.measured['sofa_03'])).toBeUndefined();
  });

  await test.step('повтор после восстановления файла: сообщение исчезает', async () => {
    await page.unroute(SOFA_URL);
    await page.getByTestId('model-error').getByRole('button', { name: 'Повторить загрузку' }).click();
    await expect(page.getByTestId('model-error')).toHaveCount(0, wait);
  });

  await test.step('после повтора модель загружена', async () => {
    await page.waitForFunction(() => window.__planner!.measured['sofa_03'] != null, undefined, wait);
    expect(await furniture(page)).toHaveLength(2);
  });
});
