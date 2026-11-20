// Строит составные коллайдеры напольных предметов по геометрии glTF и записывает
// src/catalog/colliders.generated.ts (SPEC §11.2: упрощённые составные объёмы, §12: конвейер → коллайдеры).
// Запуск: node scripts/gen-colliders.mjs [--report docs/stage-13/colliders.json] [--points /tmp/points]
// Зависимостей нет: только встроенные модули Node.
//
// Алгоритм (для каждого предмета с установкой «на пол»):
//   1. Поверхность модели в системе предмета (см): центр основания в нуле, как в FurnitureModel.prepare().
//   2. Сетка 2 см по XZ и слои по 2 см по Y; занятые ячейки слоя склеиваются в компоненты
//      (ножки, сиденье, спинка), щели до 2 ячеек закрываются. П- и Г-образная часть (заполнение
//      габарита < 70 %) раскладывается на прямоугольники, чтобы не закрыть проём между тумбами.
//   3. Компоненты соседних слоёв со сходной площадью (IoU ≥ 0,75) образуют одну коробку; границы
//      коробки берутся по точкам поверхности, а не по ячейкам сетки.
//   4. Мелкие коробки вливаются в ближайшие, число коробок не больше MAX_BOXES.
//   5. Если коробки заполняют не менее 85 % габаритного объёма, предмет считается сплошным:
//      остаётся один коллайдер по габаритам.
// Настенные, потолочные и настольные предметы остаются с одним коллайдером.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const CELL = 2; // см, шаг сетки по XZ
const LAYER = 2; // см, толщина слоя по Y
const STEP = 1.5; // см, шаг дискретизации поверхности
const IOU_MERGE = 0.75;
const SOLID_FILL = 0.85;
const TINY_VOLUME = 0.01; // доля габаритного объёма
const MAX_BOXES = 8;
const MAX_RECTS_PER_LAYER = 12;
const FILL_CONVEX = 0.7; // заполнение габарита сечения, выше которого часть считается выпуклой

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const reportPath = option('--report');
const pointsDir = option('--points');
const verbose = args.includes('--verbose');

// Составные коллайдеры нужны там, где под предметом или рядом с ним есть полезный проём:
// стул или пуф задвигается под стол, под кроватью свободно. Остальная мебель — сплошная коробка.
const COMPOSITE_CATEGORIES = new Set(['Столы', 'Стулья', 'Кровати']);
const COMPOSITE_IDS = new Set(['painted_wooden_bench']);
// Исключения: геометрия не раскладывается надёжно. Рабочий стол с двумя тумбами и общей рамой остаётся
// сплошной коробкой, и стул задвинуть под него нельзя (консервативно, записано в отчёте этапа 13).
const SINGLE_IDS = new Set(['metal_office_desk']);

