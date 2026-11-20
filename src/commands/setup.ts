import { findCatalogItem } from '../catalog/techCatalog';
import type { Issue } from '../domain/integrity';
import { getRoom, getWall, rectDepth, rectWidth, roomClearRect, roomsOfWall } from '../domain/rooms';
import type { Apartment, Id } from '../domain/types';
import { EPS_CM } from '../domain/units';
import { wallSpan } from '../geometry/openings';
import { createApartmentValidator } from '../geometry/validateApartment';
import { DOOR_RANGE_CM, WINDOW_RANGE_CM } from './openings';
import { proposeChange, type Change, type Proposal, type Validator } from './history';

// Операции этапа настройки квартиры (SPEC §9, D-03): сдвиг прямой стены целиком
// и высота потолка. Всё идёт через общий контракт «кандидат → проверка → применение».

/** Пределы SPEC §3.2. */
export const ROOM_SIZE_RANGE_CM = { min: 80, max: 1500 } as const;
export const CEILING_RANGE_CM = { min: 220, max: 400 } as const;

/** Прямая стена: цепочка соприкасающихся коллинеарных стен, которая сдвигается целиком. */
export interface WallLine {
  /** Координата, которая меняется при сдвиге: перпендикулярно стене. */
  moveAxis: 'x' | 'z';
  /** Положение линии по оси сдвига, см. */
  coordCm: number;
  wallIds: Id[];
  vertexIds: Id[];
}

export function wallLine(apartment: Apartment, wallId: Id): WallLine {
  const base = wallSpan(apartment, getWall(apartment, wallId));
  const collinear = apartment.walls.filter((wall) => {
    const span = wallSpan(apartment, wall);
    return span.alongX === base.alongX && Math.abs(span.fixed - base.fixed) <= EPS_CM;
  });
  const chain = new Set<Id>([wallId]);
  const queue = [getWall(apartment, wallId)];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const other of collinear) {
      if (chain.has(other.id)) continue;
      const touches = [other.startVertexId, other.endVertexId]
        .some((id) => id === current.startVertexId || id === current.endVertexId);
      if (touches) {
        chain.add(other.id);
        queue.push(other);
      }
    }
  }
  const vertexIds = new Set<Id>();
  for (const wall of apartment.walls) {
    if (!chain.has(wall.id)) continue;
    vertexIds.add(wall.startVertexId);
    vertexIds.add(wall.endVertexId);
  }
  return {
    moveAxis: base.alongX ? 'z' : 'x',
    coordCm: base.fixed,
    wallIds: [...chain],
    vertexIds: [...vertexIds],
  };
}

/**
 * Сдвигает стену вместе со всей её прямой на deltaCm вдоль оси сдвига.
 * Противоположные стены остаются на месте. Проёмы на сдвигаемых стенах едут со стеной;
 * проёмы на примыкающих стенах остаются на прежнем месте плана (SPEC §9).
 */
export function shiftWall(wallId: Id, deltaCm: number): Change {
  return {
    label: 'Сдвиг стены',
    apply(apartment) {
      if (!Number.isFinite(deltaCm)) throw new Error('сдвиг должен быть числом');
      const line = wallLine(apartment, wallId);
      const moved = new Set(line.vertexIds);
      const vertices = apartment.vertices.map((vertex) => {
        if (!moved.has(vertex.id)) return vertex;
        return line.moveAxis === 'x'
          ? { ...vertex, xCm: vertex.xCm + deltaCm }
          : { ...vertex, zCm: vertex.zCm + deltaCm };
      });
      const before = new Map(apartment.vertices.map((vertex) => [vertex.id, vertex]));
      const after = new Map(vertices.map((vertex) => [vertex.id, vertex]));
      const openings = apartment.openings.map((opening) => {
        const wall = getWall(apartment, opening.wallId);
        if (line.wallIds.includes(wall.id)) return opening;
        const span = wallSpan(apartment, wall);
        const start = before.get(wall.startVertexId)!;
        const next = after.get(wall.startVertexId)!;
        const shift = span.alongX ? next.xCm - start.xCm : next.zCm - start.zCm;
        if (shift === 0) return opening;
        return { ...opening, offsetCm: opening.offsetCm - span.direction * shift };
      });
      return { ...apartment, vertices, openings };
    },
  };
}

export function setCeilingHeight(heightCm: number): Change {
  return {
    label: 'Высота потолка',
    apply(apartment) {
      if (!Number.isFinite(heightCm)) throw new Error('высота потолка должна быть числом');
      return { ...apartment, ceilingHeightCm: heightCm };
    },
  };
}

/** Предел высоты потолка (SPEC §3.2); проверяется раньше остальных причин. */
export function validateCeilingLimits(apartment: Apartment): Issue[] {
  const { min, max } = CEILING_RANGE_CM;
  if (apartment.ceilingHeightCm >= min - EPS_CM && apartment.ceilingHeightCm <= max + EPS_CM) return [];
  return [{
    code: 'size-out-of-range',
    message: `Высота потолка ${Math.round(apartment.ceilingHeightCm)} см вне допустимых ${min}–${max} см`,
    objectIds: [apartment.id],
  }];
}

