import { describe, expect, it } from 'vitest';
import { WALK, buildObstacles, distanceToPolygon, furnitureObstacles, isBlocked, moveWalker, wallObstacles, walkDelta } from '../../src/walk/collision';
import type { FurnitureInstance } from '../../src/domain/types';
import { findTestItem, twoRoomApartment } from './fixtures';

// Задача 24.3: столкновения в режиме «Прогулка» (SPEC D-17). Комната А: x 0…400, z 0…300; коридор Б: x 410…610;
// дверь в перегородке w7 (x 400…410) на z 110…190.

const walk = (from: { xCm: number; zCm: number }, to: { xCm: number; zCm: number }, obstacles = buildObstacles(twoRoomApartment(), findTestItem)) =>
  moveWalker(from, { xCm: to.xCm - from.xCm, zCm: to.zCm - from.zCm }, obstacles);

function withFurniture(...items: Array<Partial<FurnitureInstance> & { catalogItemId: string; xCm: number; zCm: number }>) {
  const apartment = twoRoomApartment();
  apartment.furniture = items.map((item, index) => ({
    id: `f${index}`, assetVersion: 1, roomId: 'room-a', elevationCm: 0, rotationDeg: 0, variantId: null, ...item,
  }));
  return apartment;
}

describe('многоугольники и расстояния', () => {
  const square = [{ xCm: 0, zCm: 0 }, { xCm: 10, zCm: 0 }, { xCm: 10, zCm: 10 }, { xCm: 0, zCm: 10 }];
  it('внутри — 0, снаружи — расстояние до ближайшей стороны, любое направление обхода', () => {
    expect(distanceToPolygon({ xCm: 5, zCm: 5 }, square)).toBe(0);
    expect(distanceToPolygon({ xCm: 15, zCm: 5 }, square)).toBeCloseTo(5, 9);
    expect(distanceToPolygon({ xCm: 13, zCm: 14 }, square)).toBeCloseTo(5, 9);
    expect(distanceToPolygon({ xCm: 5, zCm: 5 }, [...square].reverse())).toBe(0);
  });
});

describe('стены и проёмы (24.3)', () => {
  it('стена не пускает: шаг в наружную стену останавливается у неё, игрок не выходит из комнаты', () => {
    const end = walk({ xCm: 200, zCm: 50 }, { xCm: 200, zCm: -100 });
    expect(end.zCm).toBeGreaterThanOrEqual(WALK.radiusCm - 1e-6);
    expect(end.zCm).toBeLessThan(WALK.radiusCm + WALK.maxStepCm);
  });

  it('дверной проём проходим: из комнаты А в коридор Б', () => {
    const end = walk({ xCm: 300, zCm: 150 }, { xCm: 520, zCm: 150 });
    expect(end.xCm).toBeCloseTo(520, 6);
    expect(end.zCm).toBeCloseTo(150, 6);
  });

  it('мимо проёма — перегородка не пускает', () => {
    const end = walk({ xCm: 300, zCm: 50 }, { xCm: 520, zCm: 50 });
    expect(end.xCm).toBeLessThan(400);
  });

  it('узкий проём не пропускает слишком широкое тело, а у края — скользит', () => {
    // Дверь 80 см, тело 44 см: по оси двери проходит, у косяка (z=118) центр не помещается.
    expect(isBlocked({ xCm: 405, zCm: 150 }, WALK.radiusCm, wallObstacles(twoRoomApartment()))).toBe(false);
    expect(isBlocked({ xCm: 405, zCm: 118 }, WALK.radiusCm, wallObstacles(twoRoomApartment()))).toBe(true);
  });

  it('скольжение вдоль стены: диагональный шаг в стену сохраняет движение вдоль неё', () => {
    const end = walk({ xCm: 200, zCm: 40 }, { xCm: 300, zCm: -20 });
    expect(end.xCm).toBeGreaterThan(280);
    expect(end.zCm).toBeGreaterThanOrEqual(WALK.radiusCm - 1e-6);
  });

  it('очень длинный шаг не прошивает тонкую стену (нет туннелирования)', () => {
    const end = walk({ xCm: 300, zCm: 50 }, { xCm: 5000, zCm: 50 });
    expect(end.xCm).toBeLessThan(400);
  });

  it('входная дверь наружу не проходима: стена остаётся сплошной', () => {
    const apartment = twoRoomApartment();
    apartment.openings.push({ id: 'entrance', kind: 'door', wallId: 'w3', offsetCm: 100, widthCm: 90, heightCm: 210, hinge: 'start', swing: 'left' });
    const end = moveWalker({ xCm: 540, zCm: 100 }, { xCm: 200, zCm: 0 }, buildObstacles(apartment, findTestItem));
    expect(end.xCm).toBeLessThan(610);
  });
});

