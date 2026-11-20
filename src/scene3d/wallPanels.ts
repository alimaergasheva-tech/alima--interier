import { Shape } from 'three';
import { getRoom, getWall, roomClearRect, roomOuterRect, type RoomSide } from '../domain/rooms';
import type { Apartment, Id, Opening } from '../domain/types';
import { cmToScene } from '../domain/units';
import { openingHeights, openingSpan, roomWallFace } from '../geometry/openings';

// Панели стен активной комнаты (SPEC §10.2): слэб стороны комнаты с настоящими
// отверстиями под двери и окна. Все размеры — из общей модели, на границе сцены в метрах.

export interface PanelOpening {
  id: Id;
  kind: Opening['kind'];
  stained: boolean;
  /** Положение вдоль стены в глобальных координатах, см. */
  uMinCm: number;
  uMaxCm: number;
  yMinCm: number;
  yMaxCm: number;
}

export interface WallPanel {
  side: RoomSide;
  alongX: boolean;
  /** Диапазон панели вдоль стены, см. */
  uMinCm: number;
  uMaxCm: number;
  thicknessCm: number;
  heightCm: number;
  /** Глобальная координата начала выдавливания (см): z для сторон по X, x — для сторон по Z. */
  originCm: number;
  /** Наружная нормаль: панель скрывается, когда камера смотрит на неё снаружи. */
  normal: [number, number];
  /** Центр панели в плане, см. */
  centerCm: { x: number; z: number };
  openings: PanelOpening[];
  /** Стены комнаты на этой стороне: отделка назначается им всем вместе. */
  wallIds: Id[];
}

export function buildWallPanels(apartment: Apartment, roomId: Id): WallPanel[] {
  const room = getRoom(apartment, roomId);
  const clear = roomClearRect(apartment, room);
  const outer = roomOuterRect(apartment, room);
  const height = apartment.ceilingHeightCm;
  const openingsOn = (side: RoomSide): PanelOpening[] => apartment.openings.flatMap((opening) => {
    const wall = getWall(apartment, opening.wallId);
    if (!room.boundary.some((ref) => ref.wallId === wall.id)) return [];
    if (roomWallFace(apartment, room, wall)?.side !== side) return [];
    const span = openingSpan(apartment, opening);
    const heights = openingHeights(opening);
    return [{ id: opening.id, kind: opening.kind, stained: opening.kind === 'window' && opening.glass === 'stained', uMinCm: span.min, uMaxCm: span.max,
      yMinCm: heights.min, yMaxCm: Math.min(heights.max, height) }];
  });
  const wallsOn = (side: RoomSide): Id[] => room.boundary
    .filter((ref) => roomWallFace(apartment, room, getWall(apartment, ref.wallId))?.side === side).map((ref) => ref.wallId);
  const midX = (clear.minX + clear.maxX) / 2;
  const midZ = (outer.minZ + outer.maxZ) / 2;
  return [
    { side: 'minX', alongX: false, uMinCm: outer.minZ, uMaxCm: outer.maxZ, thicknessCm: clear.minX - outer.minX,
      heightCm: height, originCm: clear.minX, normal: [-1, 0],
      centerCm: { x: (outer.minX + clear.minX) / 2, z: midZ }, openings: openingsOn('minX'), wallIds: wallsOn('minX') },
    { side: 'maxX', alongX: false, uMinCm: outer.minZ, uMaxCm: outer.maxZ, thicknessCm: outer.maxX - clear.maxX,
      heightCm: height, originCm: outer.maxX, normal: [1, 0],
      centerCm: { x: (outer.maxX + clear.maxX) / 2, z: midZ }, openings: openingsOn('maxX'), wallIds: wallsOn('maxX') },
    { side: 'minZ', alongX: true, uMinCm: clear.minX, uMaxCm: clear.maxX, thicknessCm: clear.minZ - outer.minZ,
      heightCm: height, originCm: outer.minZ, normal: [0, -1],
      centerCm: { x: midX, z: (outer.minZ + clear.minZ) / 2 }, openings: openingsOn('minZ'), wallIds: wallsOn('minZ') },
    { side: 'maxZ', alongX: true, uMinCm: clear.minX, uMaxCm: clear.maxX, thicknessCm: outer.maxZ - clear.maxZ,
      heightCm: height, originCm: clear.maxZ, normal: [0, 1],
      centerCm: { x: midX, z: (outer.maxZ + clear.maxZ) / 2 }, openings: openingsOn('maxZ'), wallIds: wallsOn('maxZ') },
  ];
}

/**
 * Контур панели в единицах сцены: x — положение вдоль стены, y — высота.
 * Двери вырезаются из нижней кромки, окна — отверстия внутри контура.
 */
export function buildWallShape(panel: WallPanel): Shape {
  const m = cmToScene;
  const u0 = m(panel.uMinCm);
  const u1 = m(panel.uMaxCm);
  const h = m(panel.heightCm);
  const doors = panel.openings.filter((o) => o.yMinCm <= 0).sort((a, b) => a.uMinCm - b.uMinCm);
  const shape = new Shape();
  shape.moveTo(u0, 0);
  for (const door of doors) {
    shape.lineTo(m(door.uMinCm), 0);
    shape.lineTo(m(door.uMinCm), m(door.yMaxCm));
    shape.lineTo(m(door.uMaxCm), m(door.yMaxCm));
    shape.lineTo(m(door.uMaxCm), 0);
  }
  shape.lineTo(u1, 0);
  shape.lineTo(u1, h);
  shape.lineTo(u0, h);
  shape.closePath();
  for (const win of panel.openings.filter((o) => o.yMinCm > 0)) {
    const hole = new Shape();
    const top = Math.min(m(win.yMaxCm), h - 0.001);
    hole.moveTo(m(win.uMinCm), m(win.yMinCm));
    hole.lineTo(m(win.uMaxCm), m(win.yMinCm));
    hole.lineTo(m(win.uMaxCm), top);
    hole.lineTo(m(win.uMinCm), top);
    hole.closePath();
    shape.holes.push(hole);
  }
  return shape;
}
