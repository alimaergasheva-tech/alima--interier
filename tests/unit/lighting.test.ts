import { describe, expect, it } from 'vitest';
import { LIGHTING, environmentFor, exposureFor, keyLight, shadowFrustum } from '../../src/scene3d/lighting';
import { skyAt } from '../../src/scene3d/timeOfDay';

// Задача 16.1: камера тени должна охватывать всю комнату при любых её размерах.

function inLightSpace(point: [number, number, number], position: [number, number, number], target: [number, number, number]) {
  // Базис камеры света: ось взгляда от солнца к цели, «вверх» — мировой Y.
  const f = norm(sub(target, position));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const d = sub(point, position);
  return { x: dot(d, r), y: dot(d, u), depth: dot(d, f) };
}
const sub = (a: number[], b: number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!] as [number, number, number];
const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!] as [number, number, number];
const norm = (a: [number, number, number]) => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l] as [number, number, number]; };

describe('камера тени по размеру комнаты (16.1)', () => {
  for (const size of [
    { width: 2, depth: 1.8, height: 2.7 },
    { width: 4.2, depth: 3.5, height: 2.7 },
    { width: 9, depth: 7, height: 3.5 },
  ]) {
    it(`комната ${size.width} × ${size.depth} × ${size.height} м целиком в камере тени`, () => {
      const center: [number, number] = [10, -3];
      const f = shadowFrustum(center, size);
      const target: [number, number, number] = [center[0], size.height / 2, center[1]];
      for (const x of [-1, 1]) for (const y of [0, 1]) for (const z of [-1, 1]) {
        const corner: [number, number, number] = [center[0] + (x * size.width) / 2, y * size.height, center[1] + (z * size.depth) / 2];
        const p = inLightSpace(corner, f.position, target);
        expect(Math.abs(p.x), 'по ширине').toBeLessThanOrEqual(f.half + 1e-9);
        expect(Math.abs(p.y), 'по высоте').toBeLessThanOrEqual(f.half + 1e-9);
        expect(p.depth, 'не ближе near').toBeGreaterThan(f.near);
        expect(p.depth, 'не дальше far').toBeLessThan(f.far);
      }
    });
  }

  it('солнце над комнатой и в сторону заданного направления', () => {
    const f = shadowFrustum([0, 0], { width: 4, depth: 3, height: 2.7 });
    expect(f.position[1]).toBeGreaterThan(2.7 / 2);
    expect(Math.sign(f.position[0])).toBe(Math.sign(LIGHTING.sun.direction[0]));
    expect(Math.sign(f.position[2])).toBe(Math.sign(LIGHTING.sun.direction[2]));
  });
});

describe('свет комнаты по времени суток (20.4)', () => {
  it('днём ключевой свет — солнце, ночью — холодная луна', () => {
    const day = keyLight(skyAt(13));
    const night = keyLight(skyAt(23));
    expect(day.kind).toBe('sun');
    expect(night.kind).toBe('moon');
    expect(day.intensity).toBeGreaterThan(night.intensity * 4);
    expect(night.intensity).toBeGreaterThan(0);
    // Луна холоднее солнца: синего больше, чем красного.
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    expect(rgb(night.color)[2]).toBeGreaterThan(rgb(night.color)[0]!);
    expect(night.direction[1]).toBeGreaterThan(0);
  });

  it('направление света меняется в течение дня, источник всегда над горизонтом', () => {
    const morning = keyLight(skyAt(7)).direction;
    const evening = keyLight(skyAt(17.5)).direction;
    expect(morning[0]).toBeGreaterThan(evening[0]);
    for (let h = 0; h < 24; h += 0.5) {
      const k = keyLight(skyAt(h));
      expect(k.direction[1], `час ${h}`).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it('силы света, отражений и экспозиция меняются плавно, без скачков при переключении солнце/луна', () => {
    let prev = keyLight(skyAt(0)).intensity;
    for (let h = 0.1; h <= 24; h += 0.1) {
      const now = keyLight(skyAt(h)).intensity;
      expect(Math.abs(now - prev), `час ${h.toFixed(1)}`).toBeLessThan(0.5);
      prev = now;
    }
  });

  it('ночью отражений меньше, а экспозиция выше, чем днём', () => {
    expect(environmentFor(skyAt(23))).toBeLessThan(environmentFor(skyAt(13)));
    expect(exposureFor(skyAt(23))).toBeGreaterThan(exposureFor(skyAt(13)));
    expect(exposureFor(skyAt(13))).toBeCloseTo(LIGHTING.toneMappingExposure, 5);
  });

  it('камера тени следует за направлением света', () => {
    const size = { width: 4, depth: 3, height: 2.7 };
    const a = shadowFrustum([0, 0], size, [1, 1, 0]);
    const b = shadowFrustum([0, 0], size, [-1, 1, 0]);
    expect(a.position[0]).toBeGreaterThan(0);
    expect(b.position[0]).toBeLessThan(0);
  });
});
