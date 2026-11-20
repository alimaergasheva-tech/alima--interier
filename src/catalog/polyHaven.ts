import type { AssetLicense, ColliderBox } from '../domain/types';

/** Лицензия модели Poly Haven (CC0): указание авторства не требуется. */
export function polyHaven(id: string, author: string): AssetLicense {
  return {
    sourceUrl: `https://polyhaven.com/a/${id}`,
    author,
    license: 'CC0 1.0',
    attribution: 'Не требуется',
    retrievedOn: '2026-11-16',
  };
}

/** Собственная модель проекта, создана scripts/gen-modern-models.mjs; передана как CC0 1.0. */
export function ownModel(): AssetLicense {
  return {
    sourceUrl: 'scripts/gen-modern-models.mjs',
    author: 'Проект alima (собственная модель)',
    license: 'CC0 1.0',
    attribution: 'Не требуется',
    retrievedOn: '2026-11-19',
  };
}

/** Один прямоугольный коллайдер по габаритам модели (упрощённый объём, SPEC §11.2). */
export function box(width: number, depth: number, height: number): ColliderBox[] {
  return [{ xCm: 0, zCm: 0, widthCm: width, depthCm: depth, yMinCm: 0, yMaxCm: height }];
}
