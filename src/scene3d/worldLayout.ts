import { roomOuterRect } from '../domain/rooms';
import type { Apartment } from '../domain/types';
import { cmToScene } from '../domain/units';

// Раскладка внешнего мира (задача 20.3): чистые функции без браузерных зависимостей, поэтому проверяются в тестах.

export const WORLD = {
  skyRadius: 300,
  groundRadius: 260,
  groundY: -0.04,
  /** Отступ от контура квартиры (м), в пределах которого нет домов и деревьев. */
  clearMargin: 7,
  houses: 34,
  trees: 70,
};

/** Детерминированный генератор (mulberry32): мир одинаков при каждой отрисовке и в каждом тесте. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rect2 { minX: number; maxX: number; minZ: number; maxZ: number }
export interface HouseSpec { x: number; z: number; width: number; depth: number; height: number; rotY: number; tone: number }
export interface TreeSpec { x: number; z: number; height: number; crown: number; tone: number }

/** Контур квартиры в метрах сцены: объединение внешних прямоугольников всех комнат. */
export function apartmentBoundsM(apartment: Apartment): Rect2 {
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const room of apartment.rooms) {
    const r = roomOuterRect(apartment, room);
    b.minX = Math.min(b.minX, r.minX); b.maxX = Math.max(b.maxX, r.maxX);
    b.minZ = Math.min(b.minZ, r.minZ); b.maxZ = Math.max(b.maxZ, r.maxZ);
  }
  if (!Number.isFinite(b.minX)) return { minX: -2, maxX: 2, minZ: -2, maxZ: 2 };
  return { minX: cmToScene(b.minX), maxX: cmToScene(b.maxX), minZ: cmToScene(b.minZ), maxZ: cmToScene(b.maxZ) };
}

const insideExpanded = (x: number, z: number, b: Rect2, margin: number) =>
  x > b.minX - margin && x < b.maxX + margin && z > b.minZ - margin && z < b.maxZ + margin;

/** Дома и деревья вокруг контура: ничего не стоит ближе clearMargin к стенам, всё детерминировано. */
export function buildWorld(bounds: Rect2): { houses: HouseSpec[]; trees: TreeSpec[] } {
  const random = rng(20_26);
  const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
  const half = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2;
  const houses: HouseSpec[] = [];
  for (let guard = 0; houses.length < WORLD.houses && guard < 4000; guard += 1) {
    const angle = random() * Math.PI * 2;
    const radius = half + WORLD.clearMargin + 8 + random() * 70;
    const x = cx + Math.cos(angle) * radius, z = cz + Math.sin(angle) * radius;
    const width = 6 + random() * 9, depth = 6 + random() * 7;
    const reach = Math.hypot(width, depth) / 2 + 2;
    if (insideExpanded(x, z, bounds, WORLD.clearMargin + reach)) continue;
    if (houses.some((h) => Math.hypot(h.x - x, h.z - z) < (Math.hypot(h.width, h.depth) + Math.hypot(width, depth)) / 2 + 2)) continue;
    houses.push({ x, z, width, depth, height: 6 + random() * (random() > 0.8 ? 26 : 10), rotY: Math.atan2(cx - x, cz - z) + (random() - 0.5) * 0.5, tone: random() });
  }
  const trees: TreeSpec[] = [];
  for (let guard = 0; trees.length < WORLD.trees && guard < 6000; guard += 1) {
    const angle = random() * Math.PI * 2;
    const radius = half + WORLD.clearMargin + 1 + random() * 60;
    const x = cx + Math.cos(angle) * radius, z = cz + Math.sin(angle) * radius;
    if (insideExpanded(x, z, bounds, WORLD.clearMargin)) continue;
    if (houses.some((h) => Math.abs(h.x - x) < h.width / 2 + 2.5 && Math.abs(h.z - z) < h.depth / 2 + 2.5)) continue;
    trees.push({ x, z, height: 4 + random() * 6, crown: 1.4 + random() * 1.4, tone: random() });
  }
  return { houses, trees };
}

