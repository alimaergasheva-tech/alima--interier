import type { AssetLicense, CatalogItem, Id } from '../domain/types';

// ТЕХНИЧЕСКИЙ каталог этапа 4: три реальные модели для проверки импорта и масштаба.
// Не является утверждённым ассортиментом (SPEC D-07, §12). Источники — ASSETS.md.

function polyHaven(id: string, author: string): AssetLicense {
  return {
    sourceUrl: `https://polyhaven.com/a/${id}`,
    author,
    license: 'CC0 1.0',
    attribution: 'Не требуется',
    retrievedOn: '2026-11-13',
  };
}

function box(width: number, depth: number, height: number) {
  return [{ xCm: 0, zCm: 0, widthCm: width, depthCm: depth, yMinCm: 0, yMaxCm: height }];
}

// Габариты измерены скриптом scripts/measure-model.mjs и округлены до сантиметра.
export const techCatalog: CatalogItem[] = [
  {
    id: 'sofa_03',
    version: 1,
    name: 'Диван',
    category: 'Мягкая мебель',
    roomTypes: ['living', 'kitchen-living'],
    sizeCm: { width: 273, depth: 93, height: 112 },
    model: { url: '/models/sofa_03/sofa_03.gltf', unit: 'm' },
    previewUrl: '',
    mount: 'floor',
    layer: 'object',
    colliders: box(273, 93, 112),
    license: polyHaven('sofa_03', 'Fran Calvente'),
  },
  {
    id: 'modern_arm_chair_01',
    version: 1,
    name: 'Кресло',
    category: 'Мягкая мебель',
    roomTypes: ['living', 'kitchen-living', 'bedroom'],
    sizeCm: { width: 82, depth: 99, height: 102 },
    model: { url: '/models/modern_arm_chair_01/modern_arm_chair_01.gltf', unit: 'm' },
    previewUrl: '',
    mount: 'floor',
    layer: 'object',
    colliders: box(82, 99, 102),
    license: polyHaven('modern_arm_chair_01', 'Vibrant Nordic'),
  },
  {
    id: 'modern_coffee_table_01',
    version: 1,
    name: 'Журнальный стол',
    category: 'Столы',
    roomTypes: ['living', 'kitchen-living'],
    sizeCm: { width: 60, depth: 120, height: 39 },
    model: { url: '/models/modern_coffee_table_01/modern_coffee_table_01.gltf', unit: 'm' },
    previewUrl: '',
    mount: 'floor',
    layer: 'object',
    colliders: box(60, 120, 39),
    license: polyHaven('modern_coffee_table_01', 'Amin'),
  },
];

export function findCatalogItem(id: Id): CatalogItem | undefined {
  return techCatalog.find((item) => item.id === id);
}
