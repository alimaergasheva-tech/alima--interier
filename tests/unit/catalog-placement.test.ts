import { describe, expect, it } from 'vitest';
import { findCatalogItem } from '../../src/catalog/techCatalog';
import type { Apartment, FurnitureInstance } from '../../src/domain/types';
import { validatePlacement } from '../../src/geometry/placement';
import { TECH_ROOM_ID, createTechApartment } from '../../src/tech/techApartment';

// Проверки этапа 13.4 на настоящих карточках каталога: составные коллайдеры и опора на столешнице.

function withItem(apartment: Apartment, id: string, catalogItemId: string, xCm: number, zCm: number, elevationCm = 0): Apartment {
  const instance: FurnitureInstance = {
    id, catalogItemId, assetVersion: 1, roomId: TECH_ROOM_ID, xCm, zCm, elevationCm, rotationDeg: 0, variantId: null,
  };
  return { ...apartment, furniture: [...apartment.furniture, instance] };
}

const place = (apartment: Apartment, catalogItemId: string, xCm: number, zCm: number, rotationDeg = 0, elevationCm?: number) =>
  validatePlacement(apartment, findCatalogItem(catalogItemId)!, TECH_ROOM_ID, { xCm, zCm, rotationDeg }, {
    findItem: findCatalogItem,
    elevationCm,
  });

describe('составные коллайдеры каталога (13.4, SPEC §11.3)', () => {
  // Обеденный стол 226 × 139 см в центре комнаты; кромка со стороны меньших Z — на z = 105,5 см.
  const dining = withItem(createTechApartment(), 'table', 'dining_table', 210, 175);

  it('стул сиденьем задвинут под столешницу, спинка остаётся снаружи', () => {
    // Стул 43 × 58 см смотрит в сторону +Z (спинка к -Z): перед стола — на 25 см под столешницу.
    const result = place(dining, 'dining_chair_02', 210, 101.5);
    expect(result, result.message).toMatchObject({ valid: true });
  });

  it('стул нельзя придвинуть спинкой под столешницу', () => {
    // Спинка стула (z ≈ −24 см от центра) оказывается под столешницей при сдвиге центра стула дальше z = 130 см.
    const result = place(dining, 'dining_chair_02', 210, 140);
    expect(result).toMatchObject({ valid: false, code: 'item-overlap' });
    expect(result.message).toBe('Пересекается с предметом «Обеденный стол»');
  });

  it('стул не может стоять на ножке или в раме стола', () => {
    // Боковая рама стола занимает x ≈ 119–131 см по всей глубине.
    expect(place(dining, 'dining_chair_02', 125, 175).code).toBe('item-overlap');
  });

  it('сплошные предметы остаются одной коробкой: стул не входит в диван', () => {
    const sofa = withItem(createTechApartment(), 'sofa', 'sofa_03', 210, 100);
    expect(place(sofa, 'dining_chair_02', 210, 100).code).toBe('item-overlap');
  });
});

describe('опора на столешнице без заданной высоты (13.4)', () => {
  const withTable = withItem(createTechApartment(), 'table', 'modern_coffee_table_02', 210, 175);

  it('телевизор на журнальном столе получает высоту столешницы', () => {
    const table = findCatalogItem('modern_coffee_table_02')!;
    const result = place(withTable, 'television_02', 210, 175);
    expect(result, result.message).toMatchObject({ valid: true });
    expect(result.elevationCm).toBeGreaterThan(table.sizeCm.height - 1);
    expect(result.elevationCm).toBeLessThanOrEqual(table.sizeCm.height + 1);
  });

  it('на полу телевизор не ставится: нужна столешница', () => {
    expect(place(withTable, 'television_02', 330, 100)).toMatchObject({ valid: false, code: 'bad-support' });
  });

  it('основание, выступающее за столешницу, не получает опору', () => {
    // Журнальный стол 120 × 120 см: центр у самого края даёт выступ телевизора 40 × 35 см.
    expect(place(withTable, 'television_02', 210 + 55, 175).valid).toBe(false);
  });

  it('явно заданная высота имеет приоритет над вычисленной', () => {
    expect(place(withTable, 'television_02', 210, 175, 0, 0)).toMatchObject({ valid: false });
  });
});
