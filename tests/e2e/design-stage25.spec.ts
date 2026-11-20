import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

// Задача 25: снимки экранов тёмной темы (мастер, схемы, настройка, интерьер, отделка, прогулка) в docs/stage-25.
// Размер окна 1440×900. Часть снимков — для визуальной проверки агентом, тест лишь проверяет, что экраны открываются.

test.use({ viewport: { width: 1440, height: 900 } });

test('снимки экранов приложения', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chrome');
  test.setTimeout(120_000);
  const out = process.env.DESIGN_DIR ?? 'docs/stage-25';
  mkdirSync(out, { recursive: true });
  const shot = (name: string) => page.screenshot({ path: `${out}/${name}.png` });

  await page.goto('/');
  await expect(page.getByRole('button', { name: '2 комнаты' })).toBeVisible();
  await shot('01-wizard-params');
  await page.getByRole('button', { name: '2 комнаты' }).click();
  await page.getByLabel('Примерная площадь квартиры').fill('57');
  await page.getByRole('button', { name: 'Показать схемы' }).click();
  await expect(page.locator('.template-card').first()).toBeVisible();
  await shot('02-wizard-templates');
  await page.locator('.template-card').filter({ hasText: '2А' }).click();
  await page.getByRole('button', { name: 'Перейти к настройке' }).click();
  await expect(page.locator('.setup-screen')).toBeVisible();
  await shot('03-setup');
  await page.getByRole('button', { name: 'Открыть интерьер' }).click();
  await page.waitForFunction(() => window.__planner?.sceneInfo != null && window.__planner.toClient('plan', 0, 0) != null);
  await page.waitForTimeout(800);
  await shot('04-interior-furniture');
  await page.getByRole('tab', { name: 'Отделка' }).click();
  await page.waitForTimeout(300);
  await shot('05-interior-finish');
  await page.getByRole('button', { name: 'Пол', exact: true }).click();
  await shot('06-interior-floor');
  await page.getByRole('button', { name: 'Ночь' }).click();
  await page.getByRole('switch', { name: 'Свет в комнате' }).click();
  await page.waitForTimeout(600);
  await shot('07-interior-night-light');
  await page.getByRole('button', { name: 'Прогулка', exact: true }).click();
  await page.waitForFunction(() => window.__planner!.walk != null);
  await page.waitForTimeout(600);
  await shot('08-walk');
});
