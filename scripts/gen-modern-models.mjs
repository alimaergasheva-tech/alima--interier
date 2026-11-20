// Генерирует собственные современные модели мебели (glTF 2.0, без текстур) вместо старинных моделей Poly Haven.
// Запуск: node scripts/gen-modern-models.mjs   (зависимостей нет, только встроенные модули Node).
// Результат: public/models/<id>/<id>.gltf + <id>.bin и docs/stage-16/modern-models.json с итоговыми габаритами, см.
// Система координат модели: Y вверх, основание на y = 0, центр по XZ в нуле, лицевая сторона — +Z (как у моделей Poly Haven).
// После запуска: node scripts/gen-colliders.mjs, затем npm run previews (превью берутся из браузера).
import { mkdirSync, writeFileSync } from 'node:fs';

// Материалы: [цвет, шероховатость, металличность].
const M = {
  oat: ['#c4bba9', 0.95, 0], sand: ['#c9bda8', 0.95, 0], sage: ['#82907e', 0.9, 0], grey: ['#8c8f90', 0.92, 0],
  graphite: ['#3b3e43', 0.8, 0], terracotta: ['#b9755b', 0.9, 0], navy: ['#2f4258', 0.92, 0], blush: ['#d9b8ac', 0.92, 0],
  oak: ['#b98c55', 0.6, 0], walnut: ['#6e4c35', 0.55, 0], white: ['#e3e1db', 0.55, 0], matteBlack: ['#1f2024', 0.6, 0.3],
  steel: ['#b9bdc2', 0.35, 0.8], brass: ['#c7a45a', 0.35, 0.85], glass: ['#0e1013', 0.12, 0], mirror: ['#cfe0ea', 0.12, 0],
  warm: ['#fff1cf', 0.4, 0],
  porcelain: ['#f2f2ef', 0.22, 0], bathInner: ['#dde2e5', 0.18, 0], inox: ['#c9ccd0', 0.3, 0.9],
};

