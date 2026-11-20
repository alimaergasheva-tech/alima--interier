import { swingTarget } from '../commands/openings';
import { roomsOfWall, wallLengthCm } from '../domain/rooms';
import { SCHEMA_VERSION, type Apartment, type Id, type Room, type RoomType, type Wall } from '../domain/types';
import { wallSpan } from '../geometry/openings';

// Схема 4А (D-21): четыре жилые комнаты и отдельная кухня, каждая комната выходит
// в общий коридор. У спален свои санузлы, у родительской — гардеробная, у гостиной и
// кухни — балконы, в прихожей — скрытая гардеробная и гостевой санузел. Размеры — оси стен, см.

interface Rect { key: string; name: string; type: RoomType; x0: number; x1: number; z0: number; z1: number }

const room = (key: string, name: string, type: RoomType, x0: number, x1: number, z0: number, z1: number): Rect =>
  ({ key, name, type, x0, x1, z0, z1 });

const RECTS: Rect[] = [
  room('master', 'Родительская спальня', 'bedroom', 0, 380, 0, 420),
  room('master-bath', 'Санузел родительской спальни', 'combined-bathroom', 380, 530, 0, 210),
  room('master-wardrobe', 'Гардеробная родительской спальни', 'wardrobe', 380, 530, 210, 420),
  room('kids', 'Детская', 'bedroom', 530, 830, 0, 420),
  room('kids-bath', 'Санузел детской', 'combined-bathroom', 830, 1050, 0, 200),
  room('storage', 'Кладовая', 'wardrobe', 830, 1050, 200, 420),
  room('living', 'Гостиная', 'living', 1050, 1450, 0, 420),
  room('living-balcony', 'Балкон гостиной', 'balcony', 1450, 1650, 0, 420),
  room('corridor', 'Коридор', 'hallway', 0, 1450, 420, 590),
  room('hidden-wardrobe', 'Скрытая гардеробная', 'wardrobe', 0, 170, 590, 800),
  room('guest-wc', 'Гостевой санузел', 'combined-bathroom', 0, 170, 800, 1010),
  room('hall', 'Прихожая', 'hallway', 170, 650, 590, 1010),
  room('study', 'Кабинет', 'living', 650, 1050, 590, 1010),
  room('kitchen', 'Кухня', 'kitchen', 1050, 1450, 590, 1010),
  room('kitchen-balcony', 'Балкон кухни', 'balcony', 1050, 1450, 1010, 1210),
];

const CEILING_CM = 350;

