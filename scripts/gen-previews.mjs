// Рисует превью каталога (public/previews/<id>.png) страницей /?preview=<id> в системном Chrome.
// Запуск: npm run previews   (dev-сервер поднимается сам, если ещё не запущен)
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const port = Number(process.env.E2E_PORT ?? 5173);
const base = `http://localhost:${port}`;
const out = 'public/previews';
mkdirSync(out, { recursive: true });

async function up() {
  try { return (await fetch(base)).ok; } catch { return false; }
}

let server;
if (!(await up())) {
  server = spawn('npm', ['run', 'dev', '--', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await up()); i += 1) await new Promise((r) => setTimeout(r, 1000));
}

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 0.5 });
let done = 0;
try {
  await page.goto(`${base}/?preview=list`);
  await page.waitForFunction(() => window.__previewItems);
  const items = await page.evaluate(() => window.__previewItems);
  for (const { id } of items) {
    await page.goto(`${base}/?preview=${id}`);
    await page.waitForFunction((want) => window.__previewReady === want, id, { timeout: 30_000 });
    await page.getByTestId('preview-frame').screenshot({ path: `${out}/${id}.png`, omitBackground: true });
    done += 1;
  }
  console.log(`Превью готовы: ${done} из ${items.length} в ${out}/`);
} finally {
  await browser.close();
  server?.kill();
}
