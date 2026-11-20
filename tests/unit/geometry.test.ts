import { describe, expect, it } from 'vitest';
import { createHistory, execute, proposeChange } from '../../src/commands/history';
import { validateIntegrity } from '../../src/domain/integrity';
import { getRoom, rectWidth, roomClearRect } from '../../src/domain/rooms';
import type { Apartment, FurnitureInstance } from '../../src/domain/types';
import { EPS_CM, formatCm } from '../../src/domain/units';
import {
  doorRooms,
  entranceDoorIds,
  roomBehindDoor,
  validateGeometry,
} from '../../src/geometry/apartmentChecks';
import { doorSwingsInto, doorZones, openingSpan } from '../../src/geometry/openings';
import { snapToNearestWall, validatePlacement, type Pose } from '../../src/geometry/placement';
import { overlapDepthCm } from '../../src/geometry/polygon';
import { createApartmentValidator } from '../../src/geometry/validateApartment';
import { findTestItem, testItems, twoRoomApartment, twoRoomApartmentWithWindow } from './fixtures';

const codes = (apartment: Apartment) => validateGeometry(apartment).map((issue) => issue.code);

let counter = 0;
function instance(itemId: string, roomId: string, pose: Pose, elevationCm = 0): FurnitureInstance {
  return {
    id: `f-${++counter}`,
    catalogItemId: itemId,
    assetVersion: 1,
    roomId,
    elevationCm,
    variantId: null,
    ...pose,
  };
}

function withFurniture(apartment: Apartment, ...items: FurnitureInstance[]): Apartment {
  return { ...apartment, furniture: [...apartment.furniture, ...items] };
}

const at = (xCm: number, zCm: number, rotationDeg = 0): Pose => ({ xCm, zCm, rotationDeg });

function place(apartment: Apartment, itemId: string, roomId: string, pose: Pose, elevationCm?: number) {
  return validatePlacement(apartment, testItems[itemId]!, roomId, pose, { findItem: findTestItem, elevationCm });
}

describe('контуры и наложения помещений (5.1)', () => {
  it('согласованная квартира проходит проверку', () => {
    expect(validateIntegrity(twoRoomApartment())).toEqual([]);
    expect(validateGeometry(twoRoomApartment())).toEqual([]);
    expect(validateGeometry(twoRoomApartmentWithWindow())).toEqual([]);
  });

  it('наложение комнат обнаруживается и называет обе', () => {
    const apartment = twoRoomApartment();
    // Третья комната занимает то же место, что коридор Б.
    apartment.vertices.push(
      { id: 'x1', xCm: 500, zCm: 100 },
      { id: 'x2', xCm: 700, zCm: 100 },
      { id: 'x3', xCm: 700, zCm: 250 },
      { id: 'x4', xCm: 500, zCm: 250 },
    );
    apartment.walls.push(
      { id: 'xw1', startVertexId: 'x1', endVertexId: 'x2', thicknessCm: 10 },
      { id: 'xw2', startVertexId: 'x2', endVertexId: 'x3', thicknessCm: 10 },
      { id: 'xw3', startVertexId: 'x3', endVertexId: 'x4', thicknessCm: 10 },
      { id: 'xw4', startVertexId: 'x4', endVertexId: 'x1', thicknessCm: 10 },
    );
    apartment.rooms.push({
      id: 'room-x',
      type: 'bedroom',
      name: 'Спальня',
      boundary: ['xw1', 'xw2', 'xw3', 'xw4'].map((wallId) => ({ wallId, reversed: false })),
    });
    expect(validateIntegrity(apartment)).toEqual([]);
    const overlap = validateGeometry(apartment).find((issue) => issue.code === 'rooms-overlap');
    expect(overlap?.message).toBe('Комнаты «Коридор Б» и «Спальня» накладываются друг на друга');
  });

  it('комнаты, которые только соприкасаются стеной, наложением не считаются', () => {
    expect(codes(twoRoomApartment())).not.toContain('rooms-overlap');
  });
});

