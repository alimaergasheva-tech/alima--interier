import { findFinish } from '../catalog/finishes';
import { roomAxisRect, rectDepth, rectWidth, wallSideOfRect, type RoomSide } from './rooms';
import type { Apartment, Id, Room } from './types';
import { EPS_CM } from './units';

// Проверка целостности данных квартиры. Геометрические проверки наложений,
// проёмов и мебели добавляются на этапе 5 и подключаются к тому же контракту.

export type IssueCode =
  | 'invalid-number'
  | 'duplicate-id'
  | 'broken-reference'
  | 'degenerate-wall'
  | 'wall-not-axis-aligned'
  | 'room-not-closed'
  | 'room-not-rectangular'
  | 'room-degenerate'
  | 'rooms-overlap'
  | 'duplicate-vertex'
  | 'duplicate-wall'
  | 'unsplit-wall'
  | 'orphan-wall'
  | 'wall-thickness-mismatch'
  | 'opening-outside-wall'
  | 'opening-too-tall'
  | 'openings-overlap'
  | 'window-on-inner-wall'
  | 'rooms-disconnected'
  | 'size-out-of-range'
  | 'furniture-conflict';

export interface Issue {
  code: IssueCode;
  /** Текст для пользователя: называет объект и причину. */
  message: string;
  objectIds: Id[];
}

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function checkRoom(apartment: Apartment, room: Room, issues: Issue[]): void {
  const walls = new Map(apartment.walls.map((wall) => [wall.id, wall]));
  const refs = room.boundary;
  if (refs.length < 4 || refs.some((ref) => !walls.has(ref.wallId))) {
    issues.push({
      code: 'broken-reference',
      message: `Комната «${room.name}»: граница ссылается на отсутствующую стену или неполна`,
      objectIds: [room.id],
    });
    return;
  }

  const startOf = (index: number): Id => {
    const ref = refs[index]!;
    const wall = walls.get(ref.wallId)!;
    return ref.reversed ? wall.endVertexId : wall.startVertexId;
  };
  const endOf = (index: number): Id => {
    const ref = refs[index]!;
    const wall = walls.get(ref.wallId)!;
    return ref.reversed ? wall.startVertexId : wall.endVertexId;
  };
  for (let i = 0; i < refs.length; i++) {
    if (endOf(i) !== startOf((i + 1) % refs.length)) {
      issues.push({
        code: 'room-not-closed',
        message: `Комната «${room.name}»: граница не замкнута`,
        objectIds: [room.id, refs[i]!.wallId],
      });
      return;
    }
  }

  const rect = roomAxisRect(apartment, room);
  if (rectWidth(rect) <= EPS_CM || rectDepth(rect) <= EPS_CM) {
    issues.push({
      code: 'room-degenerate',
      message: `Комната «${room.name}»: нулевая площадь`,
      objectIds: [room.id],
    });
    return;
  }

  // Прямоугольность (D-01): каждая стена лежит на стороне прямоугольника,
  // и стены каждой стороны покрывают её целиком.
  const covered: Record<RoomSide, number> = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  for (const ref of refs) {
    const wall = walls.get(ref.wallId)!;
    const side = wallSideOfRect(apartment, wall, rect);
    if (!side) {
      issues.push({
        code: 'room-not-rectangular',
        message: `Комната «${room.name}»: форма не прямоугольная`,
        objectIds: [room.id, wall.id],
      });
      return;
    }
    const a = apartment.vertices.find((v) => v.id === wall.startVertexId)!;
    const b = apartment.vertices.find((v) => v.id === wall.endVertexId)!;
    covered[side] += Math.hypot(b.xCm - a.xCm, b.zCm - a.zCm);
  }
  const expected: Record<RoomSide, number> = {
    minX: rectDepth(rect),
    maxX: rectDepth(rect),
    minZ: rectWidth(rect),
    maxZ: rectWidth(rect),
  };
  for (const side of Object.keys(expected) as RoomSide[]) {
    if (Math.abs(covered[side] - expected[side]) > EPS_CM) {
      issues.push({
        code: 'room-not-rectangular',
        message: `Комната «${room.name}»: форма не прямоугольная`,
        objectIds: [room.id],
      });
      return;
    }
  }
}