// ---------- матрицы (столбцовый порядок, как в glTF) ----------
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
    out[c * 4 + r] = sum;
  }
  return out;
}
function compose(t, q, s) {
  const [x, y, z, w] = q;
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * s[0], 2 * (xy + wz) * s[0], 2 * (xz - wy) * s[0], 0,
    2 * (xy - wz) * s[1], (1 - 2 * (xx + zz)) * s[1], 2 * (yz + wx) * s[1], 0,
    2 * (xz + wy) * s[2], 2 * (yz - wx) * s[2], (1 - 2 * (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
const localMatrix = (node) => node.matrix ?? compose(node.translation ?? [0, 0, 0], node.rotation ?? [0, 0, 0, 1], node.scale ?? [1, 1, 1]);
const apply = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
];

// ---------- чтение glTF ----------
const TYPE_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
function readAccessor(gltf, buffers, index) {
  const accessor = gltf.accessors[index];
  const view = gltf.bufferViews[accessor.bufferView];
  const buffer = buffers[view.buffer];
  const components = TYPE_SIZE[accessor.type];
  const sizes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const size = sizes[accessor.componentType];
  const stride = view.byteStride || components * size;
  const data = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const read = {
    5120: (o) => data.getInt8(o), 5121: (o) => data.getUint8(o), 5122: (o) => data.getInt16(o, true),
    5123: (o) => data.getUint16(o, true), 5125: (o) => data.getUint32(o, true), 5126: (o) => data.getFloat32(o, true),
  }[accessor.componentType];
  const out = new Array(accessor.count * components);
  for (let i = 0; i < accessor.count; i++)
    for (let c = 0; c < components; c++) out[i * components + c] = read(offset + i * stride + c * size);
  return out;
}

function loadModel(gltfPath) {
  const gltf = JSON.parse(readFileSync(gltfPath, 'utf8'));
  const dir = dirname(gltfPath);
  const buffers = gltf.buffers.map((b) => readFileSync(join(dir, decodeURIComponent(b.uri))));
  const primitives = []; // { positions(world, м), indices }
  const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const visit = (index, parent) => {
    const node = gltf.nodes[index];
    const world = multiply(parent, localMatrix(node));
    if (node.mesh !== undefined) {
      for (const p of gltf.meshes[node.mesh].primitives) {
        if (p.mode !== undefined && p.mode !== 4) continue;
        const a = gltf.accessors[p.attributes.POSITION];
        // габарит по min/max аксессора с углами — как Box3.setFromObject в сцене
        for (const cx of [a.min[0], a.max[0]]) for (const cy of [a.min[1], a.max[1]]) for (const cz of [a.min[2], a.max[2]]) {
          const q = apply(world, cx, cy, cz);
          for (let i = 0; i < 3; i++) { box.min[i] = Math.min(box.min[i], q[i]); box.max[i] = Math.max(box.max[i], q[i]); }
        }
        const raw = readAccessor(gltf, buffers, p.attributes.POSITION);
        const positions = new Float64Array(raw.length);
        for (let i = 0; i < raw.length; i += 3) {
          const q = apply(world, raw[i], raw[i + 1], raw[i + 2]);
          positions[i] = q[0]; positions[i + 1] = q[1]; positions[i + 2] = q[2];
        }
        const indices = p.indices !== undefined
          ? readAccessor(gltf, buffers, p.indices)
          : Array.from({ length: raw.length / 3 }, (_, i) => i);
        primitives.push({ positions, indices });
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  for (const root of gltf.scenes[gltf.scene ?? 0].nodes) visit(root, identity());
  return { primitives, box };
}

// ---------- дискретизация поверхности ----------
class PointBag {
  constructor() { this.data = new Float32Array(1 << 20); this.length = 0; }
  push(x, y, z) {
    if (this.length + 3 > this.data.length) { const next = new Float32Array(this.data.length * 2); next.set(this.data); this.data = next; }
    this.data[this.length++] = x; this.data[this.length++] = y; this.data[this.length++] = z;
  }
  get count() { return this.length / 3; }
}
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

/** Точки поверхности в системе предмета, см: ось X и Z — от центра габарита, Y — от основания. */
function sampleSurface(model) {
  const cx = (model.box.min[0] + model.box.max[0]) / 2;
  const cz = (model.box.min[2] + model.box.max[2]) / 2;
  const minY = model.box.min[1];
  const bag = new PointBag();
  for (const { positions, indices } of model.primitives) {
    const at = (i) => [(positions[i * 3] - cx) * 100, (positions[i * 3 + 1] - minY) * 100, (positions[i * 3 + 2] - cz) * 100];
    for (let t = 0; t + 2 < indices.length; t += 3) {
      const a = at(indices[t]), b = at(indices[t + 1]), c = at(indices[t + 2]);
      const edge = Math.max(dist(a, b), dist(b, c), dist(c, a));
      const n = Math.min(200, Math.max(1, Math.ceil(edge / STEP)));
      for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) {
        const u = i / n, v = j / n, w = 1 - u - v;
        bag.push(a[0] * w + b[0] * u + c[0] * v, a[1] * w + b[1] * u + c[1] * v, a[2] * w + b[2] * u + c[2] * v);
      }
    }
  }
  const size = model.box.max.map((value, i) => (value - model.box.min[i]) * 100);
  return { bag, size };
}

// ---------- коробки ----------
function iou(a, b) {
  const x = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1);
  const z = Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) + 1);
  const inter = x * z;
  const area = (r) => (r.x1 - r.x0 + 1) * (r.z1 - r.z0 + 1);
  return inter / (area(a) + area(b) - inter);
}

/** Наибольший прямоугольник из единиц в маске (метод гистограммы), ячейки включительно. */
function maxRect(mask, nx, nz) {
  const heights = new Int32Array(nx);
  let best = null;
  for (let z = 0; z < nz; z++) {
    for (let x = 0; x < nx; x++) heights[x] = mask[z * nx + x] ? heights[x] + 1 : 0;
    const stack = [];
    for (let x = 0; x <= nx; x++) {
      const cur = x === nx ? 0 : heights[x];
      let start = x;
      while (stack.length && stack[stack.length - 1].h >= cur) {
        const top = stack.pop();
        const area = top.h * (x - top.start);
        if (area > 0 && (!best || area > best.area)) best = { area, x0: top.start, x1: x - 1, z0: z - top.h + 1, z1: z };
        start = top.start;
      }
      stack.push({ h: cur, start });
    }
  }
  return best;
}

/** Закрытие маски на 1 ячейку: заполняет щели до двух ячеек между соседними частями. */
function closeMask(grid, nx, nz) {
  const grown = new Uint8Array(nx * nz);
  for (let z = 1; z < nz - 1; z++) for (let x = 1; x < nx - 1; x++) if (grid[z * nx + x])
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) grown[(z + dz) * nx + x + dx] = 1;
  const closed = new Uint8Array(nx * nz);
  for (let z = 1; z < nz - 1; z++) for (let x = 1; x < nx - 1; x++) {
    let all = 1;
    for (let dz = -1; dz <= 1 && all; dz++) for (let dx = -1; dx <= 1; dx++) if (!grown[(z + dz) * nx + x + dx]) { all = 0; break; }
    closed[z * nx + x] = all;
  }
  for (let i = 0; i < grid.length; i++) if (grid[i]) closed[i] = 1; // закрытие не должно терять исходные ячейки
  return closed;
}

