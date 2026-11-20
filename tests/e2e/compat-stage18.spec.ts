import { expect, test } from '@playwright/test';

// Этап 18.5 (AC-14): размеры окна и отсутствие WebGL. Браузеры Chrome и Edge — проекты Playwright (D-08).

const SIZES: Array<[number, number]> = [[1920, 1080], [1536, 864], [1366, 768], [1280, 720], [1024, 768]];

for (const [width, height] of SIZES) {
  test(`окно ${width}×${height}: нет горизонтальной прокрутки, 3D-вид и каталог доступны`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/?tech=1');
    await expect(page.locator('.view-scene canvas')).toBeVisible();
    await page.waitForFunction(() => window.__planner?.toClient('plan', 0, 0) != null);
    const scroll = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, window: innerWidth }));
    expect(scroll.page, 'нет горизонтальной прокрутки страницы').toBeLessThanOrEqual(scroll.window + 1);
    // Холст сначала имеет размер по умолчанию 300×150, пока наблюдатель размера не применит реальный; ждём его.
    await expect.poll(async () => (await page.locator('.view-scene canvas').boundingBox())?.width ?? 0,
      { message: '3D-вид не схлопнулся по ширине' }).toBeGreaterThan(300);
    await expect.poll(async () => (await page.locator('.view-scene canvas').boundingBox())?.height ?? 0,
      { message: '3D-вид не схлопнулся по высоте' }).toBeGreaterThan(200);
    await expect(page.locator('[data-catalog-id="sofa_03"]')).toHaveCount(1);
  });
}

test('без WebGL: понятное сообщение вместо 3D, план продолжает работать', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return (original as (t: string, ...r: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
  });
  await page.goto('/?tech=1');
  await expect(page.getByTestId('no-webgl')).toBeVisible();
  await expect(page.getByTestId('no-webgl')).toContainText('WebGL');
  await expect(page.locator('.view-scene canvas')).toHaveCount(0);
  await expect(page.locator('svg').first()).toBeVisible();
  await page.waitForFunction(() => window.__planner?.toClient('plan', 0, 0) != null);
});
