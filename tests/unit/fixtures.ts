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

/** Та же квартира с окном на западной стене комнаты А: z от 100 до 200 см, подоконник 90, высота 140. */
export function twoRoomApartmentWithWindow(): Apartment {
  const apartment = twoRoomApartment();
  apartment.openings.push({
    id: 'window-a',
    kind: 'window',
    wallId: 'w6',
    offsetCm: 115,
    widthCm: 100,
    heightCm: 140,
    sillCm: 90,
  });
  return apartment;
}

type Shape = Pick<CatalogItem, 'mount' | 'layer' | 'mountHeightCm'>;

/** Синтетические предметы для проверки правил размещения; не каталог. */
function synthetic(
  id: string,
  name: string,
  size: [number, number, number],
  colliders: CatalogItem['colliders'] | null = null,
  shape: Partial<Shape> = {},
): CatalogItem {
  const [width, depth, height] = size;
  return {
    id,
    version: 1,
    name,
    category: 'test',
    roomTypes: ['living', 'hallway'],
    sizeCm: { width, depth, height },
    model: { url: '', unit: 'm' },
    previewUrl: '',
    mount: 'floor',
    layer: 'object',
    colliders: colliders ?? [{ xCm: 0, zCm: 0, widthCm: width, depthCm: depth, yMinCm: 0, yMaxCm: height }],
    license: { sourceUrl: '', author: '', license: 'test', attribution: '', retrievedOn: '2026-11-13' },
    ...shape,
  };
}

const leg = (xCm: number, zCm: number) => ({ xCm, zCm, widthCm: 5, depthCm: 5, yMinCm: 0, yMaxCm: 72 });

export const testItems: Record<string, CatalogItem> = {
  // Стол 120 × 80 × 75: четыре ножки и столешница на высоте 72–75 см.
  table: synthetic('table', 'Стол', [120, 80, 75], [
    leg(-57.5, -37.5),
    leg(57.5, -37.5),
    leg(57.5, 37.5),
    leg(-57.5, 37.5),
    { xCm: 0, zCm: 0, widthCm: 120, depthCm: 80, yMinCm: 72, yMaxCm: 75 },
  ]),
  // Стул 45 × 50 × 90: сиденье до 46 см и спинка у задней стороны (локальный +Z).
  chair: synthetic('chair', 'Стул', [45, 50, 90], [
    { xCm: 0, zCm: -2.5, widthCm: 45, depthCm: 45, yMinCm: 0, yMaxCm: 46 },
    { xCm: 0, zCm: 22.5, widthCm: 45, depthCm: 5, yMinCm: 46, yMaxCm: 90 },
  ]),
  sofa: synthetic('sofa', 'Диван', [200, 90, 85]),
  bed: synthetic('bed', 'Кровать', [160, 200, 50]),
  dresser: synthetic('dresser', 'Комод', [100, 45, 85]),
  nightstand: synthetic('nightstand', 'Тумба', [45, 40, 50]),
  rug: synthetic('rug', 'Ковёр', [200, 140, 1], null, { layer: 'floor-covering' }),
  shelf: synthetic('shelf', 'Полка', [80, 25, 30], null, { mount: 'wall', mountHeightCm: 120 }),
  cabinet: synthetic('cabinet', 'Навесной шкаф', [80, 35, 70], null, { mount: 'wall', mountHeightCm: 140 }),
  ceilingLamp: synthetic('ceilingLamp', 'Люстра', [50, 50, 40], null, { mount: 'ceiling' }),
  tableLamp: synthetic('tableLamp', 'Настольная лампа', [20, 20, 40], null, { mount: 'tabletop' }),
  // Г-образный предмет: основной объём и выступ вперёд.
  corner: synthetic('corner', 'Угловой диван', [200, 160, 80], [
    { xCm: 0, zCm: -35, widthCm: 200, depthCm: 90, yMinCm: 0, yMaxCm: 80 },
    { xCm: -55, zCm: 45, widthCm: 90, depthCm: 70, yMinCm: 0, yMaxCm: 80 },
  ]),
};

export const findTestItem = (id: string): CatalogItem | undefined => testItems[id];

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
