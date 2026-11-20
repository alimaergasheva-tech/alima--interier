import { getWall, roomsOfWall, wallLengthCm } from '../domain/rooms';
import type { Apartment, Room, RoomType, WindowOpening } from '../domain/types';
import { openingSpan, roomWallFace, wallSpan } from '../geometry/openings';

// D-22 и запрос 19.11.2026: витражные окна доходят до потолка (верх проёма = высота потолка).
// D-22: витражные окна во всех комнатах, у которых есть внешняя стена. Окно ставится на
// самый длинный свободный участок внешней стены; внутренние помещения остаются без окон.

interface WindowSize { widthCm: number; heightCm: number; sillCm: number }

const SMALL: RoomType[] = ['combined-bathroom', 'bathroom', 'toilet', 'wardrobe'];
const MARGIN_CM = 15;

/** Окна доходят до потолка: верх проёма на высоте потолка, подоконник по типу комнаты. */
function windowSize(room: Room, ceilingCm: number): WindowSize {
  if (SMALL.includes(room.type)) return { widthCm: 60, heightCm: ceilingCm - 130, sillCm: 130 };
  if (room.type === 'balcony') return { widthCm: 150, heightCm: ceilingCm - 90, sillCm: 90 };
  return { widthCm: 120, heightCm: ceilingCm - 90, sillCm: 90 };
}

/** Делает остекление всех окон витражным и добавляет окна в комнаты с внешней стеной, где их нет. */
export function addStainedWindows(apartment: Apartment): Apartment {
  apartment.openings = apartment.openings.map((opening) => (opening.kind === 'window'
    ? { ...opening, glass: 'stained' as const, heightCm: apartment.ceilingHeightCm - opening.sillCm } : opening));
  for (const room of apartment.rooms) {
    const hasWindow = apartment.openings.some((opening) => opening.kind === 'window'
      && room.boundary.some((ref) => ref.wallId === opening.wallId));
    if (hasWindow) continue;
    const size = windowSize(room, apartment.ceilingHeightCm);
    let best: { wallId: string; min: number; length: number; direction: 1 | -1; spanMin: number; spanMax: number } | null = null;
    for (const ref of room.boundary) {
      const wall = getWall(apartment, ref.wallId);
      if (roomsOfWall(apartment, wall.id).length !== 1) continue;
      const face = roomWallFace(apartment, room, wall);
      if (!face) continue;
      const span = wallSpan(apartment, wall);
      const from = Math.max(span.min, face.clearMin) + MARGIN_CM;
      const to = Math.min(span.max, face.clearMax) - MARGIN_CM;
      const blocked = apartment.openings.filter((o) => o.wallId === wall.id).map((o) => {
        const s = openingSpan(apartment, o);
        return [s.min - MARGIN_CM, s.max + MARGIN_CM] as const;
      }).sort((a, b) => a[0] - b[0]);
      // Свободные промежутки между проёмами.
      let cursor = from;
      const gaps: Array<[number, number]> = [];
      for (const [a, b] of blocked) {
        if (a > cursor) gaps.push([cursor, Math.min(a, to)]);
        cursor = Math.max(cursor, b);
      }
      if (cursor < to) gaps.push([cursor, to]);
      for (const [a, b] of gaps) {
        if (b - a >= size.widthCm && (!best || b - a > best.length)) {
          best = { wallId: wall.id, min: a, length: b - a, direction: span.direction, spanMin: span.min, spanMax: span.max };
        }
      }
    }
    if (!best) continue;
    const min = best.min + (best.length - size.widthCm) / 2;
    const offsetCm = best.direction === 1 ? min - best.spanMin : best.spanMax - (min + size.widthCm);
    const created: WindowOpening = { id: `window-${room.id.replace(/^room-/, '')}`, kind: 'window', wallId: best.wallId,
      offsetCm, widthCm: size.widthCm, heightCm: size.heightCm, sillCm: size.sillCm, glass: 'stained' };
    if (apartment.openings.some((o) => o.id === created.id)) created.id += '-2';
    apartment.openings.push(created);
  }
  return apartment;
}

/** Комнаты без внешней стены: окно в них невозможно (правило «окно только на внешней стене»). */
export function roomsWithoutExternalWall(apartment: Apartment): Room[] {
  return apartment.rooms.filter((room) => !room.boundary.some((ref) => roomsOfWall(apartment, ref.wallId).length === 1
    && wallLengthCm(apartment, getWall(apartment, ref.wallId)) > 0));
}
