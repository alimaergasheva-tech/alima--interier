import type { CatalogItem, Apartment, Id } from '../domain/types';
import { roomsOfWall } from '../domain/rooms';
import { colliderCorners, type Point } from '../geometry/placement';
import { wallSpan, openingSpan } from '../geometry/openings';

// Режим «Прогулка» (SPEC D-17): движение по плану квартиры в сантиметрах. Игрок — круг на полу;
// препятствия — выпуклые многоугольники (стены с проёмами и основания мебели). Логика чистая, без three.js.

export const WALK = {
  /** Высота глаз, см. */
  eyeCm: 160,
  /** Радиус тела, см. */
  radiusCm: 22,
  /** Скорость шага, см/с; с Shift — вдвое быстрее. */
  speedCmPerS: 140,
  /** Предмет мешает проходу, если пересекает высоты тела: от 20 до 180 см над полом. */
  bodyMinCm: 20,
  bodyMaxCm: 180,
  /** Наибольшее смещение за один шаг проверки, см: исключает «туннелирование» тонких стен. */
  maxStepCm: 8,
} as const;

export type Polygon = Point[];

const rectPolygon = (minX: number, maxX: number, minZ: number, maxZ: number): Polygon => [
  { xCm: minX, zCm: minZ }, { xCm: maxX, zCm: minZ }, { xCm: maxX, zCm: maxZ }, { xCm: minX, zCm: maxZ },
];

/** Стены как прямоугольники; проёмы дверей между комнатами вырезаны, окна и входная дверь остаются сплошными. */
export function wallObstacles(apartment: Apartment): Polygon[] {
  const result: Polygon[] = [];
  for (const wall of apartment.walls) {
    const span = wallSpan(apartment, wall);
    const half = wall.thicknessCm / 2;
    const gaps = apartment.openings
      .filter((opening) => opening.wallId === wall.id && opening.kind === 'door' && roomsOfWall(apartment, wall.id).length > 1)
      .map((opening) => openingSpan(apartment, opening))
      .sort((a, b) => a.min - b.min);
    // Концы продлены на половину толщины, чтобы углы смыкались.
    let from = span.min - half;
    const pieces: Array<[number, number]> = [];
    for (const gap of gaps) {
      if (gap.min > from) pieces.push([from, gap.min]);
      from = Math.max(from, gap.max);
    }
    pieces.push([from, span.max + half]);
    for (const [a, b] of pieces) {
      if (b - a <= 1e-6) continue;
      result.push(span.alongX
        ? rectPolygon(a, b, span.fixed - half, span.fixed + half)
        : rectPolygon(span.fixed - half, span.fixed + half, a, b));
    }
  }
  return result;
}

/** Основания мебели, которые пересекают высоты тела: ковёр и настенные полки над головой не мешают. */
export function furnitureObstacles(apartment: Apartment, find: (id: Id) => CatalogItem | undefined): Polygon[] {
  const result: Polygon[] = [];
  for (const instance of apartment.furniture) {
    const item = find(instance.catalogItemId);
    if (!item) continue;
    for (const box of item.colliders) {
      const low = instance.elevationCm + box.yMinCm;
      const high = instance.elevationCm + box.yMaxCm;
      if (high <= WALK.bodyMinCm || low >= WALK.bodyMaxCm) continue;
      result.push(colliderCorners(box, instance));
    }
  }
  return result;
}

export function buildObstacles(apartment: Apartment, find: (id: Id) => CatalogItem | undefined): Polygon[] {
  return [...wallObstacles(apartment), ...furnitureObstacles(apartment, find)];
}

/** Расстояние от точки до выпуклого многоугольника; 0, если точка внутри (любое направление обхода). */
export function distanceToPolygon(point: Point, polygon: Polygon): number {
  let positive = 0, negative = 0;
  let best = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const ex = b.xCm - a.xCm, ez = b.zCm - a.zCm;
    const px = point.xCm - a.xCm, pz = point.zCm - a.zCm;
    const cross = ex * pz - ez * px;
    if (cross > 0) positive++; else if (cross < 0) negative++;
    const t = Math.max(0, Math.min(1, (px * ex + pz * ez) / (ex * ex + ez * ez || 1)));
    best = Math.min(best, Math.hypot(point.xCm - (a.xCm + ex * t), point.zCm - (a.zCm + ez * t)));
  }
  return positive === 0 || negative === 0 ? 0 : best;
}

export function isBlocked(point: Point, radiusCm: number, obstacles: Polygon[]): boolean {
  return obstacles.some((polygon) => distanceToPolygon(point, polygon) < radiusCm);
}

/**
 * Смещает игрока на delta с проскальзыванием вдоль препятствий: сначала полный шаг, затем по осям отдельно.
 * Длинный шаг режется на части не длиннее WALK.maxStepCm.
 */
export function moveWalker(position: Point, delta: Point, obstacles: Polygon[], radiusCm: number = WALK.radiusCm): Point {
  const length = Math.hypot(delta.xCm, delta.zCm);
  const steps = Math.max(1, Math.ceil(length / WALK.maxStepCm));
  let current = position;
  for (let i = 0; i < steps; i++) {
    const dx = delta.xCm / steps, dz = delta.zCm / steps;
    const full = { xCm: current.xCm + dx, zCm: current.zCm + dz };
    if (!isBlocked(full, radiusCm, obstacles)) { current = full; continue; }
    const alongX = { xCm: current.xCm + dx, zCm: current.zCm };
    if (dx !== 0 && !isBlocked(alongX, radiusCm, obstacles)) { current = alongX; continue; }
    const alongZ = { xCm: current.xCm, zCm: current.zCm + dz };
    if (dz !== 0 && !isBlocked(alongZ, radiusCm, obstacles)) current = alongZ;
  }
  return current;
}

/** Направление взгляда: yaw 0 смотрит в −Z (как камера three.js), положительный угол поворачивает влево. */
export function walkDelta(yawRad: number, forward: number, strafe: number, distanceCm: number): Point {
  const fx = -Math.sin(yawRad), fz = -Math.cos(yawRad);
  const rx = Math.cos(yawRad), rz = -Math.sin(yawRad);
  const x = fx * forward + rx * strafe, z = fz * forward + rz * strafe;
  const norm = Math.hypot(x, z);
  if (norm === 0) return { xCm: 0, zCm: 0 };
  return { xCm: (x / norm) * distanceCm, zCm: (z / norm) * distanceCm };
}