describe('общая стена и внутренние поверхности (5.2)', () => {
  it('сдвиг перегородки не создаёт ни щели, ни двойной стены', () => {
    const before = twoRoomApartment();
    const moved: Apartment = {
      ...before,
      vertices: before.vertices.map((v) => (v.id === 'v2' || v.id === 'v5' ? { ...v, xCm: v.xCm + 30 } : v)),
    };
    expect(validateGeometry(moved)).toEqual([]);
    const a = roomClearRect(moved, getRoom(moved, 'room-a'));
    const b = roomClearRect(moved, getRoom(moved, 'room-b'));
    expect(b.minX - a.maxX).toBe(10);
    expect(moved.walls.filter((wall) => wall.id === 'w7')).toHaveLength(1);
  });

  it('вторая стена на месте общей отклоняется', () => {
    const apartment = twoRoomApartment();
    apartment.walls.push({ id: 'w8', startVertexId: 'v5', endVertexId: 'v2', thicknessCm: 10 });
    expect(codes(apartment)).toEqual(expect.arrayContaining(['duplicate-wall', 'orphan-wall']));
  });

  it('совпадающие узлы и неразбитая в месте примыкания стена отклоняются', () => {
    const twin = twoRoomApartment();
    twin.vertices.push({ id: 'v2-copy', xCm: 405, zCm: -15 });
    expect(codes(twin)).toContain('duplicate-vertex');

    const unsplit = twoRoomApartment();
    unsplit.vertices.push({ id: 'mid', xCm: 200, zCm: -15 });
    expect(codes(unsplit)).toContain('unsplit-wall');
  });

  it('сторона комнаты из двух стен: одна толщина допустима, разная — нет', () => {
    const split = (thicknessCm: number) => {
      const apartment = twoRoomApartment();
      apartment.vertices.push({ id: 'v7', xCm: 200, zCm: -15 });
      apartment.walls[0] = { id: 'w1', startVertexId: 'v1', endVertexId: 'v7', thicknessCm: 30 };
      apartment.walls.push({ id: 'w1b', startVertexId: 'v7', endVertexId: 'v2', thicknessCm });
      apartment.rooms[0]!.boundary.splice(1, 0, { wallId: 'w1b', reversed: false });
      return apartment;
    };
    expect(validateIntegrity(split(30))).toEqual([]);
    expect(validateGeometry(split(30))).toEqual([]);
    expect(codes(split(20))).toContain('wall-thickness-mismatch');
  });
});

describe('проёмы и граф проходов (5.3, AC-04, AC-10)', () => {
  it('общая дверь — один проём с одним и тем же положением для обеих комнат', () => {
    const apartment = twoRoomApartment();
    expect(apartment.openings.filter((opening) => opening.kind === 'door')).toHaveLength(1);
    expect(openingSpan(apartment, apartment.openings[0]!)).toMatchObject({ alongX: false, min: 110, max: 190 });
    const zoneA = doorZones(apartment, getRoom(apartment, 'room-a'))[0]!;
    const zoneB = doorZones(apartment, getRoom(apartment, 'room-b'))[0]!;
    expect(zoneA.doorId).toBe(zoneB.doorId);
    expect(zoneA.polygon.map((p) => p.zCm).sort()).toEqual(zoneB.polygon.map((p) => p.zCm).sort());
  });

  it('дверь ведёт в правильное соседнее помещение в обе стороны', () => {
    const apartment = twoRoomApartment();
    expect(doorRooms(apartment, 'door-ab').map((room) => room.id)).toEqual(['room-a', 'room-b']);
    expect(roomBehindDoor(apartment, 'door-ab', 'room-a')?.id).toBe('room-b');
    expect(roomBehindDoor(apartment, 'door-ab', 'room-b')?.id).toBe('room-a');
  });

  it('входная дверь ведёт наружу и не создаёт помещения', () => {
    const apartment = twoRoomApartment();
    apartment.openings.push({
      id: 'entrance',
      kind: 'door',
      wallId: 'w3',
      offsetCm: 100,
      widthCm: 90,
      heightCm: 210,
      hinge: 'start',
      swing: 'right',
    });
    expect(validateGeometry(apartment)).toEqual([]);
    expect(entranceDoorIds(apartment)).toEqual(['entrance']);
    expect(roomBehindDoor(apartment, 'entrance', 'room-b')).toBeNull();
    expect(apartment.rooms).toHaveLength(2);
  });

  it('проём не выходит за чистый участок стены', () => {
    const apartment = twoRoomApartment();
    // Чистый участок перегородки — z от 0 до 300; ось стены начинается с z = −15.
    apartment.openings[0]!.offsetCm = 15;
    expect(validateGeometry(apartment)).toEqual([]); // вплотную к углу: z от 0 до 80
    apartment.openings[0]!.offsetCm = 14;
    expect(codes(apartment)).toContain('opening-outside-wall');
    apartment.openings[0]!.offsetCm = 240;
    const issue = validateGeometry(apartment).find((entry) => entry.code === 'opening-outside-wall');
    expect(issue?.message).toContain('Дверь выходит за пределы стены');
  });

  it('проём не выше потолка, окно учитывает подоконник', () => {
    const tall = twoRoomApartment();
    tall.openings[0]!.heightCm = 271;
    expect(codes(tall)).toContain('opening-too-tall');

    const window = twoRoomApartmentWithWindow();
    window.openings[1]!.heightCm = 181; // 90 + 181 = 271 > 270
    expect(codes(window)).toContain('opening-too-tall');
  });

  it('проёмы на одной стене не пересекаются; касание допустимо', () => {
    const second = (offsetCm: number) => {
      const apartment = twoRoomApartment();
      apartment.openings.push({ ...apartment.openings[0]!, id: 'door-2', offsetCm } as Apartment['openings'][number]);
      return apartment;
    };
    expect(codes(second(205))).not.toContain('openings-overlap'); // z от 190: вплотную к первой двери
    expect(codes(second(204))).toContain('openings-overlap');
  });

  it('окно на перегородке отклоняется', () => {
    const apartment = twoRoomApartmentWithWindow();
    apartment.openings[1]!.wallId = 'w7';
    apartment.openings[1]!.offsetCm = 215;
    apartment.openings[1]!.widthCm = 60;
    expect(codes(apartment)).toContain('window-on-inner-wall');
  });

  it('помещение без прохода обнаруживается', () => {
    const apartment = twoRoomApartment();
    apartment.openings = [];
    const issue = validateGeometry(apartment).find((entry) => entry.code === 'rooms-disconnected');
    expect(issue?.message).toBe('В помещение «Коридор Б» нет прохода через двери');
  });
});