describe('мебель (24.3)', () => {
  it('диван не проходится, ковёр не мешает', () => {
    const apartment = withFurniture(
      { catalogItemId: 'sofa', xCm: 200, zCm: 150 },
      { catalogItemId: 'rug', xCm: 100, zCm: 220 },
    );
    expect(furnitureObstacles(apartment, findTestItem)).toHaveLength(1);
    const obstacles = buildObstacles(apartment, findTestItem);
    const through = moveWalker({ xCm: 60, zCm: 150 }, { xCm: 340, zCm: 0 }, obstacles);
    expect(through.xCm).toBeLessThan(200 - 100 + 1);
    // Ковёр на z 220 не препятствие: шаг по нему доходит до цели.
    const overRug = moveWalker({ xCm: 100, zCm: 230 }, { xCm: 0, zCm: 30 }, obstacles);
    expect(overRug.zCm).toBeCloseTo(260, 6);
  });

  it('повёрнутая мебель учитывает поворот', () => {
    const apartment = withFurniture({ catalogItemId: 'sofa', xCm: 200, zCm: 150, rotationDeg: 90 });
    const obstacles = buildObstacles(apartment, findTestItem);
    // Диван 200 × 90 повёрнут: теперь вытянут по Z, поэтому вдоль X до него можно подойти вплотную на 45 + радиус.
    const end = moveWalker({ xCm: 60, zCm: 150 }, { xCm: 300, zCm: 0 }, obstacles);
    expect(end.xCm).toBeLessThanOrEqual(200 - 45 - WALK.radiusCm + 1e-6 + WALK.maxStepCm);
    expect(end.xCm).toBeGreaterThan(200 - 45 - WALK.radiusCm - WALK.maxStepCm);
  });

  it('предмет с неизвестным id каталога пропускается', () => {
    const apartment = withFurniture({ catalogItemId: 'нет-такого', xCm: 200, zCm: 150 });
    expect(furnitureObstacles(apartment, findTestItem)).toEqual([]);
  });
});

describe('направление шага', () => {
  it('yaw 0 — вперёд к −Z, yaw 90° — к −X; вбок — вправо от взгляда', () => {
    const f0 = walkDelta(0, 1, 0, 100);
    expect(f0.xCm).toBeCloseTo(0, 9); expect(f0.zCm).toBeCloseTo(-100, 9);
    const f90 = walkDelta(Math.PI / 2, 1, 0, 100);
    expect(f90.xCm).toBeCloseTo(-100, 9); expect(f90.zCm).toBeCloseTo(0, 9);
    const right = walkDelta(0, 0, 1, 100);
    expect(right.xCm).toBeCloseTo(100, 9); expect(right.zCm).toBeCloseTo(0, 9);
  });

  it('по диагонали скорость не растёт, без нажатий шага нет', () => {
    const d = walkDelta(0.3, 1, 1, 100);
    expect(Math.hypot(d.xCm, d.zCm)).toBeCloseTo(100, 9);
    expect(walkDelta(0, 0, 0, 100)).toEqual({ xCm: 0, zCm: 0 });
  });
});
