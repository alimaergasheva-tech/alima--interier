import type { Apartment, Id, Room, Vertex, Wall } from './types';
import { EPS_CM } from './units';

// Вычисляемая геометрия. Ничего из этого файла не хранится в проекте (SPEC §6).

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type RoomSide = 'minX' | 'maxX' | 'minZ' | 'maxZ';

export function rectWidth(rect: Rect): number {
  return rect.maxX - rect.minX;
}

export function rectDepth(rect: Rect): number {
  return rect.maxZ - rect.minZ;
}

export function rectArea(rect: Rect): number {
  return rectWidth(rect) * rectDepth(rect);
}

function find<T extends { id: Id }>(items: T[], id: Id, kind: string): T {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`${kind} ${id} не найден(а)`);
  return item;
}

export function getVertex(apartment: Apartment, id: Id): Vertex {
  return find(apartment.vertices, id, 'Узел');
}

export function getWall(apartment: Apartment, id: Id): Wall {
  return find(apartment.walls, id, 'Стена');
}

export function getRoom(apartment: Apartment, id: Id): Room {
  return find(apartment.rooms, id, 'Комната');
}

export function wallEnds(apartment: Apartment, wall: Wall): [Vertex, Vertex] {
  return [getVertex(apartment, wall.startVertexId), getVertex(apartment, wall.endVertexId)];
}

export function wallLengthCm(apartment: Apartment, wall: Wall): number {
  const [a, b] = wallEnds(apartment, wall);
  return Math.hypot(b.xCm - a.xCm, b.zCm - a.zCm);
}

/** Прямоугольник комнаты по осям стен. */
export function roomAxisRect(apartment: Apartment, room: Room): Rect {
  const rect: Rect = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const ref of room.boundary) {
    for (const vertex of wallEnds(apartment, getWall(apartment, ref.wallId))) {
      rect.minX = Math.min(rect.minX, vertex.xCm);
      rect.maxX = Math.max(rect.maxX, vertex.xCm);
      rect.minZ = Math.min(rect.minZ, vertex.zCm);
      rect.maxZ = Math.max(rect.maxZ, vertex.zCm);
    }
  }
  return rect;
}

/** На какой стороне прямоугольника комнаты лежит стена; null — стена не на границе. */
export function wallSideOfRect(apartment: Apartment, wall: Wall, rect: Rect): RoomSide | null {
  const [a, b] = wallEnds(apartment, wall);
  const near = (p: number, q: number) => Math.abs(p - q) <= EPS_CM;
  if (near(a.xCm, b.xCm)) {
    if (near(a.xCm, rect.minX)) return 'minX';
    if (near(a.xCm, rect.maxX)) return 'maxX';
  }
  if (near(a.zCm, b.zCm)) {
    if (near(a.zCm, rect.minZ)) return 'minZ';
    if (near(a.zCm, rect.maxZ)) return 'maxZ';
  }
  return null;
}

/** Толщина стен по сторонам комнаты (наибольшая на каждой стороне). */
export function roomSideThickness(apartment: Apartment, room: Room): Record<RoomSide, number> {
  const axis = roomAxisRect(apartment, room);
  const thickness: Record<RoomSide, number> = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  for (const ref of room.boundary) {
    const wall = getWall(apartment, ref.wallId);
    const side = wallSideOfRect(apartment, wall, axis);
    if (side) thickness[side] = Math.max(thickness[side], wall.thicknessCm);
  }
  return thickness;
}

/**
 * Чистовой прямоугольник пола: расстояния между внутренними поверхностями стен.
 * Единственный способ получить внутренние поверхности для 2D, 3D и проверок (SPEC §7).
 */
export function roomClearRect(apartment: Apartment, room: Room): Rect {
  const axis = roomAxisRect(apartment, room);
  const t = roomSideThickness(apartment, room);
  return {
    minX: axis.minX + t.minX / 2,
    maxX: axis.maxX - t.maxX / 2,
    minZ: axis.minZ + t.minZ / 2,
    maxZ: axis.maxZ - t.maxZ / 2,
  };
}

/** Прямоугольник комнаты вместе с полной толщиной её стен. */
export function roomOuterRect(apartment: Apartment, room: Room): Rect {
  const axis = roomAxisRect(apartment, room);
  const t = roomSideThickness(apartment, room);
  return {
    minX: axis.minX - t.minX / 2,
    maxX: axis.maxX + t.maxX / 2,
    minZ: axis.minZ - t.minZ / 2,
    maxZ: axis.maxZ + t.maxZ / 2,
  };
}

export function roomNetAreaCm2(apartment: Apartment, room: Room): number {
  return rectArea(roomClearRect(apartment, room));
}

// Правило площадей (SPEC §5.2): два разных показателя с разными подписями.
export const NET_AREA_LABEL = 'Сумма площадей помещений';
export const OUTER_AREA_LABEL = 'Площадь по внешнему контуру (со стенами)';

/** Сумма чистых площадей помещений. Используется в стартовом подборе схемы. */
export function totalNetAreaCm2(apartment: Apartment): number {
  return apartment.rooms.reduce((sum, room) => sum + roomNetAreaCm2(apartment, room), 0);
}

/** Площадь объединения прямоугольников (сжатие координат). */
export function unionAreaCm2(rects: Rect[]): number {
  const xs = [...new Set(rects.flatMap((r) => [r.minX, r.maxX]))].sort((a, b) => a - b);
  const zs = [...new Set(rects.flatMap((r) => [r.minZ, r.maxZ]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    for (let j = 0; j + 1 < zs.length; j++) {
      const x0 = xs[i]!;
      const x1 = xs[i + 1]!;
      const z0 = zs[j]!;
      const z1 = zs[j + 1]!;
      const covered = rects.some(
        (r) => r.minX <= x0 && r.maxX >= x1 && r.minZ <= z0 && r.maxZ >= z1,
      );
      if (covered) area += (x1 - x0) * (z1 - z0);
    }
  }
  return area;
}

/** Площадь по внешнему контуру, включая стены. */
export function outerContourAreaCm2(apartment: Apartment): number {
  return unionAreaCm2(apartment.rooms.map((room) => roomOuterRect(apartment, room)));
}

/** Комнаты, прилегающие к стене: выводятся из границ комнат, в стене не хранятся. */
export function roomsOfWall(apartment: Apartment, wallId: Id): Room[] {
  return apartment.rooms.filter((room) => room.boundary.some((ref) => ref.wallId === wallId));
}

/** Стабильный ключ внутренней поверхности: пара «стена + комната». */
export function wallSurfaceKey(wallId: Id, roomId: Id): string {
  return `${wallId}:${roomId}`;
}