class Model {
  constructor() { this.prims = new Map(); }
  prim(mat) {
    if (!M[mat]) throw new Error(`Нет материала ${mat}`);
    if (!this.prims.has(mat)) this.prims.set(mat, { pos: [], nor: [], idx: [] });
    return this.prims.get(mat);
  }
  /** Скруглённая коробка: основание на y0, центр по (x, z), размеры w × h × d, радиус скругления r, м. */
  box(mat, x, y0, z, w, h, d, r = 0) {
    const p = this.prim(mat);
    const half = [w / 2, h / 2, d / 2];
    const rad = Math.min(r, Math.min(...half) - 0.0005);
    const inner = half.map((v) => v - Math.max(rad, 0));
    const axisValues = (i) => {
      if (rad <= 0) return [-half[i], half[i]];
      const vals = [];
      for (const f of [1, 0.6, 0.25, 0]) vals.push(-inner[i] - f * rad);
      for (const f of [0, 0.25, 0.6, 1]) vals.push(inner[i] + f * rad);
      return [...new Set(vals.map((v) => +v.toFixed(6)))];
    };
    const cy = y0 + h / 2;
    for (let axis = 0; axis < 3; axis++) {
      for (const sign of [-1, 1]) {
        const [a, b] = [0, 1, 2].filter((i) => i !== axis);
        const va = axisValues(a), vb = axisValues(b);
        const base = p.pos.length / 3;
        for (const ua of va) for (const ub of vb) {
          const p0 = [0, 0, 0]; p0[axis] = sign * half[axis]; p0[a] = ua; p0[b] = ub;
          const c = p0.map((v, i) => Math.max(-inner[i], Math.min(inner[i], v)));
          const dir = p0.map((v, i) => v - c[i]);
          const len = Math.hypot(...dir);
          let n, q;
          if (rad > 0 && len > 1e-9) { n = dir.map((v) => v / len); q = c.map((v, i) => v + n[i] * rad); }
          else { n = [0, 0, 0]; n[axis] = sign; q = p0; }
          p.pos.push(q[0] + x, q[1] + cy, q[2] + z); p.nor.push(...n);
        }
        for (let i = 0; i < va.length - 1; i++) for (let j = 0; j < vb.length - 1; j++) {
          const i0 = base + i * vb.length + j, i1 = i0 + 1, i2 = i0 + vb.length, i3 = i2 + 1;
          this.tri(p, i0, i1, i2); this.tri(p, i1, i3, i2);
        }
      }
    }
  }
  /** Ориентирует треугольник по нормали вершины. */
  tri(p, a, b, c) {
    const P = (i) => p.pos.slice(i * 3, i * 3 + 3);
    const A = P(a), B = P(b), C = P(c);
    const u = B.map((v, i) => v - A[i]), v = C.map((w, i) => w - A[i]);
    const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const n = p.nor.slice(a * 3, a * 3 + 3);
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] >= 0) p.idx.push(a, b, c); else p.idx.push(a, c, b);
  }
  /** Вертикальный цилиндр или усечённый конус: основание на y0, высота h, радиус снизу rx (по Z — rz), сверху rTop. */
  cyl(mat, x, y0, z, rx, h, rz = rx, rTop = null, seg = 40) {
    const p = this.prim(mat);
    const k = rTop === null ? 1 : rTop / rx;
    const slope = (rx - rx * k) / h;
    const base = p.pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const t = (i / seg) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
      const nl = Math.hypot(1, slope);
      const n = [c / nl, slope / nl, s / nl];
      p.pos.push(x + c * rx, y0, z + s * rz); p.nor.push(...n);
      p.pos.push(x + c * rx * k, y0 + h, z + s * rz * k); p.nor.push(...n);
    }
    for (let i = 0; i < seg; i++) {
      const i0 = base + i * 2;
      this.tri(p, i0, i0 + 2, i0 + 1); this.tri(p, i0 + 1, i0 + 2, i0 + 3);
    }
    for (const [yy, ny, kk] of [[y0, -1, 1], [y0 + h, 1, k]]) {
      const c0 = p.pos.length / 3;
      p.pos.push(x, yy, z); p.nor.push(0, ny, 0);
      for (let i = 0; i <= seg; i++) {
        const t = (i / seg) * Math.PI * 2;
        p.pos.push(x + Math.cos(t) * rx * kk, yy, z + Math.sin(t) * rz * kk); p.nor.push(0, ny, 0);
      }
      for (let i = 0; i < seg; i++) this.tri(p, c0, c0 + 1 + i, c0 + 2 + i);
    }
  }
  /** Эллипсоид с центром (x, y, z) и полуосями rx, ry, rz. */
  sphere(mat, x, y, z, rx, ry = rx, rz = rx, seg = 28) {
    const p = this.prim(mat);
    const base = p.pos.length / 3;
    const rings = seg / 2;
    for (let i = 0; i <= rings; i++) {
      const th = (i / rings) * Math.PI;
      for (let j = 0; j <= seg; j++) {
        const ph = (j / seg) * Math.PI * 2;
        const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
        p.pos.push(x + n[0] * rx, y + n[1] * ry, z + n[2] * rz); p.nor.push(...n);
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
      const a = base + i * (seg + 1) + j, b = a + seg + 1;
      this.tri(p, a, b, a + 1); this.tri(p, a + 1, b, b + 1);
    }
  }
  /** Приводит габариты к точным: центр по XZ в нуле, низ в нуле. */
  fit(w, h, d) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const { pos } of this.prims.values()) for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], pos[i + k]); hi[k] = Math.max(hi[k], pos[i + k]);
    }
    const target = [w, h, d];
    for (const { pos } of this.prims.values()) for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) {
      const s = target[k] / (hi[k] - lo[k]);
      pos[i + k] = k === 1 ? (pos[i + k] - lo[k]) * s : (pos[i + k] - (lo[k] + hi[k]) / 2) * s;
    }
  }
  gltf(name, binName) {
    const chunks = []; let offset = 0;
    const views = [], accessors = [], primitives = [], materials = [];
    const push = (buffer, target) => {
      const pad = (4 - (offset % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
      views.push({ buffer: 0, byteOffset: offset, byteLength: buffer.length, target });
      chunks.push(buffer); offset += buffer.length; return views.length - 1;
    };
    for (const [matName, { pos, nor, idx }] of this.prims) {
      const [color, rough, metal] = M[matName];
      materials.push({ name: matName, pbrMetallicRoughness: { baseColorFactor: [...hexToLinear(color), 1], roughnessFactor: rough, metallicFactor: metal } });
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pos[i + k]); hi[k] = Math.max(hi[k], pos[i + k]); }
      const f32 = (arr) => Buffer.from(new Float32Array(arr).buffer);
      accessors.push({ bufferView: push(f32(pos), 34962), componentType: 5126, count: pos.length / 3, type: 'VEC3', min: lo, max: hi });
      accessors.push({ bufferView: push(f32(nor), 34962), componentType: 5126, count: nor.length / 3, type: 'VEC3' });
      accessors.push({ bufferView: push(Buffer.from(new Uint32Array(idx).buffer), 34963), componentType: 5125, count: idx.length, type: 'SCALAR' });
      primitives.push({ attributes: { POSITION: accessors.length - 3, NORMAL: accessors.length - 2 }, indices: accessors.length - 1, material: materials.length - 1 });
    }
    return {
      bin: Buffer.concat(chunks),
      json: {
        asset: { version: '2.0', generator: 'scripts/gen-modern-models.mjs' },
        scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name, mesh: 0 }], meshes: [{ name, primitives }],
        materials, accessors, bufferViews: views, buffers: [{ uri: binName, byteLength: offset }],
      },
    };
  }
}

