import type { Issue } from '../domain/integrity';
import { getWall, roomAxisRect, roomsOfWall, wallSideOfRect, type RoomSide } from '../domain/rooms';
import type { Apartment, Id, Room } from '../domain/types';
import { EPS_CM } from '../domain/units';
import { openingHeights, openingSpan, roomWallFace, wallSpan } from './openings';
import { intervalsOverlap } from './polygon';

// Геометрические инварианты квартиры (SPEC §7). Выполняются после проверки целостности.

function checkRoomOverlaps(apartment: Apartment, issues: Issue[]): void {
  const rects = apartment.rooms.map((room) => ({ room, rect: roomAxisRect(apartment, room) }));
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]!;
      const b = rects[j]!;
      if (
        intervalsOverlap(a.rect.minX, a.rect.maxX, b.rect.minX, b.rect.maxX) &&
        intervalsOverlap(a.rect.minZ, a.rect.maxZ, b.rect.minZ, b.rect.maxZ)
      ) {
        issues.push({
          code: 'rooms-overlap',
          message: `Комнаты «${a.room.name}» и «${b.room.name}» накладываются друг на друга`,
          objectIds: [a.room.id, b.room.id],
        });
      }
    }
  }
}

function checkWalls(apartment: Apartment, issues: Issue[]): void {
  const { vertices, walls } = apartment;

  for (let i = 0; i < vertices.length; i++) {
    for (let j = i + 1; j < vertices.length; j++) {
      const a = vertices[i]!;
      const b = vertices[j]!;
      if (Math.hypot(a.xCm - b.xCm, a.zCm - b.zCm) <= EPS_CM) {
        issues.push({
          code: 'duplicate-vertex',
          message: `Узлы ${a.id} и ${b.id} совпадают: общий узел должен быть один`,
          objectIds: [a.id, b.id],
        });
      }
    }
  }

  const spans = walls.map((wall) => ({ wall, span: wallSpan(apartment, wall) }));
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const a = spans[i]!;
      const b = spans[j]!;
      const collinear = a.span.alongX === b.span.alongX && Math.abs(a.span.fixed - b.span.fixed) <= EPS_CM;
      if (collinear && intervalsOverlap(a.span.min, a.span.max, b.span.min, b.span.max)) {
        issues.push({
          code: 'duplicate-wall',
          message: `Стены ${a.wall.id} и ${b.wall.id} накладываются: общая стена должна быть одна`,
          objectIds: [a.wall.id, b.wall.id],
        });
      }
    }
  }

  // Узел внутри пролёта чужой стены означает, что стена не разбита в месте примыкания.
  for (const { wall, span } of spans) {
    for (const vertex of vertices) {
      if (vertex.id === wall.startVertexId || vertex.id === wall.endVertexId) continue;
      const along = span.alongX ? vertex.xCm : vertex.zCm;
      const across = span.alongX ? vertex.zCm : vertex.xCm;
      if (Math.abs(across - span.fixed) <= EPS_CM && along > span.min + EPS_CM && along < span.max - EPS_CM) {
        issues.push({
          code: 'unsplit-wall',
          message: `Стена ${wall.id} проходит через узел ${vertex.id} и должна быть разделена в нём`,
          objectIds: [wall.id, vertex.id],
        });
      }
    }
  }

  for (const wall of walls) {
    const count = roomsOfWall(apartment, wall.id).length;
    if (count === 0 || count > 2) {
      issues.push({
        code: 'orphan-wall',
        message:
          count === 0
            ? `Стена ${wall.id} не принадлежит ни одной комнате`
            : `Стена ${wall.id} принадлежит более чем двум комнатам`,
        objectIds: [wall.id],
      });
    }
  }

  // Внутренняя поверхность стороны комнаты определена, только если толщина по стороне одна.
  for (const room of apartment.rooms) {
    const rect = roomAxisRect(apartment, room);
    const bySide = new Map<RoomSide, Set<number>>();
    for (const ref of room.boundary) {
      const wall = getWall(apartment, ref.wallId);
      const side = wallSideOfRect(apartment, wall, rect);
      if (!side) continue;
      if (!bySide.has(side)) bySide.set(side, new Set());
      bySide.get(side)!.add(wall.thicknessCm);
    }
    for (const thicknesses of bySide.values()) {
      if (thicknesses.size > 1) {
        issues.push({
          code: 'wall-thickness-mismatch',
          message: `Комната «${room.name}»: стены одной стороны имеют разную толщину`,
          objectIds: [room.id],
        });
      }
    }
  }
}

function openingName(kind: 'door' | 'window'): string {
  return kind === 'door' ? 'Дверь' : 'Окно';
}

