import { roomNetAreaCm2, roomsOfWall, wallEnds, wallLengthCm } from '../domain/rooms';
import { buildFourRoomApartment } from './fourRoom';
import { addStainedWindows } from './windows';
import { SCHEMA_VERSION, type Apartment, type LayoutTemplate, type Room, type RoomType, type Wall } from '../domain/types';

type Piece = { name: string; type: RoomType; width: number };
type Recipe = {
  id: string; livingRooms: 1 | 2 | 3; title: string; composition: string;
  top: Piece[]; bottom: Piece[]; topDepth: number; bottomDepth: number;
};

const living = (name: string, width: number): Piece => ({ name, type: 'living', width });
const studio = (width: number): Piece => ({ name: 'Кухня-гостиная', type: 'kitchen-living', width });
const bedroom = (name: string, width: number): Piece => ({ name, type: 'bedroom', width });
const kitchen = (width: number): Piece => ({ name: 'Кухня', type: 'kitchen', width });
const bath = (width: number): Piece => ({ name: 'Санузел', type: 'combined-bathroom', width });
const separateBath = (width: number): Piece => ({ name: 'Ванная', type: 'bathroom', width });
const toilet = (width: number): Piece => ({ name: 'Туалет', type: 'toilet', width });

/** Исходные размеры осей комнат в см; схема создаётся сразу с коэффициентом 1,1 (D-15). */
const RECIPES: Recipe[] = [
  { id: '1a', livingRooms: 1, title: '1А · Студия', composition: 'Кухня-гостиная, совмещённый санузел, прихожая',
    top: [studio(510)], bottom: [bath(190)], topDepth: 430, bottomDepth: 240 },
  { id: '1b', livingRooms: 1, title: '1Б · Отдельная кухня', composition: 'Комната, кухня, совмещённый санузел, прихожая',
    top: [living('Комната', 400), kitchen(270)], bottom: [bath(190)], topDepth: 400, bottomDepth: 230 },
  { id: '1v', livingRooms: 1, title: '1В · Раздельный санузел', composition: 'Комната, кухня, ванная, туалет, прихожая',
    top: [living('Комната', 420), kitchen(270)], bottom: [separateBath(180), toilet(130)], topDepth: 400, bottomDepth: 230 },
  { id: '2a', livingRooms: 2, title: '2А · Кухня-гостиная', composition: 'Кухня-гостиная, спальня, совмещённый санузел, прихожая',
    top: [studio(500), bedroom('Спальня', 320)], bottom: [bath(190)], topDepth: 400, bottomDepth: 240 },
  { id: '2b', livingRooms: 2, title: '2Б · Отдельная кухня', composition: 'Две комнаты, кухня, совмещённый санузел, прихожая',
    top: [living('Гостиная', 400), bedroom('Спальня', 330), kitchen(260)], bottom: [bath(190)], topDepth: 400, bottomDepth: 240 },
  { id: '2v', livingRooms: 2, title: '2В · Раздельный санузел', composition: 'Две комнаты, кухня, ванная, туалет, прихожая',
    top: [living('Гостиная', 390), bedroom('Спальня', 330), kitchen(260)], bottom: [separateBath(180), toilet(130)], topDepth: 400, bottomDepth: 240 },
  { id: '3a', livingRooms: 3, title: '3А · Кухня-гостиная', composition: 'Кухня-гостиная, две спальни, совмещённый санузел, прихожая',
    top: [studio(500), bedroom('Спальня 1', 300), bedroom('Спальня 2', 300)], bottom: [bath(200)], topDepth: 420, bottomDepth: 240 },
  { id: '3b', livingRooms: 3, title: '3Б · Отдельная кухня', composition: 'Три комнаты, кухня, совмещённый санузел, прихожая',
    top: [living('Гостиная', 380), bedroom('Спальня 1', 310), bedroom('Спальня 2', 300), kitchen(260)],
    bottom: [bath(200)], topDepth: 420, bottomDepth: 240 },
  { id: '3v', livingRooms: 3, title: '3В · Раздельный санузел', composition: 'Три комнаты, кухня, ванная, туалет, прихожая',
    top: [living('Гостиная', 370), bedroom('Спальня 1', 300), bedroom('Спальня 2', 290), kitchen(250)],
    bottom: [separateBath(180), toilet(130)], topDepth: 420, bottomDepth: 240 },
];