/** Разложение сечения на прямоугольники: сначала самые крупные; остаток до 3 % присоединяется к ближайшему. */
function decompose(mask, nx, nz) {
  const work = Uint8Array.from(mask);
  let remaining = work.reduce((sum, v) => sum + v, 0);
  const total = remaining;
  const rects = [];
  while (remaining > 0.03 * total && rects.length < MAX_RECTS_PER_LAYER) {
    const rect = maxRect(work, nx, nz);
    if (!rect) break;
    rects.push(rect);
    for (let z = rect.z0; z <= rect.z1; z++) for (let x = rect.x0; x <= rect.x1; x++) work[z * nx + x] = 0;
    remaining -= rect.area;
  }
  const owner = new Int32Array(nx * nz).fill(-1);
  rects.forEach((r, id) => {
    for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) owner[z * nx + x] = id;
  });
  if (rects.length) {
    for (let i = 0; i < work.length; i++) {
      if (!work[i]) continue;
      const x = i % nx, z = (i - x) / nx;
      let best = 0, bestDistance = Infinity;
      rects.forEach((r, id) => {
        const d = Math.max(r.x0 - x, 0, x - r.x1, r.z0 - z, 0, z - r.z1);
        if (d < bestDistance) { bestDistance = d; best = id; }
      });
      owner[i] = best;
      const r = rects[best];
      r.gx0 = Math.min(r.gx0 ?? r.x0, x); r.gx1 = Math.max(r.gx1 ?? r.x1, x);
      r.gz0 = Math.min(r.gz0 ?? r.z0, z); r.gz1 = Math.max(r.gz1 ?? r.z1, z);
    }
  }
  return { rects, owner };
}