function geometry(): Apartment {
  const corners = RECTS.flatMap((r) => [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]] as const);
  const vertices: Apartment['vertices'] = [];
  const vertexIds = new Map<string, Id>();
  const walls: Wall[] = [];
  const wallIds = new Map<string, Id>();
  const vertex = (x: number, z: number) => {
    const key = `${x}:${z}`;
    let id = vertexIds.get(key);
    if (!id) {
      id = `v${vertices.length + 1}`;
      vertexIds.set(key, id);
      vertices.push({ id, xCm: x, zCm: z });
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
  // Сторона делится только в точках, где к ней приходит угол другой комнаты.
  const along = (fixedAxis: 'x' | 'z', fixed: number, from: number, to: number) => [...new Set([from, to,
    ...corners.filter(([x, z]) => (fixedAxis === 'z' ? z === fixed : x === fixed))
      .map(([x, z]) => (fixedAxis === 'z' ? x : z)).filter((v) => v > from && v < to)])].sort((a, b) => a - b);
  const rooms: Room[] = RECTS.map((r) => {
    const top = along('z', r.z0, r.x0, r.x1);
    const right = along('x', r.x1, r.z0, r.z1);
    const bottom = along('z', r.z1, r.x0, r.x1);
    const left = along('x', r.x0, r.z0, r.z1);
    const boundary: Room['boundary'] = [];
    for (let i = 0; i + 1 < top.length; i++) boundary.push(wallRef(top[i]!, r.z0, top[i + 1]!, r.z0));
    for (let i = 0; i + 1 < right.length; i++) boundary.push(wallRef(r.x1, right[i]!, r.x1, right[i + 1]!));
    for (let i = bottom.length - 1; i > 0; i--) boundary.push(wallRef(bottom[i]!, r.z1, bottom[i - 1]!, r.z1));
    for (let i = left.length - 1; i > 0; i--) boundary.push(wallRef(r.x0, left[i]!, r.x0, left[i - 1]!));
    return { id: `room-${r.key}`, name: r.name, type: r.type, boundary };
  });
  const apartment: Apartment = { id: 'layout-4a', schemaVersion: SCHEMA_VERSION, ceilingHeightCm: CEILING_CM,
    vertices, walls, rooms, openings: [], furniture: [], wallFinishes: {} };
  for (const wall of walls) if (roomsOfWall(apartment, wall.id).length === 1) wall.thicknessCm = 30;
  return apartment;
}

export function buildFourRoomApartment(): Apartment {
  const apartment = geometry();
  const id = (key: string) => `room-${key}`;

  /** Самая длинная стена, общая для двух комнат. */
  const sharedWall = (a: string, b: string): Wall => {
    const found = apartment.walls.filter((wall) => {
      const ids = roomsOfWall(apartment, wall.id).map((r) => r.id);
      return ids.length === 2 && ids.includes(id(a)) && ids.includes(id(b));
    }).sort((p, q) => wallLengthCm(apartment, q) - wallLengthCm(apartment, p));
    if (!found[0]) throw new Error(`Нет общей стены: ${a} и ${b}`);
    return found[0];
  };
  /** Самая длинная внешняя стена комнаты на заданной стороне. */
  const outerWall = (key: string, side: 'north' | 'south' | 'east' | 'west'): Wall => {
    const r = RECTS.find((item) => item.key === key)!;
    const at = { north: [true, r.z0], south: [true, r.z1], east: [false, r.x1], west: [false, r.x0] }[side] as [boolean, number];
    const found = apartment.walls.filter((wall) => {
      const owners = roomsOfWall(apartment, wall.id);
      if (owners.length !== 1 || owners[0]!.id !== id(key)) return false;
      const span = wallSpan(apartment, wall);
      return span.alongX === at[0] && span.fixed === at[1];
    }).sort((p, q) => wallLengthCm(apartment, q) - wallLengthCm(apartment, p));
    if (!found[0]) throw new Error(`Нет внешней стены: ${key} ${side}`);
    return found[0];
  };

  const addDoor = (doorId: string, wall: Wall, widthCm: number, opensInto: string) => {
    const door = { id: doorId, kind: 'door' as const, wallId: wall.id,
      offsetCm: (wallLengthCm(apartment, wall) - widthCm) / 2, widthCm, heightCm: 210,
      hinge: 'start' as const, swing: 'left' as 'left' | 'right' };
    // Створка открывается внутрь указанной комнаты, а не в коридор.
    if (swingTarget(apartment, door, 'left')?.id !== id(opensInto)) door.swing = 'right';
    apartment.openings.push(door);
  };
  const addWindow = (windowId: string, wall: Wall, widthCm: number) => {
    apartment.openings.push({ id: windowId, kind: 'window', wallId: wall.id,
      offsetCm: (wallLengthCm(apartment, wall) - widthCm) / 2, widthCm, heightCm: 160, sillCm: 90 });
  };

  addDoor('door-master', sharedWall('master', 'corridor'), 90, 'master');
  addDoor('door-master-bath', sharedWall('master', 'master-bath'), 70, 'master-bath');
  addDoor('door-master-wardrobe', sharedWall('master', 'master-wardrobe'), 80, 'master-wardrobe');
  addDoor('door-kids', sharedWall('kids', 'corridor'), 90, 'kids');
  addDoor('door-kids-bath', sharedWall('kids', 'kids-bath'), 70, 'kids-bath');
  addDoor('door-study', sharedWall('study', 'corridor'), 90, 'study');
  addDoor('door-storage', sharedWall('storage', 'corridor'), 80, 'storage');
  addDoor('door-living', sharedWall('living', 'corridor'), 120, 'living');
  addDoor('door-living-balcony', sharedWall('living', 'living-balcony'), 120, 'living');
  addDoor('door-kitchen', sharedWall('kitchen', 'corridor'), 100, 'kitchen');
  addDoor('door-kitchen-balcony', sharedWall('kitchen', 'kitchen-balcony'), 90, 'kitchen');
  addDoor('door-hall', sharedWall('hall', 'corridor'), 140, 'hall');
  addDoor('door-hidden-wardrobe', sharedWall('hall', 'hidden-wardrobe'), 80, 'hall');
  addDoor('door-guest-wc', sharedWall('hall', 'guest-wc'), 70, 'guest-wc');
  addDoor('entrance', outerWall('hall', 'south'), 100, 'hall');

  addWindow('window-master', outerWall('master', 'north'), 180);
  addWindow('window-kids', outerWall('kids', 'north'), 160);
  addWindow('window-study', outerWall('study', 'south'), 160);
  addWindow('window-corridor', outerWall('corridor', 'east'), 100);
  addWindow('window-living', outerWall('living', 'north'), 200);
  addWindow('window-kitchen', outerWall('kitchen', 'east'), 160);
  return apartment;
}
