// Скачивает glTF 1k моделей Poly Haven (CC0) в public/models/<id>/ без изменений.
// Запуск: node scripts/fetch-polyhaven.mjs id1 id2 ...
// Также печатает JSON с авторами и размером файлов для реестра ASSETS.md.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const API = 'https://api.polyhaven.com';
const out = [];
for (const id of process.argv.slice(2)) {
  const dir = join('public', 'models', id);
  const files = await (await fetch(`${API}/files/${id}`)).json();
  const entry = files.gltf?.['1k']?.gltf;
  if (!entry) { console.error(`НЕТ glTF 1k: ${id}`); continue; }
  const info = await (await fetch(`${API}/info/${id}`)).json();
  let bytes = 0;
  const targets = [[`${id}.gltf`, entry.url, entry.size], ...Object.entries(entry.include ?? {}).map(([p, v]) => [p, v.url, v.size])];
  for (const [path, url] of targets) {
    const file = join(dir, path);
    if (existsSync(file)) { continue; }
    mkdirSync(dirname(file), { recursive: true });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(file, buffer);
    bytes += buffer.length;
  }
  out.push({ id, name: info.name, authors: Object.keys(info.authors ?? {}), mb: +(bytes / 1048576).toFixed(2), files: targets.length });
  console.error(`ok ${id} ${bytes}`);
}
console.log(JSON.stringify(out, null, 1));