/** Связные части маски (8-связность): списки индексов ячеек. */
function labelComponents(mask, nx, nz) {
  const seen = new Uint8Array(nx * nz);
  const comps = [];
  for (let start = 0; start < nx * nz; start++) {
    if (!mask[start] || seen[start]) continue;
    const cells = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const cur = stack.pop();
      cells.push(cur);
      const cx = cur % nx, cz = (cur - cx) / nx;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= nx || z >= nz) continue;
        const next = z * nx + x;
        if (mask[next] && !seen[next]) { seen[next] = 1; stack.push(next); }
      }
    }
    comps.push(cells);
  }
  return comps;
}

/**
 * Прямоугольники сечения слоя. Выпуклая часть (заполнение габарита не меньше FILL_CONVEX) — один
 * прямоугольник; П- и Г-образная часть раскладывается на несколько, чтобы не закрыть проём
 * (пространство для ног между тумбами стола).
 */
function layerRects(mask, nx, nz) {
  const rects = [];
  const owner = new Int32Array(nx * nz).fill(-1);
  for (const cells of labelComponents(mask, nx, nz)) {
    let x0 = nx, x1 = -1, z0 = nz, z1 = -1;
    for (const c of cells) {
      const x = c % nx, z = (c - x) / nx;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    const area = (x1 - x0 + 1) * (z1 - z0 + 1);
    if (cells.length / area >= FILL_CONVEX) {
      const id = rects.length;
      rects.push({ x0, x1, z0, z1 });
      for (const c of cells) owner[c] = id;
      continue;
    }
    const part = new Uint8Array(nx * nz);
    for (const c of cells) part[c] = 1;
    const split = decompose(part, nx, nz);
    const base = rects.length;
    rects.push(...split.rects);
    for (const c of cells) owner[c] = split.owner[c] + base;
  }
  return { rects, owner };
}

function buildBoxes(bag, size) {
  const [W, H, D] = size; // X, Y, Z
  const nx = Math.ceil(W / CELL) + 3, nz = Math.ceil(D / CELL) + 3, ny = Math.ceil(H / LAYER) + 1;
  const cellX = (x) => Math.min(nx - 2, Math.max(1, Math.floor((x + W / 2) / CELL) + 1));
  const cellZ = (z) => Math.min(nz - 2, Math.max(1, Math.floor((z + D / 2) / CELL) + 1));
  const layerOf = (y) => Math.min(ny - 1, Math.max(0, Math.floor(y / LAYER)));

  const occupied = Array.from({ length: ny }, () => new Uint8Array(nx * nz));
  for (let i = 0; i < bag.length; i += 3)
    occupied[layerOf(bag.data[i + 1])][cellZ(bag.data[i + 2]) * nx + cellX(bag.data[i])] = 1;

  const boxes = [];
  const cellBox = []; // [слой] → Int32Array: ячейка → номер коробки
  let open = [];
  for (let l = 0; l < ny; l++) {
    const mask = closeMask(occupied[l], nx, nz);
    const { rects, owner } = layerRects(mask, nx, nz);
    const toBox = new Array(rects.length);
    const nextOpen = [];
    rects.forEach((rect, id) => {
      const bounds = {
        x0: Math.min(rect.x0, rect.gx0 ?? rect.x0), x1: Math.max(rect.x1, rect.gx1 ?? rect.x1),
        z0: Math.min(rect.z0, rect.gz0 ?? rect.z0), z1: Math.max(rect.z1, rect.gz1 ?? rect.z1),
      };
      let best = null, bestIou = IOU_MERGE;
      for (const box of open) {
        if (nextOpen.includes(box)) continue; // одна коробка — один прямоугольник слоя
        const value = iou(bounds, box.lastCells);
        if (value >= bestIou) { best = box; bestIou = value; }
      }
      if (best) {
        best.lastCells = bounds;
        toBox[id] = best.index;
        nextOpen.push(best);
      } else {
        const box = { index: boxes.length, lastCells: bounds };
        boxes.push(box);
        toBox[id] = box.index;
        nextOpen.push(box);
      }
    });
    const map = new Int32Array(nx * nz).fill(-1);
    for (let i = 0; i < map.length; i++) if (owner[i] >= 0) map[i] = toBox[owner[i]];
    cellBox.push(map);
    open = nextOpen;
  }

  // точные границы по точкам поверхности
  const ext = boxes.map(() => ({ x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity }));
  for (let i = 0; i < bag.length; i += 3) {
    const x = bag.data[i], y = bag.data[i + 1], z = bag.data[i + 2];
    const b = cellBox[layerOf(y)][cellZ(z) * nx + cellX(x)];
    if (b < 0) continue;
    const e = ext[b];
    e.x0 = Math.min(e.x0, x); e.x1 = Math.max(e.x1, x); e.y0 = Math.min(e.y0, y); e.y1 = Math.max(e.y1, y);
    e.z0 = Math.min(e.z0, z); e.z1 = Math.max(e.z1, z);
  }
  return ext.filter((e) => e.x1 >= e.x0);
}

const volume = (e) => (e.x1 - e.x0) * (e.y1 - e.y0) * (e.z1 - e.z0);
const union = (a, b) => ({
  x0: Math.min(a.x0, b.x0), x1: Math.max(a.x1, b.x1), y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1),
  z0: Math.min(a.z0, b.z0), z1: Math.max(a.z1, b.z1),
});
/** Прирост объёма при слиянии: чем меньше, тем «естественнее» пара. */
const mergeCost = (a, b) => volume(union(a, b)) - volume(a) - volume(b);

