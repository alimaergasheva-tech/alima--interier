import {
  getWall,
  roomAxisRect,
  roomClearRect,
  wallEnds,
  wallSideOfRect,
  type RoomSide,
} from '../domain/rooms';
import type { Apartment, DoorOpening, Id, Opening, Room, Wall } from '../domain/types';
import type { Point } from './polygon';

// Геометрия проёмов и запрещённых зон двери (SPEC §11.3, D-06).

export const DOOR_THRESHOLD_DEPTH_CM = 30;
const ARC_SEGMENTS = 12;

export interface AxisSpan {
  /** true — стена идёт вдоль оси X, false — вдоль Z. */
  alongX: boolean;
  /** Координата оси стены поперёк её направления. */
  fixed: number;
  min: number;
  max: number;
  /** +1, если стена направлена от начала к концу в сторону роста координаты. */
  direction: 1 | -1;
}

export function wallSpan(apartment: Apartment, wall: Wall): AxisSpan {
  const [a, b] = wallEnds(apartment, wall);
  const alongX = Math.abs(b.xCm - a.xCm) >= Math.abs(b.zCm - a.zCm);
  const from = alongX ? a.xCm : a.zCm;
  const to = alongX ? b.xCm : b.zCm;
  return {
    alongX,
    fixed: alongX ? a.zCm : a.xCm,
    min: Math.min(from, to),
    max: Math.max(from, to),
    direction: to >= from ? 1 : -1,
  };
}

/** Интервал проёма вдоль стены в глобальных координатах. */
export function openingSpan(apartment: Apartment, opening: Opening): AxisSpan {
  const wall = wallSpan(apartment, getWall(apartment, opening.wallId));
  const near = wall.direction === 1 ? wall.min + opening.offsetCm : wall.max - opening.offsetCm;
  const far = near + wall.direction * opening.widthCm;
  return { ...wall, min: Math.min(near, far), max: Math.max(near, far) };
}

/** Вертикальный диапазон проёма от пола. */
export function openingHeights(opening: Opening): { min: number; max: number } {
  const sill = opening.kind === 'window' ? opening.sillCm : 0;
  return { min: sill, max: sill + opening.heightCm };
}

export interface RoomWallFace {
  side: RoomSide;
  /** Координата внутренней поверхности стены со стороны комнаты. */
  surface: number;
  /** Нормаль внутрь комнаты. */
  normal: { x: number; z: number };
  /** Чистый интервал комнаты вдоль стены. */
  clearMin: number;
  clearMax: number;
}

/** Внутренняя поверхность стены со стороны комнаты; null — стена не на границе комнаты. */
export function roomWallFace(apartment: Apartment, room: Room, wall: Wall): RoomWallFace | null {
  const side = wallSideOfRect(apartment, wall, roomAxisRect(apartment, room));
  if (!side) return null;
  const clear = roomClearRect(apartment, room);
  switch (side) {
    case 'minX':
      return { side, surface: clear.minX, normal: { x: 1, z: 0 }, clearMin: clear.minZ, clearMax: clear.maxZ };
    case 'maxX':
      return { side, surface: clear.maxX, normal: { x: -1, z: 0 }, clearMin: clear.minZ, clearMax: clear.maxZ };
    case 'minZ':
      return { side, surface: clear.minZ, normal: { x: 0, z: 1 }, clearMin: clear.minX, clearMax: clear.maxX };
    case 'maxZ':
      return { side, surface: clear.maxZ, normal: { x: 0, z: -1 }, clearMin: clear.minX, clearMax: clear.maxX };
  }
}

/**
 * Направление «влево», если идти вдоль стены от начала к концу и смотреть на план сверху
 * (ось Z на плане направлена вниз).
 */
function leftNormal(span: AxisSpan): { x: number; z: number } {
  return span.alongX ? { x: 0, z: -span.direction } : { x: span.direction, z: 0 };
}

/** Комната, в которую открывается створка; null — наружу или в соседнее помещение не из списка. */
export function doorSwingsInto(apartment: Apartment, door: DoorOpening, room: Room): boolean {
  const wall = getWall(apartment, door.wallId);
  const face = roomWallFace(apartment, room, wall);
  if (!face) return false;
  const left = leftNormal(wallSpan(apartment, wall));
  const sign = door.swing === 'left' ? 1 : -1;
  return (left.x * face.normal.x + left.z * face.normal.z) * sign > 0;
}

export interface DoorZone {
  doorId: Id;
  kind: 'threshold' | 'swing';
  polygon: Point[];
  heightCm: number;
}

/**
 * Запрещённые для мебели зоны дверей комнаты: прямоугольник глубиной 30 см перед проёмом
 * и, со стороны открывания, сектор в четверть круга радиусом в ширину двери.
 * Дуга заменена вписанной ломаной из 12 звеньев (отклонение меньше 0,3 см при двери 100 см).
 */
export function doorZones(apartment: Apartment, room: Room): DoorZone[] {
  const zones: DoorZone[] = [];
  for (const opening of apartment.openings) {
    if (opening.kind !== 'door') continue;
    if (!room.boundary.some((ref) => ref.wallId === opening.wallId)) continue;
    const wall = getWall(apartment, opening.wallId);
    const face = roomWallFace(apartment, room, wall);
    if (!face) continue;
    const span = openingSpan(apartment, opening);
    const alongX = span.alongX;
    // Точка: t — вдоль стены, h — расстояние от поверхности вглубь комнаты.
    const point = (t: number, h: number): Point =>
      alongX
        ? { xCm: t, zCm: face.surface + face.normal.z * h }
        : { xCm: face.surface + face.normal.x * h, zCm: t };

    zones.push({
      doorId: opening.id,
      kind: 'threshold',
      heightCm: opening.heightCm,
      polygon: [
        point(span.min, 0),
        point(span.max, 0),
        point(span.max, DOOR_THRESHOLD_DEPTH_CM),
        point(span.min, DOOR_THRESHOLD_DEPTH_CM),
      ],
    });

    if (doorSwingsInto(apartment, opening, room)) {
      const hingeAtMin = (opening.hinge === 'start') === (span.direction === 1);
      const hinge = hingeAtMin ? span.min : span.max;
      const toward = hingeAtMin ? 1 : -1;
      const polygon: Point[] = [point(hinge, 0)];
      for (let i = 0; i <= ARC_SEGMENTS; i++) {
        const angle = (i / ARC_SEGMENTS) * (Math.PI / 2);
        polygon.push(
          point(hinge + toward * opening.widthCm * Math.cos(angle), opening.widthCm * Math.sin(angle)),
        );
      }
      zones.push({ doorId: opening.id, kind: 'swing', heightCm: opening.heightCm, polygon });
    }
  }
  return zones;
}
