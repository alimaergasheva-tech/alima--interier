import { SCHEMA_VERSION, type Apartment } from '../domain/types';

export const TECH_ROOM_ID = 'tech-room';

/**
 * ТЕХНИЧЕСКАЯ геометрия этапа 4: одна комната 420 × 350 см (чистые размеры),
 * стены 30 см, потолок 270 см, без проёмов и мебели. Не является стартовой схемой.
 */
export function createTechApartment(): Apartment {
  return {
    id: 'tech-apartment',
    schemaVersion: SCHEMA_VERSION,
    ceilingHeightCm: 270,
    vertices: [
      { id: 'tv1', xCm: -15, zCm: -15 },
      { id: 'tv2', xCm: 435, zCm: -15 },
      { id: 'tv3', xCm: 435, zCm: 365 },
      { id: 'tv4', xCm: -15, zCm: 365 },
    ],
    walls: [
      { id: 'tw1', startVertexId: 'tv1', endVertexId: 'tv2', thicknessCm: 30 },
      { id: 'tw2', startVertexId: 'tv2', endVertexId: 'tv3', thicknessCm: 30 },
      { id: 'tw3', startVertexId: 'tv3', endVertexId: 'tv4', thicknessCm: 30 },
      { id: 'tw4', startVertexId: 'tv4', endVertexId: 'tv1', thicknessCm: 30 },
    ],
    rooms: [
      {
        id: TECH_ROOM_ID,
        type: 'living',
        name: 'Техническая комната',
        boundary: [
          { wallId: 'tw1', reversed: false },
          { wallId: 'tw2', reversed: false },
          { wallId: 'tw3', reversed: false },
          { wallId: 'tw4', reversed: false },
        ],
      },
    ],
    openings: [],
    furniture: [],
    wallFinishes: {},
  };
}