function simplify(boxes, bboxVolume) {
  let list = boxes.map((b) => ({ ...b }));
  const merge = (i, j) => { const u = union(list[i], list[j]); list = list.filter((_, k) => k !== i && k !== j); list.push(u); };
  const cheapest = (candidates) => {
    let best = null;
    for (const i of candidates) for (let j = 0; j < list.length; j++) {
      if (i === j) continue;
      const cost = mergeCost(list[i], list[j]);
      if (!best || cost < best.cost) best = { i, j, cost };
    }
    return best;
  };
  // 1. мелочь вливается в ближайшие
  for (;;) {
    const tiny = list.map((b, i) => (volume(b) < TINY_VOLUME * bboxVolume ? i : -1)).filter((i) => i >= 0);
    if (!tiny.length || list.length < 2) break;
    const pair = cheapest(tiny);
    if (!pair) break;
    merge(pair.i, pair.j);
  }
  // 2. не больше MAX_BOXES: сливается пара с наименьшим приростом объёма
  while (list.length > MAX_BOXES) {
    const pair = cheapest(list.map((_, i) => i));
    merge(pair.i, pair.j);
  }
  return list;
}

// ---------- каталог: id, файл, установка ----------
function readCatalogEntries() {
  const entries = [];
  for (const file of ['src/catalog/techCatalog.ts', 'src/catalog/furnitureItems.ts']) {
    const text = readFileSync(join(ROOT, file), 'utf8');
    for (const m of text.matchAll(/id: '([^']+)',[\s\S]*?category: '([^']+)',[\s\S]*?url: '([^']+)',[\s\S]*?mount: '([^']+)'/g)) {
      entries.push({ id: m[1], category: m[2], url: m[3], mount: m[4] });
    }
  }
  return entries;
}

