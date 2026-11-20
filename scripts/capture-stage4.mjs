// Кадры и первые замеры технической сцены (задача 4.5).
// Запуск при работающем dev-сервере: node scripts/capture-stage4.mjs
// Браузер открывается в обычном (не headless) режиме, чтобы работала настоящая видеокарта.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const OUT = 'docs/stage-4';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('http://localhost:5173/');
await page.waitForFunction(() => window.__planner?.camera != null && window.__planner.toClient('plan', 0, 0) != null);

const toClient = (surface, x, z) => page.evaluate(([s, a, b]) => window.__planner.toClient(s, a, b), [surface, x, z]);
const card = async (id) => {
  const box = await page.locator(`[data-catalog-id="${id}"]`).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
async function drag(from, to, release = true) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 8 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
  if (release) await page.mouse.up();
}

const sceneReadyMs = await page.evaluate(() => window.__planner.sceneReadyMs);

// Появление модели: от отпускания мыши до загруженной модели в сцене.
async function place(id, x, z, turns = 0) {
  await drag(await card(id), await toClient('plan', x, z), false);
  for (let i = 0; i < turns; i++) await page.keyboard.press('KeyR');
  const started = Date.now();
  await page.mouse.up();
  await page.waitForFunction((key) => window.__planner.measured[key] != null, id);
  return Date.now() - started;
}

const appearMs = {
  sofa_03: await place('sofa_03', 210, 55),
  modern_coffee_table_01: await place('modern_coffee_table_01', 210, 175, 6),
  modern_arm_chair_01: await place('modern_arm_chair_01', 70, 250, 6),
};
await page.mouse.click(5, 300);
await page.waitForTimeout(1500);

const gpu = await page.evaluate(() => {
  const gl = document.querySelector('canvas').getContext('webgl2');
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'неизвестно';
});

async function measureFrames(seconds) {
  return page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const deltas = [];
        let last = performance.now();
        const start = last;
        const tick = (now) => {
          deltas.push(now - last);
          last = now;
          if (now - start < ms) requestAnimationFrame(tick);
          else {
            deltas.shift();
            const sorted = [...deltas].sort((a, b) => a - b);
            resolve({
              frames: deltas.length,
              fps: (deltas.length * 1000) / deltas.reduce((sum, d) => sum + d, 0),
              p95Ms: sorted[Math.floor(sorted.length * 0.95)],
              maxMs: sorted.at(-1),
            });
          }
        };
        requestAnimationFrame(tick);
      }),
    seconds * 1000,
  );
}

const idle = await measureFrames(5);
await page.screenshot({ path: `${OUT}/01-overview.png` });

// Замер при вращении камеры.
const canvas = await page.locator('canvas').boundingBox();
const orbiting = measureFrames(4);
await page.mouse.move(canvas.x + 80, canvas.y + 80);
await page.mouse.down();
for (let i = 0; i < 60; i++) await page.mouse.move(canvas.x + 80 + i * 3, canvas.y + 80 - i * 0.6, { steps: 1 });
await page.mouse.up();
const orbit = await orbiting;
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/02-second-angle.png` });
await page.locator('canvas').screenshot({ path: `${OUT}/03-scene-only.png` });

// Недопустимое положение: красное превью и причина.
console.log('до переноса', JSON.stringify(await page.evaluate(() => window.__planner.furniture())));
await drag(await toClient('plan', 70, 250), await toClient('plan', 20, 250), false);
await page.waitForTimeout(300);
console.log('кандидат', JSON.stringify(await page.evaluate(() => window.__planner.draft())));
await page.screenshot({ path: `${OUT}/04-invalid-placement.png` });
await page.keyboard.press('Escape');
await page.mouse.up();

const report = {
  date: new Date().toISOString(),
  userAgent: await page.evaluate(() => navigator.userAgent),
  gpu,
  viewport: '1920×1080',
  devicePixelRatio: await page.evaluate(() => window.devicePixelRatio),
  build: 'dev-сервер Vite (не production-сборка)',
  scene: 'комната 420 × 350 см, 3 предмета, один направленный источник с тенями 2048',
  sceneReadyMs: Math.round(sceneReadyMs),
  modelAppearMs: appearMs,
  idle,
  orbit,
};
writeFileSync(`${OUT}/measurements.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