describe('коллайдеры с поворотом и высотой (5.4)', () => {
  const apartment = twoRoomApartment();

  it('составной коллайдер проверяется целиком, а не по центру', () => {
    // Основной объём углового дивана в комнате, выступ выходит за стену z = 300.
    expect(place(apartment, 'corner', 'room-a', at(200, 150)).valid).toBe(true);
    const result = place(apartment, 'corner', 'room-a', at(200, 225));
    expect(result).toMatchObject({ valid: false, code: 'outside-room' });
  });

  it('тот же предмет после поворота занимает другое место', () => {
    expect(place(apartment, 'corner', 'room-a', at(120, 150, 0)).valid).toBe(true);
    expect(place(apartment, 'corner', 'room-a', at(90, 150, 90)).valid).toBe(true);
    expect(place(apartment, 'corner', 'room-a', at(90, 150, 0)).valid).toBe(false);
  });

  it('высота участвует в проверке: предметы на разной высоте не мешают друг другу', () => {
    const scene = withFurniture(apartment, instance('dresser', 'room-a', at(200, 22.5)));
    // Полка висит над комодом на высоте 120–150 см, комод занимает 0–85 см.
    expect(place(scene, 'shelf', 'room-a', at(200, 12.5)).valid).toBe(true);
    // Вторая полка в том же месте стены пересекается с первой.
    const withShelf = withFurniture(scene, instance('shelf', 'room-a', at(200, 12.5), 120));
    expect(place(withShelf, 'shelf', 'room-a', at(230, 12.5))).toMatchObject({ valid: false, code: 'item-overlap' });
  });
});

