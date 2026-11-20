import { describe, expect, it } from 'vitest';
import { finishCatalog, findFinish } from '../../src/catalog/finishes';
import { createHistory, execute, redo, undo } from '../../src/commands/history';
import { setRoomFloor } from '../../src/commands/finishes';
import { validateIntegrity } from '../../src/domain/integrity';
import { PATTERN_KINDS } from '../../src/scene3d/wallpaperPatterns';
import { twoRoomApartment } from './fixtures';

// Задача 23.1–23.2: покрытие пола комнаты (SPEC D-16).

describe('покрытия пола в каталоге (23.2)', () => {
  const floors = finishCatalog.filter((item) => item.kind === 'floor');

  it('три вида по три цвета, процедурные, с физическим масштабом', () => {
    for (const group of ['Ламинат', 'Линолеум', 'Ковролин']) {
      expect(floors.filter((item) => item.group === group), group).toHaveLength(3);
    }
    for (const item of floors) {
      expect(item.textureUrl, item.id).toBeUndefined();
      expect(PATTERN_KINDS, item.id).toContain(item.pattern!.kind);
      expect(item.tileSizeCm!.width, item.id).toBeGreaterThan(0);
    }
  });

  it('ламинат: доска 19 × 120 см — тайл 120 см шириной и четыре ряда по 19 см', () => {
    for (const item of floors.filter((f) => f.group === 'Ламинат')) {
      expect(item.tileSizeCm).toEqual({ width: 120, height: 76 });
    }
  });
});

describe('команда покрытия пола (23.1)', () => {
  it('назначает пол только своей комнате, отмена и повтор работают', () => {
    const start = createHistory(twoRoomApartment());
    const ok = execute(start, setRoomFloor('room-a', 'floor-laminate-oak'));
    if (!ok.ok) throw new Error('команда отклонена');
    expect(ok.history.present.floorFinishes).toEqual({ 'room-a': 'floor-laminate-oak' });
    expect(undo(ok.history).present.floorFinishes ?? {}).toEqual({});
    expect(redo(undo(ok.history)).present.floorFinishes).toEqual({ 'room-a': 'floor-laminate-oak' });
    expect(validateIntegrity(ok.history.present)).toEqual([]);
  });

  it('замена и снятие покрытия', () => {
    const a = execute(createHistory(twoRoomApartment()), setRoomFloor('room-a', 'floor-carpet-grey'));
    if (!a.ok) throw new Error('команда отклонена');
    const b = execute(a.history, setRoomFloor('room-a', 'floor-linoleum-beige'));
    if (!b.ok) throw new Error('команда отклонена');
    expect(b.history.present.floorFinishes).toEqual({ 'room-a': 'floor-linoleum-beige' });
    const c = execute(b.history, setRoomFloor('room-a', null));
    if (!c.ok) throw new Error('команда отклонена');
    expect(c.history.present.floorFinishes).toEqual({});
  });

  it('отклоняет материал не из пола и несуществующую комнату', () => {
    const history = createHistory(twoRoomApartment());
    expect(execute(history, setRoomFloor('room-a', 'paint-sage')).ok).toBe(false);
    expect(execute(history, setRoomFloor('room-a', 'нет-такого')).ok).toBe(false);
    expect(execute(history, setRoomFloor('нет-комнаты', 'floor-carpet-grey')).ok).toBe(false);
  });

  it('проверка целостности находит покрытие с несуществующей комнатой или материалом', () => {
    const apartment = { ...twoRoomApartment(), floorFinishes: { 'room-zzz': 'floor-carpet-grey', 'room-a': 'paint-sage' } };
    const issues = validateIntegrity(apartment);
    expect(issues.filter((issue) => issue.code === 'broken-reference')).toHaveLength(2);
  });

  it('все покрытия найдены по id', () => {
    for (const item of finishCatalog.filter((f) => f.kind === 'floor')) expect(findFinish(item.id)).toBe(item);
  });
});
