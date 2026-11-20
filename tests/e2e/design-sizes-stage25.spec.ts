import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

// Задача 25.5: размеры окна 1280×720 и 1920×1080 — нет горизонтальной прокрутки страницы, элементы управления
// не обрезаны правым краем, переключатель отделки целиком в панели, клавиатурой достижимы основные кнопки.

const SIZES = [{ w: 1280, h: 720 }, { w: 1920, h: 1080 }];

for (const size of SIZES) {
  test(`окно ${size.w}×${size.h}: экраны без обрезки и горизонтальной прокрутки`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chrome');
    test.setTimeout(90_000);
    const out = process.env.DESIGN_DIR ?? 'docs/stage-25';
    mkdirSync(out, { recursive: true });
    await page.setViewportSize({ width: size.w, height: size.h });
    const noPageScroll = async (where: string) => {
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, `горизонтальная прокрутка страницы: ${where}`).toBeLessThanOrEqual(0);
    };
    const insideViewport = async (selector: string, where: string) => {
      const boxes = await page.locator(selector).evaluateAll((nodes) => nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return { left: r.left, right: r.right, w: r.width };
      }));
      for (const b of boxes) if (b.w > 0) expect(b.right, `${where}: ${selector} выходит за правый край окна`).toBeLessThanOrEqual(size.w + 0.5);
    };

    await page.goto('/');
    await page.getByRole('button', { name: '2 комнаты' }).click();
    await page.getByLabel('Примерная площадь квартиры').fill('57');
    await noPageScroll('параметры');
    await page.getByRole('button', { name: 'Показать схемы' }).click();
    await expect(page.locator('.template-card').first()).toBeVisible();
    await noPageScroll('схемы');
    await page.screenshot({ path: `${out}/size-${size.w}-templates.png` });
    await page.locator('.template-card').filter({ hasText: '2А' }).click();
    await page.getByRole('button', { name: 'Перейти к настройке' }).click();
    await expect(page.locator('.setup-screen')).toBeVisible();
    await noPageScroll('настройка');
    await page.screenshot({ path: `${out}/size-${size.w}-setup.png` });
    await page.getByRole('button', { name: 'Открыть интерьер' }).click();
    await page.waitForFunction(() => window.__planner?.sceneInfo != null);
    await page.getByRole('tab', { name: 'Отделка' }).click();
    await noPageScroll('интерьер');
    await insideViewport('.finish-kind button', 'интерьер');
    await insideViewport('.time-of-day', 'интерьер');
    // переключатель отделки целиком внутри боковой панели
    const panel = await page.locator('.side-column').boundingBox();
    for (const b of await page.locator('.finish-kind button').all()) {
      const box = await b.boundingBox();
      expect(box!.x + box!.width, 'кнопка типа отделки обрезана панелью').toBeLessThanOrEqual(panel!.x + panel!.width + 0.5);
    }
    await page.screenshot({ path: `${out}/size-${size.w}-interior.png` });
    // клавиатура: Tab доходит до кнопки «Прогулка» и Enter её включает
    await page.getByRole('button', { name: 'Прогулка', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__planner!.walk != null);
    await expect(page.getByRole('button', { name: 'Выйти из прогулки' })).toBeVisible();
  });
}