function hexToLinear(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return +(c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).toFixed(4); });
}

// Предметы в метрах: w — ширина по X, d — глубина по Z, h — высота.
const legs4 = (m, mat, w, d, inset, h, r, y0 = 0) => {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.cyl(mat, sx * (w / 2 - inset), y0, sz * (d / 2 - inset), r, h);
};

/** Диван: цоколь на ножках, подушки сиденья, спинка, подлокотники. */
function sofa(m, w, d, h, { fabric = 'oat', arm = 0.16, seats = 3, legMat = 'matteBlack', pillow = 'sage', back = 0.22 } = {}) {
  const legH = 0.12, seatTop = 0.44;
  legs4(m, legMat, w, d, 0.07, legH, 0.025);
  m.box(fabric, 0, legH, 0, w, seatTop - legH - 0.12, d, 0.03);
  const iw = w - arm * 2, cw = iw / seats;
  for (let i = 0; i < seats; i++) m.box(fabric, -iw / 2 + cw * (i + 0.5), seatTop - 0.12, d * 0.07, cw - 0.01, 0.12, d - back - 0.04, 0.045);
  for (let i = 0; i < seats; i++) m.box(fabric, -iw / 2 + cw * (i + 0.5), seatTop, -d / 2 + back / 2 + 0.05, cw - 0.01, h - seatTop - 0.04, back, 0.08);
  for (const s of [-1, 1]) m.box(fabric, s * (w / 2 - arm / 2), legH, 0, arm, seatTop + 0.16 - legH, d, 0.06);
  if (pillow) {
    m.box(pillow, -iw / 2 + 0.2, seatTop + 0.02, -d / 2 + back + 0.1, 0.42, 0.4, 0.13, 0.05);
    m.box('terracotta', iw / 2 - 0.2, seatTop + 0.02, -d / 2 + back + 0.1, 0.4, 0.38, 0.13, 0.05);
  }
}