export function validateIntegrity(apartment: Apartment): Issue[] {
  const issues: Issue[] = [];

  const seen = new Set<Id>();
  const all = [
    ...apartment.vertices,
    ...apartment.walls,
    ...apartment.rooms,
    ...apartment.openings,
    ...apartment.furniture,
  ];
  for (const { id } of all) {
    if (seen.has(id)) {
      issues.push({ code: 'duplicate-id', message: `Повторяющийся идентификатор ${id}`, objectIds: [id] });
    }
    seen.add(id);
  }

  if (!positive(apartment.ceilingHeightCm)) {
    issues.push({
      code: 'invalid-number',
      message: 'Высота потолка должна быть положительным числом',
      objectIds: [apartment.id],
    });
  }

  const vertices = new Map(apartment.vertices.map((vertex) => [vertex.id, vertex]));
  for (const vertex of apartment.vertices) {
    if (!Number.isFinite(vertex.xCm) || !Number.isFinite(vertex.zCm)) {
      issues.push({
        code: 'invalid-number',
        message: `Узел ${vertex.id}: некорректные координаты`,
        objectIds: [vertex.id],
      });
    }
  }
  // С некорректными узлами дальнейшие вычисления теряют смысл.
  if (issues.length > 0) return issues;

  let wallsOk = true;
  for (const wall of apartment.walls) {
    const a = vertices.get(wall.startVertexId);
    const b = vertices.get(wall.endVertexId);
    if (!a || !b) {
      issues.push({
        code: 'broken-reference',
        message: `Стена ${wall.id} ссылается на отсутствующий узел`,
        objectIds: [wall.id],
      });
      wallsOk = false;
      continue;
    }
    if (!positive(wall.thicknessCm)) {
      issues.push({
        code: 'invalid-number',
        message: `Стена ${wall.id}: толщина должна быть положительным числом`,
        objectIds: [wall.id],
      });
    }
    const dx = Math.abs(b.xCm - a.xCm);
    const dz = Math.abs(b.zCm - a.zCm);
    if (Math.hypot(dx, dz) <= EPS_CM) {
      issues.push({
        code: 'degenerate-wall',
        message: `Стена ${wall.id} имеет нулевую длину`,
        objectIds: [wall.id],
      });
      wallsOk = false;
    } else if (dx > EPS_CM && dz > EPS_CM) {
      issues.push({
        code: 'wall-not-axis-aligned',
        message: `Стена ${wall.id} не параллельна осям: в первой версии комнаты прямоугольные`,
        objectIds: [wall.id],
      });
      wallsOk = false;
    }
  }

  if (wallsOk) {
    for (const room of apartment.rooms) checkRoom(apartment, room, issues);
  }

  const wallIds = new Set(apartment.walls.map((wall) => wall.id));
  for (const opening of apartment.openings) {
    if (!wallIds.has(opening.wallId)) {
      issues.push({
        code: 'broken-reference',
        message: `Проём ${opening.id} ссылается на отсутствующую стену`,
        objectIds: [opening.id],
      });
    }
    const numbers = [opening.widthCm, opening.heightCm];
    const sillOk = opening.kind !== 'window' || (Number.isFinite(opening.sillCm) && opening.sillCm >= 0);
    const offsetOk = Number.isFinite(opening.offsetCm);
    const rooms = wallIds.has(opening.wallId)
      ? ` в комнате «${apartment.rooms.filter((room) => room.boundary.some((ref) => ref.wallId === opening.wallId)).map((room) => room.name).join('» и «')}»` : '';
    if (offsetOk && opening.offsetCm < 0) {
      issues.push({
        code: 'opening-outside-wall',
        message: `${opening.kind === 'door' ? 'Дверь' : 'Окно'} выходит за пределы стены${rooms}`,
        objectIds: [opening.id],
      });
    } else if (!numbers.every(positive) || !sillOk || !offsetOk) {
      issues.push({
        code: 'invalid-number',
        message: `Проём ${opening.id}: некорректные размеры или положение`,
        objectIds: [opening.id],
      });
    }
  }

  const roomIds = new Set(apartment.rooms.map((room) => room.id));
  for (const item of apartment.furniture) {
    if (!roomIds.has(item.roomId)) {
      issues.push({
        code: 'broken-reference',
        message: `Предмет ${item.id} ссылается на отсутствующую комнату`,
        objectIds: [item.id],
      });
    }
    if (![item.xCm, item.zCm, item.elevationCm, item.rotationDeg].every(Number.isFinite)) {
      issues.push({
        code: 'invalid-number',
        message: `Предмет ${item.id}: некорректное положение или угол`,
        objectIds: [item.id],
      });
    }
  }

  for (const key of Object.keys(apartment.wallFinishes)) {
    const [wallId, finishRoomId] = key.split(':');
    const room = apartment.rooms.find((candidate) => candidate.id === finishRoomId);
    if (!room || !wallIds.has(wallId ?? '') || !room.boundary.some((ref) => ref.wallId === wallId)) {
      issues.push({
        code: 'broken-reference',
        message: `Отделка ${key} ссылается на несуществующую поверхность стены`,
        objectIds: [key],
      });
    }
  }

  for (const [floorRoomId, materialId] of Object.entries(apartment.floorFinishes ?? {})) {
    const material = findFinish(materialId);
    if (!apartment.rooms.some((candidate) => candidate.id === floorRoomId) || material?.kind !== 'floor') {
      issues.push({
        code: 'broken-reference',
        message: `Покрытие пола ${floorRoomId} ссылается на несуществующую комнату или материал`,
        objectIds: [floorRoomId],
      });
    }
  }

  return issues;
}
