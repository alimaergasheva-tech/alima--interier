import { describe, expect, it } from 'vitest';
import { LAMPS, LAMP_LIGHT_LIMIT, lampSpec, lampSpots, pickLamps, roomsWithReplacedCeilingLight } from '../../src/catalog/lights';
import { findCatalogItem, techCatalog } from '../../src/catalog/techCatalog';

const inst = (id: string, catalogItemId: string, roomId: string, xCm: number, zCm: number, elevationCm = 0, rotationDeg = 0) =>
  ({ id, catalogItemId, roomId, xCm, zCm, elevationCm, rotationDeg });

describe('светильники каталога (задача 21)', () => {
  it('каждый светильник из LAMPS есть в каталоге; торшер, настольная лампа, бра и три люстры/плафон на месте', () => {
    for (const id of Object.keys(LAMPS)) expect(findCatalogItem(id), id).toBeDefined();
    expect(Object.keys(LAMPS).sort()).toEqual(['ceiling_shade_01', 'chandelier_01', 'chandelier_02', 'desk_lamp_arm_01', 'floor_lamp', 'industrial_wall_sconce']);
  });

  it('способ установки: торшер на пол, лампа на стол, бра на стену, люстры и плафон на потолок', () => {
    expect(findCatalogItem('floor_lamp')!.mount).toBe('floor');
    expect(findCatalogItem('desk_lamp_arm_01')!.mount).toBe('tabletop');
    expect(findCatalogItem('industrial_wall_sconce')!.mount).toBe('wall');
    for (const id of ['chandelier_01', 'chandelier_02', 'ceiling_shade_01']) expect(findCatalogItem(id)!.mount).toBe('ceiling');
  });

  it('у новых предметов есть габариты, лицензия и модель; источник света внутри габарита по высоте', () => {
    for (const id of ['floor_lamp', 'chandelier_01', 'chandelier_02', 'ceiling_shade_01']) {
      const item = findCatalogItem(id)!;
      expect(item.license.license).toBe('CC0 1.0');
      expect(item.model.url).toMatch(/\.gltf$/);
      expect(lampSpec(id)!.yCm).toBeLessThanOrEqual(item.sizeCm.height);
    }
    expect(new Set(techCatalog.map((item) => item.id)).size).toBe(techCatalog.length);
  });

  it('только люстры и плафон заменяют стандартный светильник комнаты', () => {
    const replaced = roomsWithReplacedCeilingLight([
      inst('a', 'floor_lamp', 'r1', 0, 0), inst('b', 'chandelier_02', 'r2', 0, 0), inst('c', 'sofa_02', 'r3', 0, 0),
    ]);
    expect([...replaced]).toEqual(['r2']);
  });

  it('место источника: высота над опорой, смещение вперёд с учётом поворота', () => {
    const [lamp] = lampSpots([inst('l', 'desk_lamp_arm_01', 'r1', 100, 200, 75, 90)]);
    expect(lamp!.yCm).toBe(75 + LAMPS.desk_lamp_arm_01!.yCm);
    expect(lamp!.xCm).toBeCloseTo(100 + LAMPS.desk_lamp_arm_01!.forwardCm!, 5);
    expect(lamp!.zCm).toBeCloseTo(200, 5);
  });

  it('светят не более LAMP_LIGHT_LIMIT ближайших включённых; выключенная комната не светит', () => {
    const furniture = Array.from({ length: 6 }, (_, i) => inst(`f${i}`, 'floor_lamp', i < 5 ? 'on' : 'off', i * 100, 0));
    const spots = lampSpots(furniture);
    const picked = pickLamps(spots, (room) => room === 'on', { xCm: 450, zCm: 0 });
    expect(picked).toHaveLength(LAMP_LIGHT_LIMIT);
    expect(picked[0]!.instanceId).toBe('f4');
    expect(pickLamps(spots, () => false, { xCm: 0, zCm: 0 })).toHaveLength(0);
  });
});