const SCALE = 1.1;

interface RectRoom { name: string; type: RoomType; x0: number; x1: number; z0: number; z1: number }

function recipeRooms(recipe: Recipe): RectRoom[] {
  const topDepth = recipe.topDepth * SCALE;
  const topWidth = recipe.top.reduce((sum, piece) => sum + piece.width * SCALE, 0);
  const bottomDepth = recipe.bottomDepth * SCALE;
  const rooms: RectRoom[] = [];
  let x = 0;
  for (const piece of recipe.top) {
    rooms.push({ name: piece.name, type: piece.type, x0: x, x1: x + piece.width * SCALE, z0: 0, z1: topDepth });
    x += piece.width * SCALE;
  }
  x = 0;
  for (const piece of recipe.bottom) {
    rooms.push({ name: piece.name, type: piece.type, x0: x, x1: x + piece.width * SCALE,
      z0: topDepth, z1: topDepth + bottomDepth });
    x += piece.width * SCALE;
  }
  rooms.push({ name: 'Прихожая', type: 'hallway', x0: x, x1: topWidth, z0: topDepth, z1: topDepth + bottomDepth });
  return rooms;
}

function buildApartment(recipe: Recipe): Apartment {
  const rects = recipeRooms(recipe);
  const xs = [...new Set(rects.flatMap((r) => [r.x0, r.x1]))].sort((a, b) => a - b);
  const zs = [...new Set(rects.flatMap((r) => [r.z0, r.z1]))].sort((a, b) => a - b);
  const vertices: Apartment['vertices'] = [];
  const vertexIds = new Map<string, string>();
  const walls: Wall[] = [];
  const wallIds = new Map<string, string>();
  const vertex = (xCm: number, zCm: number) => {
    const key = `${xCm}:${zCm}`;
    let id = vertexIds.get(key);
    if (!id) {
      id = `v${vertices.length + 1}`;
      vertexIds.set(key, id);
      vertices.push({ id, xCm, zCm });
    }
    return id;
  };
  const wallRef = (ax: number, az: number, bx: number, bz: number) => {
    const start = vertex(ax, az);
    const end = vertex(bx, bz);
    const key = [start, end].sort().join(':');
    let id = wallIds.get(key);
    if (!id) {
      id = `w${walls.length + 1}`;
      wallIds.set(key, id);
      walls.push({ id, startVertexId: start, endVertexId: end, thicknessCm: 10 });
    }
    return { wallId: id, reversed: walls.find((wall) => wall.id === id)!.startVertexId !== start };
  };
  const rooms: Room[] = rects.map((r, index) => {
    const xPoints = xs.filter((x) => x >= r.x0 && x <= r.x1);
    const zPoints = zs.filter((z) => z >= r.z0 && z <= r.z1);
    const boundary: Room['boundary'] = [];
    for (let i = 0; i + 1 < xPoints.length; i++) boundary.push(wallRef(xPoints[i]!, r.z0, xPoints[i + 1]!, r.z0));
    for (let i = 0; i + 1 < zPoints.length; i++) boundary.push(wallRef(r.x1, zPoints[i]!, r.x1, zPoints[i + 1]!));
    for (let i = xPoints.length - 1; i > 0; i--) boundary.push(wallRef(xPoints[i]!, r.z1, xPoints[i - 1]!, r.z1));
    for (let i = zPoints.length - 1; i > 0; i--) boundary.push(wallRef(r.x0, zPoints[i]!, r.x0, zPoints[i - 1]!));
    return { id: `room-${index + 1}`, name: r.name, type: r.type, boundary };
  });
  const apartment: Apartment = { id: `layout-${recipe.id}`, schemaVersion: SCHEMA_VERSION, ceilingHeightCm: 270,
    vertices, walls, rooms, openings: [], furniture: [], wallFinishes: {} };
  for (const wall of walls) if (roomsOfWall(apartment, wall.id).length === 1) wall.thicknessCm = 30;

  const hall = rooms.find((room) => room.type === 'hallway')!;
  // Связываем все комнаты проходами, начиная от прихожей. Комната может вести
  // через соседнюю комнату, если её сторона у прихожей слишком коротка для двери.
  const connected = new Set([hall.id]);
  while (connected.size < rooms.length) {
    let added = false;
    for (const room of rooms) {
      if (connected.has(room.id)) continue;
      const shared = walls.filter((wall) => room.boundary.some((r) => r.wallId === wall.id)
        && roomsOfWall(apartment, wall.id).some((neighbor) => connected.has(neighbor.id))
        && wallLengthCm(apartment, wall) >= 130);
      const doorWall = shared.sort((a, b) => wallLengthCm(apartment, b) - wallLengthCm(apartment, a))[0];
      if (!doorWall) continue;
      const widthCm = room.type === 'bathroom' || room.type === 'toilet' || room.type === 'combined-bathroom' ? 70 : 80;
      apartment.openings.push({ id: `door-${room.id}`, kind: 'door', wallId: doorWall.id,
        offsetCm: (wallLengthCm(apartment, doorWall) - widthCm) / 2, widthCm, heightCm: 210,
        hinge: 'start', swing: 'left' });
      connected.add(room.id);
      added = true;
    }
    if (!added) throw new Error(`Нет прохода в схеме ${recipe.id}`);
  }
  for (const room of rooms) {
    if (room.type === 'bathroom' || room.type === 'toilet' || room.type === 'combined-bathroom') continue;
    const external = walls.filter((wall) => room.boundary.some((r) => r.wallId === wall.id)
      && roomsOfWall(apartment, wall.id).length === 1
      && wallEnds(apartment, wall).every((v) => v.zCm === 0) && wallLengthCm(apartment, wall) >= 180);
    const windowWall = external.sort((a, b) => wallLengthCm(apartment, b) - wallLengthCm(apartment, a))[0];
    if (windowWall) apartment.openings.push({ id: `window-${room.id}`, kind: 'window', wallId: windowWall.id,
      offsetCm: (wallLengthCm(apartment, windowWall) - 120) / 2, widthCm: 120, heightCm: 140, sillCm: 90 });
  }
  const entranceWall = walls.filter((wall) => hall.boundary.some((r) => r.wallId === wall.id)
    && roomsOfWall(apartment, wall.id).length === 1 && wallLengthCm(apartment, wall) >= 160)
    .sort((a, b) => wallLengthCm(apartment, b) - wallLengthCm(apartment, a))[0];
  if (!entranceWall) throw new Error(`Нет входной двери: ${recipe.id}`);
  apartment.openings.push({ id: 'entrance', kind: 'door', wallId: entranceWall.id,
    offsetCm: (wallLengthCm(apartment, entranceWall) - 90) / 2, widthCm: 90, heightCm: 210,
    hinge: 'start', swing: 'left' });
  return apartment;
}

export const layoutTemplates: LayoutTemplate[] = [...RECIPES.map((recipe) => ({
  id: recipe.id, livingRooms: recipe.livingRooms, title: recipe.title, composition: recipe.composition,
  apartment: addStainedWindows(buildApartment(recipe)),
})), {
  id: '4a', livingRooms: 4, title: '4А · Просторный коридор',
  composition: 'Гостиная, родительская спальня, детская, кабинет, кухня, три санузла, две гардеробные, два балкона',
  apartment: addStainedWindows(buildFourRoomApartment()),
}];

/** Чистая площадь всех помещений; вычисляется из геометрии. */
export function templateAreaCm2(template: LayoutTemplate): number {
  return template.apartment.rooms.reduce((sum, room) => sum + roomNetAreaCm2(template.apartment, room), 0);
}

export function rankTemplates(rooms: 1 | 2 | 3 | 4, areaM2: number): LayoutTemplate[] {
  return layoutTemplates.filter((template) => template.livingRooms === rooms)
    .sort((a, b) => Math.abs(templateAreaCm2(a) / 10_000 - areaM2)
      - Math.abs(templateAreaCm2(b) / 10_000 - areaM2));
}