describe('разрешённые и запрещённые размещения (5.5, SPEC §11.3)', () => {
  const base = twoRoomApartmentWithWindow();
  const withTable = withFurniture(base, instance('table', 'room-a', at(200, 150)));

  it('разрешено: стул задвинут под столешницу, не задевая ножки', () => {
    expect(place(withTable, 'chair', 'room-a', at(200, 185)).valid).toBe(true);
  });

  it('запрещено: стул пересекает столешницу или ножку стола', () => {
    const top = place(withTable, 'chair', 'room-a', at(200, 160));
    expect(top).toMatchObject({ valid: false, code: 'item-overlap', message: 'Пересекается с предметом «Стол»' });
    expect(place(withTable, 'chair', 'room-a', at(160, 185)).code).toBe('item-overlap');
  });

  it('разрешено: ковёр под диваном и столом; запрещено: ковёр на ковре', () => {
    const withSofa = withFurniture(withTable, instance('sofa', 'room-a', at(250, 50)));
    expect(place(withSofa, 'rug', 'room-a', at(220, 120)).valid).toBe(true);
    const withRug = withFurniture(withSofa, instance('rug', 'room-a', at(220, 120)));
    // Мебель ставится на ковёр.
    expect(place(withRug, 'nightstand', 'room-a', at(150, 240)).valid).toBe(true);
    expect(place(withRug, 'rug', 'room-a', at(180, 160))).toMatchObject({
      valid: false,
      code: 'item-overlap',
      message: 'Покрытие лежит поверх другого покрытия',
    });
  });

  it('запрещено: диван поверх кровати', () => {
    const withBed = withFurniture(base, instance('bed', 'room-a', at(200, 150)));
    expect(place(withBed, 'sofa', 'room-a', at(200, 150))).toMatchObject({
      valid: false,
      code: 'item-overlap',
      message: 'Пересекается с предметом «Кровать»',
    });
  });

  it('разрешено: комод под окном', () => {
    expect(place(base, 'dresser', 'room-a', at(22.5, 150, 90)).valid).toBe(true);
  });

  it('запрещено: шкаф в дверном проёме', () => {
    // Дверь на стене x = 400, z от 110 до 190; перед ней зона глубиной 30 см.
    const result = place(base, 'dresser', 'room-a', at(377.5, 150, 270));
    expect(result).toMatchObject({ valid: false, code: 'opening-conflict', message: 'Предмет перекрывает дверной проём' });
    expect(result.conflictIds).toEqual(['door-ab']);
    // Вплотную к зоне, но вне её — допустимо.
    expect(place(base, 'dresser', 'room-a', at(347.5, 150, 270)).valid).toBe(true);
  });

  it('запрещено: тумба в зоне открывания створки; с другой стороны двери сектора нет', () => {
    const door = base.openings[0]!;
    expect(door.kind === 'door' && doorSwingsInto(base, door, getRoom(base, 'room-b'))).toBe(true);
    expect(door.kind === 'door' && doorSwingsInto(base, door, getRoom(base, 'room-a'))).toBe(false);
    expect(doorZones(base, getRoom(base, 'room-a')).map((zone) => zone.kind)).toEqual(['threshold']);
    expect(doorZones(base, getRoom(base, 'room-b')).map((zone) => zone.kind)).toEqual(['threshold', 'swing']);

    // Тумба в коридоре за пределами порога, но внутри сектора радиусом 80 см от петли (410, 110).
    expect(place(base, 'nightstand', 'room-b', at(467.5, 135))).toMatchObject({
      valid: false,
      code: 'opening-conflict',
      message: 'Предмет стоит в зоне открывания двери',
    });
    // За пределами сектора.
    expect(place(base, 'nightstand', 'room-b', at(520, 250)).valid).toBe(true);
  });

  it('ковёр может лежать в зоне двери', () => {
    expect(place(base, 'rug', 'room-b', at(510, 150, 90)).valid).toBe(true);
  });

  it('разрешено: навесной шкаф на сплошном участке стены', () => {
    const result = place(base, 'cabinet', 'room-a', at(17.5, 40, 90));
    expect(result).toMatchObject({ valid: true, elevationCm: 140 });
  });

  it('запрещено: навесной шкаф на окне или на двери', () => {
    expect(place(base, 'cabinet', 'room-a', at(17.5, 150, 90))).toMatchObject({
      valid: false,
      code: 'opening-conflict',
      message: 'Предмет нельзя вешать на окно',
    });
    expect(place(base, 'cabinet', 'room-a', at(382.5, 150, 270))).toMatchObject({
      valid: false,
      code: 'opening-conflict',
      message: 'Предмет нельзя вешать на дверной проём',
    });
  });

  it('настенный предмет должен висеть на стене; привязка ставит его к ближайшей', () => {
    expect(place(base, 'shelf', 'room-a', at(200, 150))).toMatchObject({ valid: false, code: 'bad-support' });
    const pose = snapToNearestWall(base, testItems.shelf!, 'room-a', { xCm: 250, zCm: 20 });
    expect(pose).toEqual({ xCm: 250, zCm: 12.5, rotationDeg: 0 });
    expect(place(base, 'shelf', 'room-a', pose).valid).toBe(true);
    expect(snapToNearestWall(base, testItems.shelf!, 'room-a', { xCm: 390, zCm: 250 }).rotationDeg).toBe(270);
  });

  it('потолочный предмет висит под потолком и не мешает мебели под ним', () => {
    const withSofa = withFurniture(base, instance('sofa', 'room-a', at(200, 150)));
    expect(place(withSofa, 'ceilingLamp', 'room-a', at(200, 150))).toMatchObject({ valid: true, elevationCm: 230 });
  });

  it('настольная лампа стоит только на столешнице', () => {
    expect(place(withTable, 'tableLamp', 'room-a', at(220, 160), 75).valid).toBe(true);
    expect(place(withTable, 'tableLamp', 'room-a', at(320, 250), 0)).toMatchObject({ valid: false, code: 'bad-support' });
    // Край стола: основание лампы выступает за столешницу.
    expect(place(withTable, 'tableLamp', 'room-a', at(255, 150), 75).code).toBe('bad-support');
  });

  it('полная проверка квартиры находит конфликт в комнате, которой нет на экране', () => {
    const validate = createApartmentValidator(findTestItem);
    const scene = withFurniture(twoRoomApartment(), instance('dresser', 'room-b', at(560, 22.5)));
    expect(validate(scene)).toEqual([]);
    // Перегородка сдвигается на 110 см в сторону коридора: комод шириной 100 см оказывается в стене.
    const history = createHistory(scene);
    const result = execute(
      history,
      {
        label: 'Сдвиг общей стены',
        apply: (apartment) => ({
          ...apartment,
          vertices: apartment.vertices.map((v) => (v.id === 'v2' || v.id === 'v5' ? { ...v, xCm: v.xCm + 110 } : v)),
        }),
      },
      validate,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.message).toBe('В комнате «Коридор Б» комод пересекает стену');
    expect(result.history).toBe(history);
  });
});

