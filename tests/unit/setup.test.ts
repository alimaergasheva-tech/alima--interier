import { describe, expect, it } from 'vitest';
import { createHistory, execute } from '../../src/commands/history';
import {
  previewChange, setCeilingHeight, shiftForRoomSize, shiftWall, wallLine, withSetupLimits,
} from '../../src/commands/setup';
import { outerContourAreaCm2, rectDepth, rectWidth, roomClearRect, totalNetAreaCm2 } from '../../src/domain/rooms';
import { createApartmentValidator } from '../../src/geometry/validateApartment';
import { layoutTemplates } from '../../src/layouts/templates';
import { findTestItem, twoRoomApartment, twoRoomApartmentWithWindow } from './fixtures';

const validate = withSetupLimits(createApartmentValidator(findTestItem));
const size = (apartment: ReturnType<typeof twoRoomApartment>, id: string) => {
  const rect = roomClearRect(apartment, apartment.rooms.find((room) => room.id === id)!);
  return [rectWidth(rect), rectDepth(rect)];
};

describe('сдвиг стены (D-03, AC-03)', () => {
  it('общая стена: обе стороны меняются, сумма площадей прежняя', () => {
    const before = twoRoomApartment();
    const preview = previewChange(before, shiftWall('w7', 30), validate);
    expect(preview.proposal.issues).toEqual([]);
    expect(size(preview.proposal.candidate, 'room-a')).toEqual([430, 300]);
    expect(size(preview.proposal.candidate, 'room-b')).toEqual([170, 300]);
    expect(totalNetAreaCm2(preview.proposal.candidate)).toBe(totalNetAreaCm2(before));
    expect(preview.rooms.map((room) => room.roomId).sort()).toEqual(['room-a', 'room-b']);
    expect(before.vertices.find((v) => v.id === 'v2')!.xCm).toBe(405); // исходная квартира не тронута
  });

  it('внешняя стена: площадь растёт, противоположная стена на месте', () => {
    const before = twoRoomApartment();
    const preview = previewChange(before, shiftWall('w3', 50), validate);
    expect(preview.proposal.issues).toEqual([]);
    const after = preview.proposal.candidate;
    expect(size(after, 'room-b')).toEqual([250, 300]);
    expect(totalNetAreaCm2(after) - totalNetAreaCm2(before)).toBe(50 * 300);
    expect(outerContourAreaCm2(after)).toBeGreaterThan(outerContourAreaCm2(before));
    expect(preview.rooms.map((room) => room.roomId)).toEqual(['room-b']);
    expect(after.vertices.find((v) => v.id === 'v2')!.xCm).toBe(405);
  });

  it('число из размера комнаты переводится в сдвиг в обе стороны', () => {
    const apartment = twoRoomApartment();
    expect(shiftForRoomSize(apartment, 'w7', 'room-a', 430)).toBe(30);
    expect(shiftForRoomSize(apartment, 'w7', 'room-b', 170)).toBe(30);
    expect(shiftForRoomSize(apartment, 'w7', 'room-b', 230)).toBe(-30);
    expect(shiftForRoomSize(apartment, 'w6', 'room-a', 450)).toBe(-50);
  });

  it('прямая стена сдвигается целиком вдоль нескольких комнат', () => {
    const template = layoutTemplates.find((item) => item.id === '2b')!.apartment;
    const hallWall = template.walls.find((wall) => wallLine(template, wall.id).wallIds.length > 2)!;
    const line = wallLine(template, hallWall.id);
    const preview = previewChange(template, shiftWall(hallWall.id, 20), validate);
    expect(preview.proposal.issues).toEqual([]);
    expect(line.vertexIds.length).toBeGreaterThan(3);
    expect(preview.rooms.length).toBeGreaterThanOrEqual(3);
  });

  it('проём на примыкающей стене остаётся на месте плана', () => {
    const before = twoRoomApartmentWithWindow();
    before.openings.push({ id: 'window-top', kind: 'window', wallId: 'w1', offsetCm: 100, widthCm: 100,
      heightCm: 140, sillCm: 90 });
    const after = previewChange(before, shiftWall('w6', -50), validate).proposal;
    expect(after.issues).toEqual([]);
    const window = after.candidate.openings.find((item) => item.id === 'window-top')!;
    expect(window.offsetCm).toBe(150);
    const start = after.candidate.vertices.find((v) => v.id === 'v1')!;
    expect(start.xCm + window.offsetCm).toBe(-15 + 100);
    // Проём на сдвигаемой стене едет вместе с ней.
    expect(after.candidate.openings.find((item) => item.id === 'window-a')!.offsetCm).toBe(115);
  });

  it('слишком короткая стена для проёма отклоняет сдвиг с причиной', () => {
    const before = twoRoomApartmentWithWindow();
    before.openings.push({ id: 'window-top', kind: 'window', wallId: 'w1', offsetCm: 100, widthCm: 100,
      heightCm: 140, sillCm: 90 });
    const { issues } = previewChange(before, shiftWall('w6', 120), validate).proposal;
    expect(issues.map((issue) => issue.code)).toContain('opening-outside-wall');
  });
});

describe('откат при отказе (8.5)', () => {
  it('комната уже 80 см отклоняется, состояние до и после одинаково', () => {
    const apartment = twoRoomApartment();
    const history = createHistory(apartment);
    const snapshot = structuredClone(apartment);
    const result = execute(history, shiftWall('w7', 130), validate); // B: 200 → 70
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]!.code).toBe('size-out-of-range');
      expect(result.issues[0]!.message).toContain('Коридор Б');
      expect(result.issues[0]!.message).toContain('70 см');
    }
    expect(result.history).toBe(history);
    expect(history.present).toEqual(snapshot);
  });

  it('сдвиг через соседнюю стену отклоняется, комната не схлопывается', () => {
    const history = createHistory(twoRoomApartment());
    const result = execute(history, shiftWall('w7', 220), validate);
    expect(result.ok).toBe(false);
    expect(result.history.past).toHaveLength(0);
  });

  it('успешный сдвиг — один шаг истории', () => {
    const result = execute(createHistory(twoRoomApartment()), shiftWall('w7', 30), validate);
    expect(result.ok).toBe(true);
    expect(result.history.past).toHaveLength(1);
  });
});

describe('высота потолка (8.6)', () => {
  it('меняется в пределах 220–400 см', () => {
    const preview = previewChange(twoRoomApartment(), setCeilingHeight(300), validate);
    expect(preview.proposal.issues).toEqual([]);
    expect(preview.proposal.candidate.ceilingHeightCm).toBe(300);
  });

  it('вне пределов отклоняется', () => {
    for (const value of [200, 450]) {
      const { issues } = previewChange(twoRoomApartment(), setCeilingHeight(value), validate).proposal;
      expect(issues[0]!.code).toBe('size-out-of-range');
    }
  });

  it('конфликт с проёмом блокирует изменение', () => {
    const { issues } = previewChange(twoRoomApartmentWithWindow(), setCeilingHeight(220), validate).proposal;
    expect(issues.map((issue) => issue.code)).toContain('opening-too-tall');
    expect(issues[0]!.message).toContain('Окно выше потолка');
  });
});