/** Стул: дубовое сиденье с мягкой накладкой, чёрные ножки, низкая спинка. */
function chair(m, w, d, h, { seat = 'oak', frame = 'matteBlack', pad = 'sage' } = {}) {
  const seatH = 0.46;
  legs4(m, frame, w, d * 0.8, 0.03, seatH - 0.04, 0.014);
  m.box(frame, 0, seatH - 0.05, 0, w - 0.04, 0.03, d * 0.8 - 0.04, 0.008);
  m.box(seat, 0, seatH - 0.03, d * 0.04, w, 0.035, d * 0.8, 0.012);
  m.box(pad, 0, seatH, d * 0.04, w - 0.06, 0.04, d * 0.8 - 0.06, 0.02);
  for (const s of [-1, 1]) m.box(frame, s * (w / 2 - 0.03), seatH, -d * 0.36, 0.022, h - seatH, 0.022, 0.008);
  m.box(seat, 0, h - 0.24, -d * 0.4, w - 0.02, 0.2, 0.03, 0.012);
}

const BUILD = {
  sofa_03: (m, w, d) => sofa(m, w, d, 0.84, { fabric: 'oat', arm: 0.2, seats: 3 }),
  sofa_02: (m, w, d) => sofa(m, w, d, 0.78, { fabric: 'sage', arm: 0.12, seats: 2, legMat: 'walnut', pillow: 'oat' }),
  Sofa_01: (m, w, d) => sofa(m, w, d, 0.78, { fabric: 'grey', arm: 0.1, seats: 2, legMat: 'walnut', pillow: 'blush', back: 0.16 }),

  vintage_day_bed: (m, w, d) => {
    legs4(m, 'matteBlack', w, d, 0.06, 0.08, 0.02);
    m.box('walnut', 0, 0.08, 0, w, 0.08, d, 0.02);
    m.box('oat', 0, 0.16, 0.02, w - 0.04, 0.2, d - 0.06, 0.05);
    m.box('oat', 0, 0.16, -d / 2 + 0.07, w - 0.04, 0.5, 0.14, 0.06);
    m.box('sage', w / 2 - 0.2, 0.36, -d / 2 + 0.24, 0.4, 0.34, 0.12, 0.05);
    m.box('terracotta', w / 2 - 0.62, 0.36, -d / 2 + 0.22, 0.4, 0.34, 0.12, 0.05);
  },

  old_bed_frame: (m, w, d) => {
    legs4(m, 'matteBlack', w, d, 0.05, 0.12, 0.02);
    m.box('oak', 0, 0.12, 0, w, 0.2, d - 0.06, 0.02);
    m.box('white', 0, 0.32, 0.04, w - 0.06, 0.22, d - 0.2, 0.06);
    m.box('oat', 0, 0.28, -d / 2 + 0.03, w, 0.72, 0.07, 0.03);
    m.box('white', 0, 0.54, -d / 2 + 0.28, w * 0.62, 0.12, 0.34, 0.05);
    m.box('sage', 0, 0.32, d * 0.18, w - 0.04, 0.24, d * 0.42, 0.05);
  },

  Ottoman_01: (m, w, d) => {
    legs4(m, 'walnut', w, d, 0.06, 0.08, 0.02);
    m.box('terracotta', 0, 0.08, 0, w, 0.34, d, 0.1);
  },

  modern_coffee_table_02: (m, w, d) => {
    m.box('oak', 0, 0.34, 0, w, 0.04, d, 0.015);
    m.box('oak', 0, 0.14, 0, w - 0.3, 0.03, d - 0.3, 0.01);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.box('matteBlack', sx * (w / 2 - 0.05), 0, sz * (d / 2 - 0.05), 0.04, 0.34, 0.04, 0.008);
  },

  dining_table: (m, w, d) => {
    m.box('oak', 0, 0.71, 0, w, 0.04, d, 0.015);
    for (const s of [-1, 1]) {
      m.box('matteBlack', s * (w / 2 - 0.28), 0, 0, 0.06, 0.71, d - 0.45, 0.01);
      m.box('matteBlack', s * (w / 2 - 0.28), 0, 0, 0.06, 0.03, d - 0.2, 0.01);
    }
    m.box('matteBlack', 0, 0.62, 0, w - 0.55, 0.05, 0.05, 0.008);
  },

  round_wooden_table_01: (m, w, d) => {
    m.cyl('white', 0, 0.71, 0, w / 2, 0.04, d / 2);
    m.cyl('oak', 0, 0.04, 0, 0.1, 0.67, 0.1, 0.07);
    m.cyl('oak', 0, 0, 0, 0.3, 0.04, 0.3);
  },

  metal_office_desk: (m, w, d) => {
    m.box('oak', 0, 0.72, 0, w, 0.03, d, 0.01);
    for (const sz of [-1, 1]) m.box('matteBlack', -w / 2 + 0.06, 0, sz * (d / 2 - 0.06), 0.04, 0.72, 0.04, 0.008);
    m.box('matteBlack', -w / 2 + 0.06, 0.6, 0, 0.03, 0.04, d - 0.12);
    m.box('white', w / 2 - 0.25, 0.06, 0, 0.42, 0.66, d - 0.1, 0.012);
    for (let i = 0; i < 3; i++) m.box('brass', w / 2 - 0.25, 0.14 + i * 0.2, d / 2 - 0.045, 0.14, 0.015, 0.012);
    m.box('matteBlack', w / 2 - 0.25, 0, 0, 0.42, 0.06, d - 0.1);
  },

  dining_chair_02: (m, w, d, h) => chair(m, w, d, h, { seat: 'oak', frame: 'matteBlack', pad: 'sage' }),

  bar_chair_round_01: (m, w, d) => {
    legs4(m, 'matteBlack', w - 0.04, d - 0.04, 0.0, 0.67, 0.014);
    m.cyl('matteBlack', 0, 0.25, 0, w / 2 - 0.05, 0.02, d / 2 - 0.05);
    m.cyl('oak', 0, 0.67, 0, w / 2, 0.04, d / 2);
    m.cyl('sage', 0, 0.71, 0, w / 2 - 0.02, 0.04, d / 2 - 0.02);
  },

  wooden_stool_01: (m, w, d, h) => {
    m.cyl('oak', 0, h - 0.04, 0, w / 2, 0.04, d / 2);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      m.cyl('matteBlack', Math.cos(a) * (w / 2 - 0.09), 0, Math.sin(a) * (d / 2 - 0.09), 0.02, h - 0.04, 0.02, 0.014);
    }
  },

  painted_wooden_cabinet: (m, w, d, h) => {
    legs4(m, 'matteBlack', w, d, 0.05, 0.12, 0.02);
    m.box('sage', 0, 0.12, 0, w, h - 0.12 - 0.03, d, 0.01);
    m.box('oak', 0, h - 0.03, 0, w + 0.02, 0.03, d + 0.02, 0.01);
    m.box('matteBlack', 0, 0.2, d / 2 + 0.002, 0.004, h - 0.38, 0.003);
    for (const s of [-1, 1]) m.box('brass', s * 0.045, h * 0.5, d / 2 + 0.01, 0.012, 0.16, 0.014, 0.004);
  },

  painted_wooden_nightstand: (m, w, d, h) => {
    legs4(m, 'matteBlack', w, d, 0.04, 0.16, 0.014);
    m.box('oak', 0, 0.16, 0, w, h - 0.16, d, 0.02);
    m.box('oat', 0, h - 0.26, d / 2 + 0.001, w - 0.06, 0.2, 0.004, 0.002);
    m.box('brass', 0, h - 0.16, d / 2 + 0.012, 0.14, 0.014, 0.016, 0.004);
    m.box('oat', 0, 0.2, d / 2 + 0.001, w - 0.06, 0.12, 0.004, 0.002);
  },

  wooden_bookshelf_worn: (m, w, d, h) => {
    const t = 0.03;
    for (const s of [-1, 1]) m.box('matteBlack', s * (w / 2 - t / 2), 0, 0, t, h, d, 0.006);
    m.box('matteBlack', 0, 0, -d / 2 + 0.01, w - 2 * t, h, 0.012);
    const shelves = 6;
    for (let i = 0; i <= shelves; i++) m.box('oak', 0, 0.05 + (i * (h - 0.09)) / shelves, 0, w - 2 * t, t, d - 0.02, 0.006);
    m.box('matteBlack', w * 0.12, 0.05, 0, t, h - 0.05, d - 0.04);
    const books = ['terracotta', 'navy', 'white', 'sage', 'graphite'];
    for (let s = 1; s < shelves; s += 2) for (let b = 0; b < 5; b++) {
      const bh = 0.2 + ((b * 7 + s * 3) % 5) * 0.015;
      m.box(books[(b + s) % 5], -w / 2 + 0.12 + b * 0.05 + (s % 4) * 0.02, 0.05 + (s * (h - 0.09)) / shelves + t, 0, 0.04, bh, d * 0.62, 0.004);
    }
  },

  painted_wooden_bench: (m, w, d, h) => {
    legs4(m, 'oak', w, d, 0.04, h - 0.1, 0.022);
    m.box('oat', 0, h - 0.12, 0, w, 0.12, d, 0.05);
    m.box('oak', 0, 0.16, 0, w - 0.1, 0.025, d - 0.1, 0.008);
  },

  television_02: (m, w, d, h) => {
    m.box('matteBlack', 0, 0.08, 0, w, h - 0.08, 0.025, 0.006);
    m.box('glass', 0, 0.095, 0.0135, w - 0.015, h - 0.105, 0.002);
    m.box('matteBlack', 0, 0.02, 0.01, 0.06, 0.07, 0.04, 0.01);
    m.box('matteBlack', 0, 0, 0, w * 0.45, 0.02, d, 0.01);
  },

  electric_stove: (m, w, d, h) => {
    m.box('steel', 0, 0, 0, w, h - 0.03, d, 0.01);
    m.box('glass', 0, h - 0.03, 0, w, 0.03, d, 0.008);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) m.cyl('graphite', x * w * 0.22, h - 0.003, z * d * 0.2, w * 0.16, 0.004, w * 0.16);
    m.box('glass', 0, h * 0.35, d / 2 + 0.001, w - 0.08, h * 0.38, 0.003);
    m.box('matteBlack', 0, h - 0.13, d / 2 + 0.006, w - 0.06, 0.04, 0.012, 0.004);
    m.box('steel', 0, h * 0.7 - 0.02, d / 2 + 0.03, w - 0.1, 0.02, 0.02, 0.008);
  },

  vintage_electric_kettle: (m, w, d, h) => {
    m.cyl('matteBlack', 0, 0, 0, 0.08, 0.02);
    m.cyl('steel', 0, 0.02, 0, 0.085, h - 0.06, 0.085, 0.068);
    m.cyl('matteBlack', 0, h - 0.04, 0, 0.05, 0.04, 0.05);
    m.box('matteBlack', w / 2 - 0.02, 0.05, 0, 0.03, h - 0.1, 0.04, 0.012);
    m.box('steel', -w / 2 + 0.02, h * 0.45, 0, 0.05, 0.03, 0.03, 0.01);
  },

  ornate_mirror_01: (m, w, d, h) => {
    m.box('matteBlack', 0, 0, 0, w, h, d, 0.04);
    m.box('mirror', 0, 0.025, d / 2 + 0.0005, w - 0.05, h - 0.05, 0.001, 0.03);
  },

  Chandelier_01: (m, w, d, h) => {
    m.cyl('white', 0, h - 0.02, 0, w * 0.44, 0.02, d * 0.44);
    m.cyl('brass', 0, h - 0.035, 0, 0.05, 0.015, 0.05);
    const drops = [[0, 0.1, 0], [-0.3, 0.2, -0.1], [0.3, 0.2, 0.1], [-0.15, 0.32, 0.25], [0.2, 0.34, -0.25]];
    for (const [x, drop, z] of drops) {
      const top = h - 0.02, ball = 0.095, len = drop * 1.55;
      const px = x * (w / 0.8) * 0.75, pz = z * (d / 0.8) * 0.75;
      m.cyl('brass', px, top - len + ball, pz, 0.004, len - ball);
      m.sphere('warm', px, top - len, pz, ball);
    }
  },
  /** Торшер: тяжёлое основание, тонкая стойка, тканевый абажур (светится, когда включён свет, — см. src/catalog/lights.ts). */
  floor_lamp: (m, w, d, h) => {
    m.cyl('matteBlack', 0, 0, 0, 0.17, 0.025, 0.17);
    m.cyl('brass', 0, 0.025, 0, 0.012, h - 0.025 - 0.34, 0.012);
    m.cyl('warm', 0, h - 0.4, 0, w * 0.4, 0.4, d * 0.4, w * 0.3);
    m.cyl('brass', 0, h - 0.41, 0, 0.03, 0.02, 0.03);
  },

  /** Современная круглая люстра: плоский светящийся диск на четырёх тонких подвесах. */
  Chandelier_02: (m, w, d, h) => {
    m.cyl('white', 0, h - 0.02, 0, 0.1, 0.02, 0.1);
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) m.cyl('brass', x, 0.075, z, 0.004, h - 0.095, 0.004);
    m.cyl('warm', 0, 0, 0, w / 2, 0.06, d / 2);
    m.cyl('brass', 0, 0.06, 0, w / 2, 0.015, d / 2);
  },

  /** Плафон: потолочный светильник-чаша для небольших и низких помещений. */
  ceiling_shade_01: (m, w, d, h) => {
    m.cyl('white', 0, h - 0.03, 0, w / 2, 0.03, d / 2);
    m.cyl('warm', 0, 0, 0, w * 0.3, h - 0.03, d * 0.3, w / 2 - 0.02);
  },
  /** Холодильник: стальной корпус, верхняя камера и нижняя морозилка, вертикальные ручки. */
  fridge_01: (m, w, d, h) => {
    m.box('inox', 0, 0.03, 0, w, h - 0.03, d, 0.012);
    m.box('matteBlack', 0, h * 0.34, d / 2 + 0.0005, w - 0.01, 0.006, 0.002);
    m.box('matteBlack', w / 2 - 0.055, h * 0.40, d / 2 + 0.018, 0.018, h * 0.5, 0.03, 0.006);
    m.box('matteBlack', w / 2 - 0.055, h * 0.07, d / 2 + 0.018, 0.018, h * 0.2, 0.03, 0.006);
    m.box('matteBlack', 0, 0, 0, w - 0.04, 0.03, d - 0.06, 0.005);
  },

  /** Стиральная машина с фронтальной загрузкой: круглый люк со стеклом, панель с ручкой. */
  washing_machine_01: (m, w, d, h) => {
    m.box('white', 0, 0.02, 0, w, h - 0.02, d, 0.015);
    m.box('matteBlack', 0, h - 0.11, d / 2 + 0.001, w - 0.06, 0.07, 0.004, 0.006);
    m.sphere('steel', w * 0.18, h - 0.075, d / 2 + 0.008, 0.022, 0.022, 0.012);
    m.sphere('steel', 0, h * 0.44, d / 2 - 0.004, w * 0.42, w * 0.42, 0.022);
    m.sphere('glass', 0, h * 0.44, d / 2 + 0.006, w * 0.33, w * 0.33, 0.02);
    m.box('matteBlack', 0, 0, 0, w - 0.06, 0.02, d - 0.06, 0.004);
  },

  /** Ванна: прямоугольная, скруглённая, с внутренней чашей и смесителем у торца. */
  bathtub_01: (m, w, d, h) => {
    m.box('porcelain', 0, 0, 0, w, h, d, 0.07);
    m.box('bathInner', -0.03, h - 0.003, 0, w - 0.22, 0.004, d - 0.16, 0.06);
    m.box('steel', w / 2 - 0.08, h, 0, 0.03, 0.17, 0.03, 0.01);
    m.box('steel', w / 2 - 0.15, h + 0.145, 0, 0.14, 0.022, 0.022, 0.008);
  },

  /** Унитаз с бачком: чаша, крышка, кнопка смыва. */
  toilet_01: (m, w, d, h) => {
    m.cyl('porcelain', 0, 0, 0.1, w * 0.46, 0.4, d * 0.34, w * 0.5);
    m.cyl('porcelain', 0, 0.4, 0.1, w * 0.5, 0.03, d * 0.37);
    m.box('porcelain', 0, 0.4, -d / 2 + 0.11, w, h - 0.4, 0.22, 0.02);
    m.cyl('steel', 0, h - 0.004, -d / 2 + 0.11, 0.035, 0.008, 0.02);
  },

  /** Раковина с тумбой: тумба, фарфоровая столешница с чашей и смеситель. */
  washbasin_01: (m, w, d, h) => {
    m.box('white', 0, 0, 0, w - 0.02, 0.7, d - 0.02, 0.01);
    m.box('matteBlack', 0, 0.62, d / 2 - 0.005, w - 0.1, 0.012, 0.012, 0.004);
    m.box('porcelain', 0, 0.7, 0, w, 0.06, d, 0.025);
    m.box('bathInner', 0, 0.76 - 0.003, 0.02, w - 0.2, 0.004, d - 0.16, 0.05);
    m.cyl('steel', 0, 0.76, -d / 2 + 0.07, 0.016, h - 0.76 - 0.03, 0.016);
    m.box('steel', 0, h - 0.04, -d / 2 + 0.11, 0.022, 0.02, 0.09, 0.008);
  },
};

