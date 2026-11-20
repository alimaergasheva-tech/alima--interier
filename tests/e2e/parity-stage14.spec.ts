import { expect, test, type Page } from '@playwright/test';
import { visibleBox } from './helpers';

// 14.7: один набор координат даёт одинаковый результат при переносе на 2D-план и в 3D-вид (SPEC §11.3, D-05, D-06).

type Surface = 'plan' | 'scene';
type Furniture = { id: string; catalogItemId: string; xCm: number; zCm: number; rotationDeg: number };

interface Case {
  name: string;
  /** Предметы, уже стоящие в комнате: ставятся на план. */
  before: Array<{ id: string; xCm: number; zCm: number }>;
  drop: { id: string; xCm: number; zCm: number };
  valid: boolean;
  /** Часть сообщения о причине отказа. */
  reason?: string;
}

const CASES: Case[] = [
  { name: 'диван в середине комнаты', before: [], drop: { id: 'sofa_03', xCm: 210, zCm: 175 }, valid: true },
  { name: 'диван вплотную к стене', before: [], drop: { id: 'sofa_03', xCm: 140, zCm: 175 }, valid: true },
  { name: 'диван выходит за стену', before: [], drop: { id: 'sofa_03', xCm: 210, zCm: 5 }, valid: false, reason: 'за стену' },
  { name: 'диван поверх дивана', before: [{ id: 'sofa_03', xCm: 210, zCm: 175 }], drop: { id: 'sofa_03', xCm: 230, zCm: 175 }, valid: false, reason: 'Пересекается' },
  { name: 'стул задвинут под стол', before: [{ id: 'dining_table', xCm: 210, zCm: 175 }], drop: { id: 'dining_chair_02', xCm: 210, zCm: 100 }, valid: true },
  { name: 'стул спинкой под столешницей', before: [{ id: 'dining_table', xCm: 210, zCm: 175 }], drop: { id: 'dining_chair_02', xCm: 210, zCm: 140 }, valid: false, reason: 'Пересекается' },
  { name: 'стул в раме стола', before: [{ id: 'dining_table', xCm: 210, zCm: 175 }], drop: { id: 'dining_chair_02', xCm: 125, zCm: 175 }, valid: false, reason: 'Пересекается' },
  { name: 'телевизор на журнальном столе', before: [{ id: 'modern_coffee_table_02', xCm: 210, zCm: 175 }], drop: { id: 'television_02', xCm: 210, zCm: 175 }, valid: true },
  { name: 'телевизор на полу', before: [], drop: { id: 'television_02', xCm: 100, zCm: 100 }, valid: false },
];

const furniture = (page: Page) => page.evaluate(() => window.__planner!.furniture()) as Promise<Furniture[]>;
const clientPoint = (page: Page, surface: Surface, xCm: number, zCm: number) =>
  page.evaluate(([s, x, z]) => window.__planner!.toClient(s, x, z)!, [surface, xCm, zCm] as const);

async function dragFromCatalog(page: Page, catalogId: string, to: { x: number; y: number }) {
  const box = (await visibleBox(page.locator(`[data-catalog-id="${catalogId}"]`)))!;
  const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 5 });
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
}

async function run(page: Page, testCase: Case, surface: Surface) {
  await page.goto('/?tech=1');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForFunction(() => window.__planner?.camera != null && window.__planner.toClient('plan', 0, 0) != null);
  await page.getByLabel('Показать для всех комнат').check();

  for (const item of testCase.before) {
    await dragFromCatalog(page, item.id, await clientPoint(page, 'plan', item.xCm, item.zCm));
  }
  expect(await furniture(page)).toHaveLength(testCase.before.length);
  if (testCase.before.length > 0) {
    // Модели предыдущих предметов должны быть в сцене, иначе указатель попадёт в пустое место.
    await page.waitForFunction((n) => window.__planner!.sceneFurniture.length === n, testCase.before.length);
  }

  await dragFromCatalog(page, testCase.drop.id, await clientPoint(page, surface, testCase.drop.xCm, testCase.drop.zCm));
  const placed = (await furniture(page)).slice(testCase.before.length);
  const status = (await page.getByTestId('status').textContent()) ?? '';
  return { placed: placed.map(({ catalogItemId, xCm, zCm, rotationDeg }) => ({ catalogItemId, xCm, zCm, rotationDeg })), status };
}

for (const testCase of CASES) {
  test(`14.7 ${testCase.name}: план и 3D дают один результат`, async ({ page }) => {
    const onPlan = await run(page, testCase, 'plan');
    const onScene = await run(page, testCase, 'scene');

    expect(onScene.placed, 'результат в 3D совпадает с планом').toEqual(onPlan.placed);
    if (testCase.valid) {
      expect(onPlan.placed).toHaveLength(1);
      expect(onPlan.placed[0]).toMatchObject({ catalogItemId: testCase.drop.id, xCm: testCase.drop.xCm, zCm: testCase.drop.zCm });
    } else {
      expect(onPlan.placed).toHaveLength(0);
      expect(onPlan.status.length).toBeGreaterThan(0);
      expect(onScene.status).toBe(onPlan.status);
      if (testCase.reason) expect(onPlan.status).toContain(testCase.reason);
    }
  });
}
