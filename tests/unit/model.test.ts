import { describe, expect, it } from 'vitest';
import { validateIntegrity } from '../../src/domain/integrity';
import {
  NET_AREA_LABEL,
  OUTER_AREA_LABEL,
  getRoom,
  outerContourAreaCm2,
  rectDepth,
  rectWidth,
  roomClearRect,
  roomNetAreaCm2,
  roomsOfWall,
  totalNetAreaCm2,
  unionAreaCm2,
  wallSurfaceKey,
} from '../../src/domain/rooms';
import { cm2ToM2, cmToScene, formatCm, formatM2, modelScaleToScene, sceneToCm } from '../../src/domain/units';
import { testItem, twoRoomApartment } from './fixtures';

describe('единая модель квартиры (3.1)', () => {
  const apartment = twoRoomApartment();

  it('тестовая квартира целостна', () => {
    expect(validateIntegrity(apartment)).toEqual([]);
  });

  it('общая стена существует в одном экземпляре и принадлежит обеим комнатам', () => {
    const shared = apartment.walls.filter((wall) => roomsOfWall(apartment, wall.id).length === 2);
    expect(shared.map((wall) => wall.id)).toEqual(['w7']);
    expect(roomsOfWall(apartment, 'w7').map((room) => room.id)).toEqual(['room-a', 'room-b']);
    expect(new Set(apartment.walls.map((wall) => wall.id)).size).toBe(apartment.walls.length);
  });

  it('общие узлы не дублируются', () => {
    const points = apartment.vertices.map((v) => `${v.xCm};${v.zCm}`);
    expect(new Set(points).size).toBe(points.length);
  });

  it('чистые размеры комнат — расстояния между внутренними поверхностями стен', () => {
    const a = roomClearRect(apartment, getRoom(apartment, 'room-a'));
    const b = roomClearRect(apartment, getRoom(apartment, 'room-b'));
    expect([rectWidth(a), rectDepth(a)]).toEqual([400, 300]);
    expect([rectWidth(b), rectDepth(b)]).toEqual([200, 300]);
    // Между комнатами ровно толщина перегородки: нет ни щели, ни двойной стены.
    expect(b.minX - a.maxX).toBe(10);
  });

  it('у двух сторон перегородки разные ключи поверхностей', () => {
    expect(wallSurfaceKey('w7', 'room-a')).not.toBe(wallSurfaceKey('w7', 'room-b'));
  });

  it('дверь на общей стене — один проём, связанный с двумя комнатами', () => {
    const doors = apartment.openings.filter((opening) => opening.wallId === 'w7');
    expect(doors).toHaveLength(1);
    expect(roomsOfWall(apartment, doors[0]!.wallId)).toHaveLength(2);
  });
});

describe('единицы (3.3, AC-02)', () => {
  it('сантиметры переводятся в единицы сцены и обратно', () => {
    expect(cmToScene(100)).toBe(1);
    expect(sceneToCm(cmToScene(437))).toBeCloseTo(437, 10);
    expect(cm2ToM2(120_000)).toBe(12);
  });

  it('предмет шириной 100 см занимает 1 единицу сцены при любых единицах файла модели', () => {
    // Ширина в исходных единицах файла: 1 м, 100 см, 1000 мм.
    const sourceWidth = { m: 1, cm: 100, mm: 1000 } as const;
    for (const unit of ['m', 'cm', 'mm'] as const) {
      const item = testItem(unit);
      const sceneWidth = sourceWidth[unit] * modelScaleToScene(item.model.unit);
      expect(sceneWidth).toBeCloseTo(cmToScene(item.sizeCm.width), 10);
    }
  });

  it('масштаб модели не зависит от положения: двойного пересчёта нет', () => {
    // Положение 250 см и ширина 100 см пересчитываются независимо.
    const positionScene = cmToScene(250);
    const widthScene = 100 * modelScaleToScene('cm');
    expect(positionScene).toBe(2.5);
    expect(widthScene).toBe(1);
    expect(positionScene * modelScaleToScene('cm')).not.toBe(positionScene);
  });

  it('подписи округляются до целых сантиметров и одного знака м²', () => {
    expect(formatCm(399.6)).toBe('400 см');
    expect(formatM2(125_400)).toBe('12,5 м²');
  });
});

describe('площади (3.4)', () => {
  const apartment = twoRoomApartment();

  it('сумма чистых площадей не включает стены', () => {
    expect(cm2ToM2(roomNetAreaCm2(apartment, getRoom(apartment, 'room-a')))).toBe(12);
    expect(cm2ToM2(roomNetAreaCm2(apartment, getRoom(apartment, 'room-b')))).toBe(6);
    expect(cm2ToM2(totalNetAreaCm2(apartment))).toBe(18);
  });

  it('площадь по внешнему контуру включает стены и отличается от суммы чистых', () => {
    // 670 × 360 см: 400 + 10 + 200 и по 30 см с каждой стороны.
    expect(cm2ToM2(outerContourAreaCm2(apartment))).toBeCloseTo(24.12, 10);
    expect(outerContourAreaCm2(apartment)).toBeGreaterThan(totalNetAreaCm2(apartment));
  });

  it('у двух площадей разные подписи', () => {
    expect(NET_AREA_LABEL).not.toBe(OUTER_AREA_LABEL);
  });

  it('объединение прямоугольников не считает перекрытие дважды', () => {
    const area = unionAreaCm2([
      { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
      { minX: 5, maxX: 15, minZ: 0, maxZ: 10 },
    ]);
    expect(area).toBe(150);
  });
});

describe('проверка целостности', () => {
  it('отклоняет NaN, нулевую толщину и стену нулевой длины', () => {
    const broken = twoRoomApartment();
    broken.ceilingHeightCm = Number.NaN;
    expect(validateIntegrity(broken).map((issue) => issue.code)).toContain('invalid-number');

    const thin = twoRoomApartment();
    thin.walls[0]!.thicknessCm = 0;
    expect(validateIntegrity(thin).map((issue) => issue.code)).toContain('invalid-number');

    const collapsed = twoRoomApartment();
    collapsed.vertices[1] = { id: 'v2', xCm: -15, zCm: -15 };
    expect(validateIntegrity(collapsed).map((issue) => issue.code)).toContain('degenerate-wall');
  });

  it('отклоняет непрямоугольную комнату и называет её', () => {
    const skewed = twoRoomApartment();
    skewed.vertices[2] = { id: 'v3', xCm: 625, zCm: -60 };
    const issues = validateIntegrity(skewed);
    expect(issues.some((issue) => issue.code === 'wall-not-axis-aligned')).toBe(true);
  });

  it('отклоняет незамкнутую границу', () => {
    const open = twoRoomApartment();
    open.rooms[0]!.boundary[1] = { wallId: 'w7', reversed: true };
    const issues = validateIntegrity(open);
    expect(issues[0]?.code).toBe('room-not-closed');
    expect(issues[0]?.message).toContain('Комната А');
  });

  it('отклоняет ссылку на отсутствующую стену или комнату', () => {
    const orphan = twoRoomApartment();
    orphan.openings[0]!.wallId = 'нет-такой';
    expect(validateIntegrity(orphan).map((issue) => issue.code)).toContain('broken-reference');
  });
});
