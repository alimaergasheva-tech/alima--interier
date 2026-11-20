// Снимок контактного листа обоев: node scripts/shot-wallpapers.mjs (нужен запущенный dev-сервер на :5173).
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
await page.goto('http://localhost:5173/?preview=wallpapers');
await page.waitForSelector('[data-testid=wallpaper-sheet]');
await page.screenshot({ path: 'docs/stage-16/08-wallpapers.png', fullPage: true });
await browser.close();