// Габариты после замены, см: [ширина, глубина, высота].
const SIZES = {
  sofa_03: [273, 93, 84], sofa_02: [181, 82, 78], Sofa_01: [157, 66, 78], vintage_day_bed: [197, 85, 75],
  old_bed_frame: [90, 200, 100], Ottoman_01: [88, 62, 42], modern_coffee_table_02: [120, 120, 38],
  dining_table: [226, 139, 75], round_wooden_table_01: [140, 140, 75], metal_office_desk: [200, 95, 75],
  dining_chair_02: [43, 58, 85], bar_chair_round_01: [48, 49, 75], wooden_stool_01: [43, 44, 44],
  painted_wooden_cabinet: [119, 62, 100], painted_wooden_nightstand: [50, 51, 50],
  wooden_bookshelf_worn: [137, 40, 200], painted_wooden_bench: [116, 40, 45], television_02: [56, 18, 38],
  electric_stove: [50, 65, 86], vintage_electric_kettle: [24, 18, 24], ornate_mirror_01: [50, 3, 75],
  Chandelier_01: [80, 80, 70], floor_lamp: [40, 40, 165], Chandelier_02: [60, 60, 45], ceiling_shade_01: [40, 40, 25],
  fridge_01: [60, 68, 190], washing_machine_01: [60, 55, 85], bathtub_01: [170, 75, 58], toilet_01: [38, 68, 80], washbasin_01: [60, 46, 88],
};

const report = {};
for (const [id, [wc, dc, hc]] of Object.entries(SIZES)) {
  const [w, d, h] = [wc / 100, dc / 100, hc / 100];
  const model = new Model();
  BUILD[id](model, w, d, h);
  model.fit(w, h, d);
  const dir = `public/models/${id}`;
  mkdirSync(dir, { recursive: true });
  const { json, bin } = model.gltf(id, `${id}.bin`);
  writeFileSync(`${dir}/${id}.gltf`, JSON.stringify(json));
  writeFileSync(`${dir}/${id}.bin`, bin);
  report[id] = { widthCm: wc, depthCm: dc, heightCm: hc, triangles: [...model.prims.values()].reduce((s, p) => s + p.idx.length / 3, 0) };
}
mkdirSync('docs/stage-16', { recursive: true });
writeFileSync('docs/stage-16/modern-models.json', JSON.stringify(report, null, 2));
console.log(`Моделей создано: ${Object.keys(report).length}`);
