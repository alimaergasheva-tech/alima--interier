import { getRoom, getWall, roomClearRect } from '../domain/rooms';
import type { Apartment, CatalogItem, ColliderBox, Id, Room } from '../domain/types';
import { EPS_CM } from '../domain/units';
import { doorZones, openingHeights, openingSpan, roomWallFace, type RoomWallFace } from './openings';
import { intervalsOverlap, polygonsOverlap, type Point } from './polygon';

// Общий валидатор размещения для 2D и 3D (SPEC §11.2, §11.3).
// Проверяет фактические коллайдеры с поворотом и высотой, а не центр предмета.

export type { Point };

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
  /** Высота опорной точки над полом, которую задаёт способ установки. */
  elevationCm: number;
}

export interface PlacementOptions {
  /** Поиск карточек других предметов; без него пересечения предметов не проверяются. */
  findItem?: (id: Id) => CatalogItem | undefined;
  /** Предмет, который перемещается: с самим собой он не сравнивается. */
  ignoreId?: Id;
  /** Высота для установки на столешницу. */
  elevationCm?: number;
}

function fail(code: PlacementCode, message: string, conflictIds: Id[] = [], elevationCm = 0): PlacementResult {
  return { valid: false, code, message, conflictIds, elevationCm };
}

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

/** Угол предмета, задняя сторона которого (локальная ось −Z) лежит на стене. */
export function wallFacingDeg(face: RoomWallFace): number {
  switch (face.side) {
    case 'minZ':
      return 0;
    case 'minX':
      return 90;
    case 'maxZ':
      return 180;
    case 'maxX':
      return 270;
  }
}

function roomFaces(apartment: Apartment, room: Room): Array<{ wallId: Id; face: RoomWallFace }> {
  const faces: Array<{ wallId: Id; face: RoomWallFace }> = [];
  for (const ref of room.boundary) {
    const face = roomWallFace(apartment, room, getWall(apartment, ref.wallId));
    if (face) faces.push({ wallId: ref.wallId, face });
  }
  return faces;
}

/**
 * Положение настенного предмета у ближайшей стены: предмет скользит вдоль неё,
 * угол задаёт стена. Используется при переносе.
 */
export function snapToNearestWall(apartment: Apartment, item: CatalogItem, roomId: Id, point: Point): Pose {
  const room = getRoom(apartment, roomId);
  const clear = roomClearRect(apartment, room);
  const half = item.sizeCm.depth / 2;
  const candidates: Array<{ distance: number; pose: Pose }> = [
    { distance: point.zCm - clear.minZ, pose: { xCm: point.xCm, zCm: clear.minZ + half, rotationDeg: 0 } },
    { distance: point.xCm - clear.minX, pose: { xCm: clear.minX + half, zCm: point.zCm, rotationDeg: 90 } },
    { distance: clear.maxZ - point.zCm, pose: { xCm: point.xCm, zCm: clear.maxZ - half, rotationDeg: 180 } },
    { distance: clear.maxX - point.xCm, pose: { xCm: clear.maxX - half, zCm: point.zCm, rotationDeg: 270 } },
  ];
  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]!.pose;
}

interface WorldCollider {
  polygon: Point[];
  yMin: number;
  yMax: number;
}

function worldColliders(item: CatalogItem, pose: Pose, elevationCm: number): WorldCollider[] {
  return item.colliders.map((box) => ({
    polygon: colliderCorners(box, pose),
    yMin: elevationCm + box.yMinCm,
    yMax: elevationCm + box.yMaxCm,
  }));
}

function itemHeight(item: CatalogItem): number {
  return Math.max(...item.colliders.map((box) => box.yMaxCm), item.sizeCm.height);
}

function collidersIntersect(a: WorldCollider[], b: WorldCollider[]): boolean {
  return a.some((p) =>
    b.some((q) => intervalsOverlap(p.yMin, p.yMax, q.yMin, q.yMax) && polygonsOverlap(p.polygon, q.polygon)),
  );
}

/** Стена, на которой висит предмет: задняя плоскость на поверхности и угол по стене. */
function findMountFace(
  apartment: Apartment,
  room: Room,
  item: CatalogItem,
  pose: Pose,
): { wallIds: Id[]; face: RoomWallFace } | null {
  const half = item.sizeCm.depth / 2;
  const faces = roomFaces(apartment, room);
  for (const { face } of faces) {
    const angleOff = Math.abs(normalizeDeg(pose.rotationDeg - wallFacingDeg(face) + 180) - 180);
    if (angleOff > 1e-6) continue;
    const across = face.normal.x !== 0 ? pose.xCm : pose.zCm;
    const expected = face.surface + (face.normal.x + face.normal.z) * half;
    if (Math.abs(across - expected) > EPS_CM) continue;
    return { face, wallIds: faces.filter((entry) => entry.face.side === face.side).map((entry) => entry.wallId) };
  }
  return null;
}

