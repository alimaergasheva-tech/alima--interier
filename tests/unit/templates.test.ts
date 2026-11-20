import { describe, expect, it } from 'vitest';
import { validateIntegrity } from '../../src/domain/integrity';
import { totalNetAreaCm2 } from '../../src/domain/rooms';
import { validateGeometry } from '../../src/geometry/apartmentChecks';
import { roomsOfWall } from '../../src/domain/rooms';
import { validateSetupLimits } from '../../src/commands/setup';
import { roomsWithoutExternalWall } from '../../src/layouts/windows';
import { layoutTemplates, rankTemplates, templateAreaCm2 } from '../../src/layouts/templates';

describe('десять стартовых схем', () => {
  it('все схемы пустые, связные и проходят валидатор', () => {
    expect(layoutTemplates).toHaveLength(10);
    for (const template of layoutTemplates) {
      expect(template.apartment.furniture).toEqual([]);
      expect(validateIntegrity(template.apartment)).toEqual([]);
      expect(validateGeometry(template.apartment)).toEqual([]);
      expect(templateAreaCm2(template)).toBe(totalNetAreaCm2(template.apartment));
      expect(template.apartment.openings.some((opening) => opening.id === 'entrance')).toBe(true);
      const living = template.apartment.rooms.filter((room) => ['living', 'bedroom', 'kitchen-living'].includes(room.type));
      expect(living).toHaveLength(template.livingRooms);
    }
  });

  it('все схемы укладываются в пределы размеров настройки', () => {
    for (const template of layoutTemplates) expect(validateSetupLimits(template.apartment)).toEqual([]);
  });

  it('ранжирует только схемы нужной комнатности по рассчитанной площади', () => {
    for (const count of [1, 2, 3, 4] as const) {
      for (const template of layoutTemplates.filter((item) => item.livingRooms === count)) {
        expect(rankTemplates(count, templateAreaCm2(template) / 10_000)[0]?.id).toBe(template.id);
      }
    }
  });

  it('схема 4А: отдельный вход из коридора, санузлы, гардеробные, балконы, потолок 350 см', () => {
    const apartment = layoutTemplates.find((item) => item.id === '4a')!.apartment;
    expect(apartment.ceilingHeightCm).toBe(350);
    const byKey = (key: string) => apartment.rooms.find((room) => room.id === `room-${key}`)!;
    const doorsOf = (key: string) => apartment.openings.filter((o) => o.kind === 'door'
      && roomsOfWall(apartment, o.wallId).some((room) => room.id === byKey(key).id));
    const neighbours = (key: string) => doorsOf(key).flatMap((o) => roomsOfWall(apartment, o.wallId))
      .map((room) => room.id.replace('room-', '')).filter((name) => name !== key).sort();
    for (const key of ['master', 'kids', 'study', 'living', 'kitchen']) expect(neighbours(key)).toContain('corridor');
    expect(neighbours('master-bath')).toEqual(['master']);
    expect(neighbours('master-wardrobe')).toEqual(['master']);
    expect(neighbours('kids-bath')).toEqual(['kids']);
    expect(neighbours('living-balcony')).toEqual(['living']);
    expect(neighbours('kitchen-balcony')).toEqual(['kitchen']);
    expect(neighbours('storage')).toEqual(['corridor']);
    expect(neighbours('hidden-wardrobe')).toEqual(['hall']);
    expect(neighbours('guest-wc')).toEqual(['hall']);
    expect(neighbours('hall').sort()).toEqual(['corridor', 'guest-wc', 'hidden-wardrobe']);
    expect(apartment.openings.filter((o) => o.id === 'entrance')).toHaveLength(1);
  });

  it('витражные окна во всех комнатах, где есть внешняя стена (D-22)', () => {
    for (const template of layoutTemplates) {
      const { apartment } = template;
      const inner = new Set(roomsWithoutExternalWall(apartment).map((room) => room.id));
      for (const room of apartment.rooms) {
        const windows = apartment.openings.filter((o) => o.kind === 'window'
          && roomsOfWall(apartment, o.wallId).some((r) => r.id === room.id));
        if (inner.has(room.id)) expect(windows, `${template.id}: ${room.name} без внешней стены`).toHaveLength(0);
        else expect(windows.length, `${template.id}: ${room.name}`).toBeGreaterThan(0);
      }
      for (const opening of apartment.openings.filter((o) => o.kind === 'window')) {
        expect(opening.kind === 'window' && opening.glass).toBe('stained');
      }
      // Запрос 19.11.2026: окна доходят до потолка.
      for (const opening of apartment.openings.filter((o) => o.kind === 'window')) {
        expect(opening.kind === 'window' && opening.sillCm + opening.heightCm, `${template.id}: ${opening.id}`).toBeCloseTo(apartment.ceilingHeightCm, 5);
      }
    }
  });
});
