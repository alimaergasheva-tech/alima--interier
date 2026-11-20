import { SCHEMA_VERSION, type Apartment, type CatalogItem } from '../../src/domain/types';

/**
 * Техническая квартира для тестов, не стартовая схема.
 * Комната А 400 × 300 см и коридор Б 200 × 300 см (чистые размеры),
 * внешние стены 30 см, общая перегородка w7 толщиной 10 см, дверь в ней.
 *
 *   v1 ──w1── v2 ──w2── v3
 *   │         │         │
 *   w6   А    w7   Б    w3
 *   │         │         │
 *   v6 ──w5── v5 ──w4── v4
 */
export function twoRoomApartment(): Apartment {
  return {
    id: 'apt-test',
    schemaVersion: SCHEMA_VERSION,
    ceilingHeightCm: 270,
    vertices: [
      { id: 'v1', xCm: -15, zCm: -15 },
      { id: 'v2', xCm: 405, zCm: -15 },
      { id: 'v3', xCm: 625, zCm: -15 },
      { id: 'v4', xCm: 625, zCm: 315 },
      { id: 'v5', xCm: 405, zCm: 315 },
      { id: 'v6', xCm: -15, zCm: 315 },
    ],
    walls: [
      { id: 'w1', startVertexId: 'v1', endVertexId: 'v2', thicknessCm: 30 },
      { id: 'w2', startVertexId: 'v2', endVertexId: 'v3', thicknessCm: 30 },
      { id: 'w3', startVertexId: 'v3', endVertexId: 'v4', thicknessCm: 30 },
      { id: 'w4', startVertexId: 'v4', endVertexId: 'v5', thicknessCm: 30 },
      { id: 'w5', startVertexId: 'v5', endVertexId: 'v6', thicknessCm: 30 },
      { id: 'w6', startVertexId: 'v6', endVertexId: 'v1', thicknessCm: 30 },
      { id: 'w7', startVertexId: 'v2', endVertexId: 'v5', thicknessCm: 10 },
    ],
    rooms: [
      {
        id: 'room-a',
        type: 'living',
        name: 'Комната А',
        boundary: [
          { wallId: 'w1', reversed: false },
          { wallId: 'w7', reversed: false },
          { wallId: 'w5', reversed: false },
          { wallId: 'w6', reversed: false },
        ],
      },
      {
        id: 'room-b',
        type: 'hallway',
        name: 'Коридор Б',
        boundary: [
          { wallId: 'w2', reversed: false },
          { wallId: 'w3', reversed: false },
          { wallId: 'w4', reversed: false },
          { wallId: 'w7', reversed: true },
        ],
      },
    ],
    openings: [
      {
        id: 'door-ab',
        kind: 'door',
        wallId: 'w7',
        offsetCm: 125,
        widthCm: 80,
        heightCm: 210,
        hinge: 'start',
        swing: 'left',
      },
    ],
    furniture: [],
    wallFinishes: {},
  };
}

/** Технический предмет шириной 100 см; не входит в утверждённый каталог. */
export function testItem(unit: CatalogItem['model']['unit']): CatalogItem {
  return {
    id: `test-box-${unit}`,
    version: 1,
    name: 'Тестовый предмет',
    category: 'test',
    roomTypes: ['living'],
    sizeCm: { width: 100, depth: 50, height: 80 },
    model: { url: '', unit },
    previewUrl: '',
    mount: 'floor',
    layer: 'object',
    colliders: [{ xCm: 0, zCm: 0, widthCm: 100, depthCm: 50, yMinCm: 0, yMaxCm: 80 }],
    license: { sourceUrl: '', author: '', license: 'test', attribution: '', retrievedOn: '2026-11-13' },
  };
}