const r1 = (v) => Math.round(v * 10) / 10;
const generated = {};
const report = [];
for (const entry of readCatalogEntries()) {
  const path = join(ROOT, 'public', entry.url);
  if (!existsSync(path)) { report.push({ id: entry.id, error: 'нет файла модели' }); continue; }
  const model = loadModel(path);
  const { bag, size } = sampleSurface(model);
  const bboxVolume = size[0] * size[1] * size[2];
  const row = { id: entry.id, mount: entry.mount, sizeCm: size.map(r1), points: bag.count };
  if (entry.mount !== 'floor') { row.result = 'single (не напольный)'; row.boxes = 1; report.push(row); continue; }
  if (SINGLE_IDS.has(entry.id) || (!COMPOSITE_CATEGORIES.has(entry.category) && !COMPOSITE_IDS.has(entry.id))) {
    row.result = 'single (категория без проёмов)'; row.boxes = 1; report.push(row); continue;
  }

  const raw = buildBoxes(bag, size);
  const boxes = simplify(raw, bboxVolume);
  const fill = boxes.reduce((sum, b) => sum + volume(b), 0) / bboxVolume;
  row.rawBoxes = raw.length; row.fill = Math.round(fill * 100) / 100;
  if (verbose) {
    console.log(entry.id, 'сырые коробки:');
    for (const b of raw) console.log(`   x ${r1(b.x0)}..${r1(b.x1)}  z ${r1(b.z0)}..${r1(b.z1)}  y ${r1(b.y0)}..${r1(b.y1)}`);
  }
  if (boxes.length <= 1 || fill >= SOLID_FILL) {
    row.result = 'single (сплошной)'; row.boxes = 1;
  } else {
    row.result = 'composite'; row.boxes = boxes.length;
    generated[entry.id] = boxes
      .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0 || a.z0 - b.z0)
      .map((b) => ({
        xCm: r1((b.x0 + b.x1) / 2), zCm: r1((b.z0 + b.z1) / 2),
        widthCm: r1(b.x1 - b.x0), depthCm: r1(b.z1 - b.z0), yMinCm: r1(b.y0), yMaxCm: r1(b.y1),
      }));
    const total = boxes.reduce((acc, b) => union(acc, b), boxes[0]);
    row.boundsOffsetCm = r1(Math.max(Math.abs(total.x1 - total.x0 - size[0]), Math.abs(total.y1 - total.y0 - size[1]), Math.abs(total.z1 - total.z0 - size[2])));
  }
  if (pointsDir) {
    mkdirSync(pointsDir, { recursive: true });
    const stride = Math.max(1, Math.floor(bag.count / 40000));
    const sample = [];
    for (let i = 0; i < bag.count; i += stride) sample.push(r1(bag.data[i * 3]), r1(bag.data[i * 3 + 1]), r1(bag.data[i * 3 + 2]));
    writeFileSync(join(pointsDir, `${entry.id}.json`), JSON.stringify({ size: size.map(r1), points: sample, boxes: generated[entry.id] ?? null }));
  }
  report.push(row);
}

const lines = [
  '// ЭТОТ ФАЙЛ СОЗДАН scripts/gen-colliders.mjs по геометрии моделей; правьте скрипт, а не файл.',
  '// Составные коллайдеры напольных предметов с проёмами (ножки, сиденье, спинка). Остальные предметы',
  '// остаются с одним коллайдером по габаритам (см. src/catalog/polyHaven.ts).',
  "import type { ColliderBox } from '../domain/types';",
  '',
  'export const generatedColliders: Record<string, ColliderBox[]> = {',
];
for (const [id, boxes] of Object.entries(generated)) {
  lines.push(`  ${/^[A-Za-z_]\w*$/.test(id) ? id : `'${id}'`}: [`);
  for (const b of boxes)
    lines.push(`    { xCm: ${b.xCm}, zCm: ${b.zCm}, widthCm: ${b.widthCm}, depthCm: ${b.depthCm}, yMinCm: ${b.yMinCm}, yMaxCm: ${b.yMaxCm} },`);
  lines.push('  ],');
}
lines.push('};', '');
writeFileSync(join(ROOT, 'src/catalog/colliders.generated.ts'), lines.join('\n'));
if (reportPath) {
  mkdirSync(dirname(join(ROOT, reportPath)), { recursive: true });
  writeFileSync(join(ROOT, reportPath), JSON.stringify(report, null, 2) + '\n');
}
for (const row of report) console.log(`${row.id.padEnd(28)} ${String(row.result ?? row.error).padEnd(24)} коробок: ${row.boxes ?? '-'}${row.fill !== undefined ? `  заполнение ${row.fill}` : ''}`);