export function validatePlacement(
  apartment: Apartment,
  item: CatalogItem,
  roomId: Id,
  pose: Pose,
  options: PlacementOptions = {},
): PlacementResult {
  if (![pose.xCm, pose.zCm, pose.rotationDeg].every(Number.isFinite)) {
    return fail('invalid-data', 'Некорректное положение предмета');
  }
  const room = apartment.rooms.find((candidate) => candidate.id === roomId);
  if (!room) return fail('invalid-data', 'Комната не найдена', [roomId]);

  const height = itemHeight(item);
  const isCovering = item.layer === 'floor-covering';

  // 1. Опора и высота установки.
  let elevationCm = 0;
  let mount: ReturnType<typeof findMountFace> = null;
  if (item.mount === 'wall') {
    elevationCm = item.mountHeightCm ?? 0;
    mount = findMountFace(apartment, room, item, pose);
    if (!mount) return fail('bad-support', 'Предмет нужно повесить на стену', [], elevationCm);
  } else if (item.mount === 'ceiling') {
    elevationCm = apartment.ceilingHeightCm - height;
  } else if (item.mount === 'tabletop') {
    elevationCm = options.elevationCm ?? 0;
  }
  if (elevationCm < -EPS_CM || elevationCm + height > apartment.ceilingHeightCm + EPS_CM) {
    return fail('bad-support', 'Предмет не помещается по высоте', [], elevationCm);
  }

  const own = worldColliders(item, pose, elevationCm);

  // 2. Полная принадлежность комнате. Комната и коллайдеры выпуклые, поэтому достаточно
  // всех углов каждого коллайдера. Касание стены без проникновения допустимо.
  const clear = roomClearRect(apartment, room);
  for (const collider of own) {
    for (const corner of collider.polygon) {
      const outside =
        corner.xCm < clear.minX - EPS_CM ||
        corner.xCm > clear.maxX + EPS_CM ||
        corner.zCm < clear.minZ - EPS_CM ||
        corner.zCm > clear.maxZ + EPS_CM;
      if (outside) return fail('outside-room', 'Предмет выходит за стену', [roomId], elevationCm);
    }
  }

  // 3. Настенный предмет не может висеть на оконном или дверном проёме.
  if (mount) {
    const along = mount.face.normal.x !== 0 ? pose.zCm : pose.xCm;
    const half = item.sizeCm.width / 2;
    for (const opening of apartment.openings) {
      if (!mount.wallIds.includes(opening.wallId)) continue;
      const span = openingSpan(apartment, opening);
      const heights = openingHeights(opening);
      if (
        intervalsOverlap(along - half, along + half, span.min, span.max) &&
        intervalsOverlap(elevationCm, elevationCm + height, heights.min, heights.max)
      ) {
        return fail(
          'opening-conflict',
          opening.kind === 'door' ? 'Предмет нельзя вешать на дверной проём' : 'Предмет нельзя вешать на окно',
          [opening.id],
          elevationCm,
        );
      }
    }
  }

  // 4. Дверной проём и зона открывания створки. Покрытия пола лежать в зоне двери могут.
  if (!isCovering) {
    for (const zone of doorZones(apartment, room)) {
      const hit = own.some(
        (collider) =>
          intervalsOverlap(collider.yMin, collider.yMax, 0, zone.heightCm) &&
          polygonsOverlap(collider.polygon, zone.polygon),
      );
      if (hit) {
        return fail(
          'opening-conflict',
          zone.kind === 'threshold' ? 'Предмет перекрывает дверной проём' : 'Предмет стоит в зоне открывания двери',
          [zone.doorId],
          elevationCm,
        );
      }
    }
  }

  // 5. Другие предметы комнаты. Решают фактические коллайдеры и диапазоны высот:
  // стул под столешницей и полка над комодом допустимы, если объёмы не пересекаются.
  const { findItem } = options;
  let supported = item.mount !== 'tabletop';
  if (findItem) {
    for (const other of apartment.furniture) {
      if (other.id === options.ignoreId || other.roomId !== roomId) continue;
      const otherItem = findItem(other.catalogItemId);
      if (!otherItem) continue;
      const otherCovering = otherItem.layer === 'floor-covering';

      if (isCovering !== otherCovering) continue; // ковёр под мебелью разрешён
      const theirs = worldColliders(otherItem, other, other.elevationCm);
      if (isCovering) {
        if (own.some((p) => theirs.some((q) => polygonsOverlap(p.polygon, q.polygon)))) {
          return fail('item-overlap', 'Покрытие лежит поверх другого покрытия', [other.id], elevationCm);
        }
        continue;
      }
      if (collidersIntersect(own, theirs)) {
        return fail('item-overlap', `Пересекается с предметом «${otherItem.name}»`, [other.id], elevationCm);
      }

      // Опора для предмета на столешнице: верх другого предмета на нужной высоте под всем основанием.
      if (!supported) {
        const top = theirs.filter((collider) => Math.abs(collider.yMax - elevationCm) <= EPS_CM);
        const rests = top.some((surface) =>
          own.every((collider) => collider.polygon.every((corner) => insidePolygon(corner, surface.polygon))),
        );
        if (rests) supported = true;
      }
    }
  }
  if (!supported) return fail('bad-support', 'Предмет нужно поставить на столешницу', [], elevationCm);

  return { valid: true, code: 'ok', message: '', conflictIds: [], elevationCm };
}

/** Точка внутри выпуклого многоугольника или на его границе. */
function insidePolygon(point: Point, polygon: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const cross = (b.xCm - a.xCm) * (point.zCm - a.zCm) - (b.zCm - a.zCm) * (point.xCm - a.xCm);
    if (Math.abs(cross) <= EPS_CM) continue;
    const current = cross > 0 ? 1 : -1;
    if (sign === 0) sign = current;
    else if (sign !== current) return false;
  }
  return true;
}
