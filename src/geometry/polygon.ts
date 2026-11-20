import { EPS_CM } from '../domain/units';

// Пересечение выпуклых многоугольников на плоскости пола (теорема о разделяющей оси).

export interface Point {
  xCm: number;
  zCm: number;
}

function project(polygon: Point[], ax: number, az: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const point of polygon) {
    const value = point.xCm * ax + point.zCm * az;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return [min, max];
}

/**
 * Глубина взаимного проникновения двух выпуклых многоугольников, см.
 * 0 — не пересекаются или только касаются.
 */
export function overlapDepthCm(a: Point[], b: Point[]): number {
  let depth = Infinity;
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i]!;
      const q = polygon[(i + 1) % polygon.length]!;
      const ex = q.xCm - p.xCm;
      const ez = q.zCm - p.zCm;
      const length = Math.hypot(ex, ez);
      if (length <= 1e-9) continue;
      const ax = -ez / length;
      const az = ex / length;
      const [minA, maxA] = project(a, ax, az);
      const [minB, maxB] = project(b, ax, az);
      const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);
      if (overlap <= 0) return 0;
      depth = Math.min(depth, overlap);
    }
  }
  return depth === Infinity ? 0 : depth;
}

/** Пересекаются с проникновением больше допуска. Касание пересечением не считается. */
export function polygonsOverlap(a: Point[], b: Point[]): boolean {
  return overlapDepthCm(a, b) > EPS_CM;
}

/** Интервалы пересекаются с проникновением больше допуска. */
export function intervalsOverlap(minA: number, maxA: number, minB: number, maxB: number): boolean {
  return Math.min(maxA, maxB) - Math.max(minA, minB) > EPS_CM;
}
