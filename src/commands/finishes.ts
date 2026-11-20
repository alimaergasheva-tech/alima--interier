import { findFinish } from '../catalog/finishes';
import { getRoom, getWall, roomAxisRect, wallSideOfRect, wallSurfaceKey, type RoomSide } from '../domain/rooms';
import type { Apartment, Id } from '../domain/types';
import type { Change } from './history';

// Отделка внутренних поверхностей (SPEC §13, AC-11). Ключ — стабильная пара «стена + комната»:
// сторона общей перегородки в соседней комнате остаётся независимой.

export function wallSideOfRoom(apartment: Apartment, roomId: Id, wallId: Id): RoomSide | null {
  const room = getRoom(apartment, roomId);
  return wallSideOfRect(apartment, getWall(apartment, wallId), roomAxisRect(apartment, room));
}

/** Все стены комнаты на той же стороне, что и выбранная: сторона покрывается отделкой целиком. */
export function sideWallIds(apartment: Apartment, roomId: Id, wallId: Id): Id[] {
  const side = wallSideOfRoom(apartment, roomId, wallId);
  if (!side) return [wallId];
  const room = getRoom(apartment, roomId);
  const rect = roomAxisRect(apartment, room);
  return room.boundary.map((ref) => ref.wallId)
    .filter((id) => wallSideOfRect(apartment, getWall(apartment, id), rect) === side);
}

/** Материал стороны: отделка первой стены; у согласованно покрашенной стороны она одна. */
export function sideFinishId(apartment: Apartment, roomId: Id, wallId: Id): Id | null {
  return apartment.wallFinishes[wallSurfaceKey(sideWallIds(apartment, roomId, wallId)[0]!, roomId)] ?? null;
}

/** Назначает материал стороне комнаты; null снимает отделку. Другая сторона перегородки не меняется. */
export function setSideFinish(roomId: Id, wallId: Id, materialId: Id | null): Change {
  return {
    label: materialId ? 'Отделка стены' : 'Снятие отделки',
    apply(apartment) {
      if (materialId && !findFinish(materialId)) throw new Error(`материал ${materialId} не найден в каталоге`);
      const finishes = { ...apartment.wallFinishes };
      for (const id of sideWallIds(apartment, roomId, wallId)) {
        const key = wallSurfaceKey(id, roomId);
        if (materialId) finishes[key] = materialId;
        else delete finishes[key];
      }
      return { ...apartment, wallFinishes: finishes };
    },
  };
}

/** Покрытие пола комнаты (D-16, задача 23); null возвращает пол по умолчанию. Входит в историю отмены. */
export function setRoomFloor(roomId: Id, materialId: Id | null): Change {
  return {
    label: materialId ? 'Покрытие пола' : 'Снятие покрытия пола',
    apply(apartment) {
      getRoom(apartment, roomId);
      if (materialId && findFinish(materialId)?.kind !== 'floor') throw new Error(`покрытие пола ${materialId} не найдено в каталоге`);
      const floors = { ...(apartment.floorFinishes ?? {}) };
      if (materialId) floors[roomId] = materialId;
      else delete floors[roomId];
      return { ...apartment, floorFinishes: floors };
    },
  };
}

/** Физический повтор рисунка: сколько раз текстура укладывается на 1 м стены. 1 единица UV = 1 м. */
export function textureRepeatPerMeter(tileSizeCm: { width: number; height: number }): { x: number; y: number } {
  return { x: 100 / tileSizeCm.width, y: 100 / tileSizeCm.height };
}
