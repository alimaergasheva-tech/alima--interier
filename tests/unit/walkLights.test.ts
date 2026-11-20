import { describe, expect, it } from 'vitest';
import { WALK_LIGHT_LIMIT, pickWalkLights, type RoomLightSpot } from '../../src/walk/lights';

// Задача 24.4: ограничение числа источников света в прогулке (D-08, D-11).

const spot = (roomId: string, xCm: number, on = true): RoomLightSpot => ({ roomId, xCm, zCm: 0, on });
const spots = [spot('a', 0), spot('b', 300), spot('c', 600), spot('d', 900), spot('e', 1200), spot('f', 1500), spot('off', 50, false)];

describe('выбор светильников для прогулки (24.4)', () => {
  it('не больше предела, выключенные не берутся, ближайшие к игроку первыми', () => {
    const picked = pickWalkLights(spots, { xCm: 0, zCm: 0 });
    expect(picked.map((s) => s.roomId)).toEqual(['a', 'b', 'c', 'd']);
    expect(picked).toHaveLength(WALK_LIGHT_LIMIT);
  });

  it('набор следует за игроком', () => {
    expect(pickWalkLights(spots, { xCm: 1500, zCm: 0 }).map((s) => s.roomId)).toEqual(['f', 'e', 'd', 'c']);
  });

  it('если включено меньше предела — берутся все включённые; если ничего — пусто', () => {
    expect(pickWalkLights([spot('a', 0), spot('b', 10, false)], { xCm: 0, zCm: 0 }).map((s) => s.roomId)).toEqual(['a']);
    expect(pickWalkLights([spot('a', 0, false)], { xCm: 0, zCm: 0 })).toEqual([]);
  });

  it('предел можно задать; нулевой предел даёт пустой набор; при равных расстояниях порядок стабилен', () => {
    expect(pickWalkLights(spots, { xCm: 0, zCm: 0 }, 2)).toHaveLength(2);
    expect(pickWalkLights(spots, { xCm: 0, zCm: 0 }, 0)).toEqual([]);
    const tie = [spot('b', 100), spot('a', -100)];
    expect(pickWalkLights(tie, { xCm: 0, zCm: 0 }).map((s) => s.roomId)).toEqual(['a', 'b']);
  });
});
