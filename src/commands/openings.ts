import { getWall, roomsOfWall } from '../domain/rooms';
import type { Apartment, DoorOpening, Id, Opening, Room } from '../domain/types';
import { doorSwingsInto, openingSpan, roomWallFace, wallSpan } from '../geometry/openings';
import type { Change } from './history';

// Операции над проёмами на этапе настройки (SPEC §9, D-04): положение вдоль стены,
// ширина, высота, подоконник, сторона петель и направление открывания.
// Перенос на другую стену и смена связанных комнат не входят в первую версию.

export const DOOR_RANGE_CM = { width: [60, 200], height: [190, 260] } as const;
export const WINDOW_RANGE_CM = { width: [40, 300], height: [40, 260], sill: [0, 150] } as const;

/** Комната, от чистого угла которой отсчитывается положение: первая из прилегающих к стене. */
export function referenceRoom(apartment: Apartment, opening: Opening): Room | null {
  return roomsOfWall(apartment, opening.wallId)[0] ?? null;
}

/** Чистое расстояние от меньшего по координате угла комнаты до края проёма, см. */
export function openingPositionCm(apartment: Apartment, opening: Opening): number {
  const room = referenceRoom(apartment, opening);
  const face = room && roomWallFace(apartment, room, getWall(apartment, opening.wallId));
  const span = openingSpan(apartment, opening);
  return span.min - (face?.clearMin ?? wallSpan(apartment, getWall(apartment, opening.wallId)).min);
}

export interface OpeningPatch {
  positionCm?: number;
  widthCm?: number;
  heightCm?: number;
  sillCm?: number;
  hinge?: 'start' | 'end';
  swing?: 'left' | 'right';
}

function withOffset(apartment: Apartment, opening: Opening, positionCm: number, widthCm: number): number {
  const room = referenceRoom(apartment, opening);
  const wall = getWall(apartment, opening.wallId);
  const span = wallSpan(apartment, wall);
  const face = room && roomWallFace(apartment, room, wall);
  const min = (face?.clearMin ?? span.min) + positionCm;
  return span.direction === 1 ? min - span.min : span.max - widthCm - min;
}

export function updateOpening(openingId: Id, patch: OpeningPatch): Change {
  return {
    label: 'Изменение проёма',
    apply(apartment) {
      const opening = apartment.openings.find((item) => item.id === openingId);
      if (!opening) throw new Error('проём не найден');
      const numbers = [patch.positionCm, patch.widthCm, patch.heightCm, patch.sillCm].filter((v) => v !== undefined);
      if (!numbers.every((value) => Number.isFinite(value))) throw new Error('размеры проёма должны быть числами');
      const widthCm = patch.widthCm ?? opening.widthCm;
      const positionCm = patch.positionCm ?? openingPositionCm(apartment, opening);
      const next = {
        ...opening,
        widthCm,
        heightCm: patch.heightCm ?? opening.heightCm,
        offsetCm: patch.positionCm !== undefined || patch.widthCm !== undefined
          ? withOffset(apartment, opening, positionCm, widthCm) : opening.offsetCm,
      } as Opening;
      if (next.kind === 'window' && patch.sillCm !== undefined) next.sillCm = patch.sillCm;
      if (next.kind === 'door') {
        if (patch.hinge) next.hinge = patch.hinge;
        if (patch.swing) next.swing = patch.swing;
      }
      return { ...apartment, openings: apartment.openings.map((item) => (item.id === openingId ? next : item)) };
    },
  };
}

/** Куда открывается дверь при выбранном направлении: комната или null (наружу). */
export function swingTarget(apartment: Apartment, door: DoorOpening, swing: 'left' | 'right'): Room | null {
  const probe = { ...door, swing };
  return roomsOfWall(apartment, door.wallId).find((room) => doorSwingsInto(apartment, probe, room)) ?? null;
}

/** Подпись стороны петель на плане: у какого края проёма стоят петли. */
export function hingeEdgeLabel(apartment: Apartment, door: DoorOpening, hinge: 'start' | 'end'): string {
  const span = wallSpan(apartment, getWall(apartment, door.wallId));
  const atMin = (hinge === 'start') === (span.direction === 1);
  return span.alongX ? (atMin ? 'слева' : 'справа') : (atMin ? 'сверху' : 'снизу');
}

export function openingTitle(apartment: Apartment, opening: Opening): string {
  const rooms = roomsOfWall(apartment, opening.wallId).map((room) => room.name);
  const base = opening.kind === 'door'
    ? (rooms.length > 1 ? 'Дверь' : 'Входная дверь') : 'Окно';
  return `${base} · ${rooms.map((name) => `«${name}»`).join(' и ')}`;
}
