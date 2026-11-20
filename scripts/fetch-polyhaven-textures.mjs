// Скачивает диффузные карты 1k текстур Poly Haven (CC0) в public/textures/<id>_diff_1k.jpg.
// Запуск: node scripts/fetch-polyhaven-textures.mjs id1 id2 ...  → JSON с авторами и физическим размером (см) в stdout.
import { mkdirSync, writeFileSync } from 'node:fs';

const API = 'https://api.polyhaven.com';
mkdirSync('public/textures', { recursive: true });
const out = [];
for (const id of process.argv.slice(2)) {
  const files = await (await fetch(`${API}/files/${id}`)).json();
  const url = files.Diffuse?.['1k']?.jpg?.url;
  if (!url) { console.error(`НЕТ Diffuse 1k jpg: ${id}`); continue; }
  const info = await (await fetch(`${API}/info/${id}`)).json();
  const buffer = Buffer.from(await (await fetch(url)).arrayBuffer());
  writeFileSync(`public/textures/${id}_diff_1k.jpg`, buffer);
  out.push({ id, name: info.name, authors: Object.keys(info.authors ?? {}), kb: Math.round(buffer.length / 1024),
    widthCm: +(info.dimensions[0] / 10).toFixed(1), heightCm: +(info.dimensions[1] / 10).toFixed(1) });
  console.error(`ok ${id}`);
}
console.log(JSON.stringify(out, null, 1));