function checkOpenings(apartment: Apartment, issues: Issue[]): void {
  const spans = apartment.openings.map((opening) => ({
    opening,
    span: openingSpan(apartment, opening),
    heights: openingHeights(opening),
    rooms: roomsOfWall(apartment, opening.wallId),
  }));

  for (const { opening, span, heights, rooms } of spans) {
    const wall = getWall(apartment, opening.wallId);
    const name = openingName(opening.kind);

    // Проём целиком лежит на чистом участке стены в каждой прилегающей комнате.
    for (const room of rooms) {
      const face = roomWallFace(apartment, room, wall);
      if (face && (span.min < face.clearMin - EPS_CM || span.max > face.clearMax + EPS_CM)) {
        issues.push({
          code: 'opening-outside-wall',
          message: `${name} выходит за пределы стены в комнате «${room.name}»`,
          objectIds: [opening.id, room.id],
        });
        break;
      }
    }

    if (heights.max > apartment.ceilingHeightCm + EPS_CM) {
      issues.push({
        code: 'opening-too-tall',
        message: `${name} выше потолка (${Math.round(heights.max)} см при потолке ${Math.round(apartment.ceilingHeightCm)} см)`,
        objectIds: [opening.id],
      });
    }

    if (opening.kind === 'window' && rooms.length > 1) {
      issues.push({
        code: 'window-on-inner-wall',
        message: 'Окно может стоять только на внешней стене',
        objectIds: [opening.id],
      });
    }
  }

  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const a = spans[i]!;
      const b = spans[j]!;
      if (a.opening.wallId !== b.opening.wallId) continue;
      if (
        intervalsOverlap(a.span.min, a.span.max, b.span.min, b.span.max) &&
        intervalsOverlap(a.heights.min, a.heights.max, b.heights.min, b.heights.max)
      ) {
        issues.push({
          code: 'openings-overlap',
          message: `${openingName(a.opening.kind)} пересекается с другим проёмом на той же стене`,
          objectIds: [a.opening.id, b.opening.id],
        });
      }
    }
  }
}

/** Комнаты по обе стороны двери. У входной двери комната одна. */
export function doorRooms(apartment: Apartment, doorId: Id): Room[] {
  const door = apartment.openings.find((opening) => opening.id === doorId && opening.kind === 'door');
  return door ? roomsOfWall(apartment, door.wallId) : [];
}

/** Комната по другую сторону двери; null — дверь входная и ведёт наружу. */
export function roomBehindDoor(apartment: Apartment, doorId: Id, fromRoomId: Id): Room | null {
  return doorRooms(apartment, doorId).find((room) => room.id !== fromRoomId) ?? null;
}

/** Входные двери: стоят на внешней стене и ведут наружу. */
export function entranceDoorIds(apartment: Apartment): Id[] {
  return apartment.openings
    .filter((opening) => opening.kind === 'door' && roomsOfWall(apartment, opening.wallId).length === 1)
    .map((opening) => opening.id);
}

function checkPassages(apartment: Apartment, issues: Issue[]): void {
  const [first, ...rest] = apartment.rooms;
  if (!first || rest.length === 0) return;

  const links = new Map<Id, Set<Id>>(apartment.rooms.map((room) => [room.id, new Set<Id>()]));
  for (const opening of apartment.openings) {
    if (opening.kind !== 'door') continue;
    const rooms = roomsOfWall(apartment, opening.wallId);
    if (rooms.length === 2) {
      links.get(rooms[0]!.id)!.add(rooms[1]!.id);
      links.get(rooms[1]!.id)!.add(rooms[0]!.id);
    }
  }

  // Обход начинается от помещения с входной дверью, если она есть.
  const entrance = entranceDoorIds(apartment)[0];
  const start = (entrance && doorRooms(apartment, entrance)[0]) || first;
  const reached = new Set<Id>([start.id]);
  const queue = [start.id];
  while (queue.length > 0) {
    for (const next of links.get(queue.shift()!) ?? []) {
      if (!reached.has(next)) {
        reached.add(next);
        queue.push(next);
      }
    }
  }
  for (const room of apartment.rooms) {
    if (!reached.has(room.id)) {
      issues.push({
        code: 'rooms-disconnected',
        message: `В помещение «${room.name}» нет прохода через двери`,
        objectIds: [room.id],
      });
    }
  }
}

export function validateGeometry(apartment: Apartment): Issue[] {
  const issues: Issue[] = [];
  checkRoomOverlaps(apartment, issues);
  checkWalls(apartment, issues);
  checkOpenings(apartment, issues);
  checkPassages(apartment, issues);
  return issues;
}