describe('допуск, касание и округление (5.6)', () => {
  const apartment = twoRoomApartment();
  const withSofa = withFurniture(apartment, instance('sofa', 'room-a', at(100, 150)));

  it('допуск равен 0,01 см', () => {
    expect(EPS_CM).toBe(0.01);
  });

  it('касание предметов без проникновения допустимо', () => {
    // Диван занимает x от 0 до 200; тумба шириной 45 см вплотную справа.
    expect(place(withSofa, 'nightstand', 'room-a', at(222.5, 150)).valid).toBe(true);
    expect(place(withSofa, 'nightstand', 'room-a', at(222.5 - 0.005, 150)).valid).toBe(true); // в пределах допуска
    expect(place(withSofa, 'nightstand', 'room-a', at(222.5 - 0.02, 150)).valid).toBe(false);
  });

  it('касание стены допустимо, проникновение больше допуска — нет', () => {
    expect(place(apartment, 'sofa', 'room-a', at(100, 45)).valid).toBe(true);
    expect(place(apartment, 'sofa', 'room-a', at(100 - 0.005, 45)).valid).toBe(true);
    expect(place(apartment, 'sofa', 'room-a', at(100 - 0.02, 45)).valid).toBe(false);
  });

  it('округление подписей не влияет на результат проверки', () => {
    // Оба положения подписываются как «100 см», но второе проникает в стену.
    expect(formatCm(100)).toBe(formatCm(99.6));
    expect(place(apartment, 'sofa', 'room-a', at(100, 45)).valid).toBe(true);
    expect(place(apartment, 'sofa', 'room-a', at(99.6, 45)).valid).toBe(false);
  });

  it('глубина проникновения многоугольников: касание даёт ноль', () => {
    const square = (x: number) => [
      { xCm: x, zCm: 0 },
      { xCm: x + 10, zCm: 0 },
      { xCm: x + 10, zCm: 10 },
      { xCm: x, zCm: 10 },
    ];
    expect(overlapDepthCm(square(0), square(10))).toBe(0);
    expect(overlapDepthCm(square(0), square(7))).toBeCloseTo(3, 9);
    expect(overlapDepthCm(square(0), square(30))).toBe(0);
  });

  it('предложение изменения с недопустимой геометрией не меняет квартиру', () => {
    const validate = createApartmentValidator(findTestItem);
    const before = twoRoomApartment();
    const snapshot = structuredClone(before);
    const proposal = proposeChange(
      before,
      { label: 'Убрать дверь', apply: (a) => ({ ...a, openings: [] }) },
      validate,
    );
    expect(proposal.issues[0]?.code).toBe('rooms-disconnected');
    expect(before).toEqual(snapshot);
    expect(rectWidth(roomClearRect(before, getRoom(before, 'room-a')))).toBe(400);
  });
});
