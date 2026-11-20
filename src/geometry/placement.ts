import { getRoom, roomClearRect } from '../domain/rooms';
import type { Apartment, CatalogItem, ColliderBox, Id } from '../domain/types';
import { EPS_CM } from '../domain/units';

// Общий валидатор размещения для 2D и 3D (SPEC §11.2). На этапе 4 проверяется
// выход за комнату; пересечения предметов, проёмы и опора добавляются на этапе 5.

export interface Point {
  xCm: number;
  zCm: number;
}

export interface Pose extends Point {
  /** Поворот вокруг вертикальной оси, как rotation.y в сцене. */
  rotationDeg: number;
}

export type PlacementCode =
  | 'ok'
  | 'outside-room'
  | 'item-overlap'
  | 'opening-conflict'
  | 'bad-support'
  | 'invalid-data';

export interface PlacementResult {
  valid: boolean;
  code: PlacementCode;
  /** Текстовая причина для пользователя; цвет не единственный сигнал. */
  message: string;
  conflictIds: Id[];
}

export const PLACEMENT_OK: PlacementResult = { valid: true, code: 'ok', message: '', conflictIds: [] };

/**
 * Поворот локальной точки вокруг вертикальной оси. Совпадает с rotation.y
 * в Three.js: ось X при положительном угле поворачивается к −Z.
 */
export function rotateLocal(xCm: number, zCm: number, rotationDeg: number): Point {
  const angle = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { xCm: xCm * cos + zCm * sin, zCm: -xCm * sin + zCm * cos };
}

/** Углы основания коллайдера в глобальных координатах. */
export function colliderCorners(box: ColliderBox, pose: Pose): Point[] {
  const hx = box.widthCm / 2;
  const hz = box.depthCm / 2;
  const local: Array<[number, number]> = [
    [-hx, -hz],
    [hx, -hz],
    [hx, hz],
    [-hx, hz],
  ];
  return local.map(([dx, dz]) => {
    const rotated = rotateLocal(box.xCm + dx, box.zCm + dz, pose.rotationDeg);
    return { xCm: pose.xCm + rotated.xCm, zCm: pose.zCm + rotated.zCm };
  });
}

export function snapCm(value: number, stepCm: number): number {
  return Math.round(value / stepCm) * stepCm;
}

export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export function validatePlacement(
  apartment: Apartment,
  item: CatalogItem,
  roomId: Id,
  pose: Pose,
): PlacementResult {
  if (![pose.xCm, pose.zCm, pose.rotationDeg].every(Number.isFinite)) {
    return { valid: false, code: 'invalid-data', message: 'Некорректное положение предмета', conflictIds: [] };
  }
  const room = apartment.rooms.find((candidate) => candidate.id === roomId);
  if (!room) {
    return { valid: false, code: 'invalid-data', message: 'Комната не найдена', conflictIds: [roomId] };
  }

  // Комната и коллайдеры выпуклые, поэтому достаточно проверить все углы каждого коллайдера.
  // Касание стены без проникновения допустимо (допуск EPS_CM).
  const clear = roomClearRect(apartment, getRoom(apartment, roomId));
  for (const box of item.colliders) {
    for (const corner of colliderCorners(box, pose)) {
      const outside =
        corner.xCm < clear.minX - EPS_CM ||
        corner.xCm > clear.maxX + EPS_CM ||
        corner.zCm < clear.minZ - EPS_CM ||
        corner.zCm > clear.maxZ + EPS_CM;
      if (outside) {
        return {
          valid: false,
          code: 'outside-room',
          message: 'Предмет выходит за стену',
          conflictIds: [roomId],
        };
      }
    }
  }
  return PLACEMENT_OK;
}