/** Пределы размеров проёмов (SPEC §3.2); проверяются раньше остальных причин. */
export function validateOpeningLimits(apartment: Apartment): Issue[] {
  const issues: Issue[] = [];
  for (const opening of apartment.openings) {
    const name = opening.kind === 'door' ? 'Дверь' : 'Окно';
    const checks: Array<[string, number, readonly [number, number]]> = opening.kind === 'door'
      ? [['ширина', opening.widthCm, DOOR_RANGE_CM.width], ['высота', opening.heightCm, DOOR_RANGE_CM.height]]
      : [['ширина', opening.widthCm, WINDOW_RANGE_CM.width], ['высота', opening.heightCm, WINDOW_RANGE_CM.height],
        ['подоконник', opening.sillCm, WINDOW_RANGE_CM.sill]];
    for (const [label, value, [min, max]] of checks) {
      if (value < min - EPS_CM || value > max + EPS_CM) {
        issues.push({
          code: 'size-out-of-range',
          message: `${name}: ${label} ${Math.round(value)} см вне допустимых ${min}–${max} см`,
          objectIds: [opening.id],
        });
      }
    }
  }
  return issues;
}

/** Пределы размеров комнат (SPEC §3.2). Вызывается после общей проверки. */
export function validateSetupLimits(apartment: Apartment): Issue[] {
  const issues: Issue[] = [];
  for (const room of apartment.rooms) {
    const clear = roomClearRect(apartment, room);
    for (const [label, size] of [['ширина', rectWidth(clear)], ['длина', rectDepth(clear)]] as const) {
      if (size < ROOM_SIZE_RANGE_CM.min - EPS_CM || size > ROOM_SIZE_RANGE_CM.max + EPS_CM) {
        issues.push({
          code: 'size-out-of-range',
          message: `Комната «${room.name}»: ${label} ${Math.round(size)} см вне допустимых ${ROOM_SIZE_RANGE_CM.min}–${ROOM_SIZE_RANGE_CM.max} см`,
          objectIds: [room.id],
        });
      }
    }
  }
  return issues;
}

export function withSetupLimits(base: Validator): Validator {
  return (apartment) => {
    const early = [...validateCeilingLimits(apartment), ...validateOpeningLimits(apartment)];
    if (early.length > 0) return early;
    const issues = base(apartment);
    return issues.length > 0 ? issues : validateSetupLimits(apartment);
  };
}

/** Проверка, используемая на этапе настройки. */
export const setupValidator: Validator = withSetupLimits(createApartmentValidator(findCatalogItem));

export interface RoomSizeChange {
  roomId: Id;
  name: string;
  before: { widthCm: number; depthCm: number };
  after: { widthCm: number; depthCm: number };
}

export interface SetupPreview {
  proposal: Proposal;
  rooms: RoomSizeChange[];
}

/** Предпросмотр: кандидат, причины отказа и затронутые комнаты с прежними и новыми размерами. */
export function previewChange(apartment: Apartment, change: Change, validate: Validator = setupValidator): SetupPreview {
  const proposal = proposeChange(apartment, change, validate);
  const size = (source: Apartment, roomId: Id) => {
    const rect = roomClearRect(source, getRoom(source, roomId));
    return { widthCm: rectWidth(rect), depthCm: rectDepth(rect) };
  };
  const rooms = proposal.issues.length > 0 ? [] : proposal.affectedRoomIds.map((roomId) => ({
    roomId,
    name: getRoom(proposal.candidate, roomId).name,
    before: size(apartment, roomId),
    after: size(proposal.candidate, roomId),
  }));
  return { proposal, rooms };
}

/** Текущий чистый размер комнаты вдоль оси сдвига стены, см. */
export function roomSizeAlongLine(apartment: Apartment, wallId: Id, roomId: Id): number {
  const clear = roomClearRect(apartment, getRoom(apartment, roomId));
  return wallLine(apartment, wallId).moveAxis === 'x' ? rectWidth(clear) : rectDepth(clear);
}

/** Сдвиг стены в см, при котором чистый размер комнаты вдоль оси сдвига станет newSizeCm. */
export function shiftForRoomSize(apartment: Apartment, wallId: Id, roomId: Id, newSizeCm: number): number {
  const room = getRoom(apartment, roomId);
  const line = wallLine(apartment, wallId);
  const clear = roomClearRect(apartment, room);
  const current = roomSizeAlongLine(apartment, wallId, roomId);
  const centre = line.moveAxis === 'x' ? (clear.minX + clear.maxX) / 2 : (clear.minZ + clear.maxZ) / 2;
  // Стена с большей координатой, чем центр комнаты, растит комнату при сдвиге в плюс.
  const sign = line.coordCm > centre ? 1 : -1;
  return sign * (newSizeCm - current);
}

/** Комнаты, прилегающие к выбранной стене или к её прямой. */
export function roomsOfWallLine(apartment: Apartment, wallId: Id) {
  const line = wallLine(apartment, wallId);
  const seen = new Set<Id>();
  return line.wallIds.flatMap((id) => roomsOfWall(apartment, id)).filter((room) => {
    if (seen.has(room.id)) return false;
    seen.add(room.id);
    return true;
  });
}
