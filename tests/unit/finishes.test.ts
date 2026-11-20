import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { finishCatalog, findFinish } from '../../src/catalog/finishes';
import { createHistory, execute, undo } from '../../src/commands/history';
import { setSideFinish, sideFinishId, sideWallIds, textureRepeatPerMeter } from '../../src/commands/finishes';
import { shiftWall } from '../../src/commands/setup';
import { validateIntegrity } from '../../src/domain/integrity';
import { wallSurfaceKey } from '../../src/domain/rooms';
import { layoutTemplates } from '../../src/layouts/templates';
import { PATTERN_KINDS } from '../../src/scene3d/wallpaperPatterns';
import { twoRoomApartment } from './fixtures';

const paint = 'paint-sage';
const wallpaper = 'wp-botanical-sage';

describe('отделка стороны стены (12.1, 12.3, AC-11)', () => {
  it('краска одной стороны общей перегородки не меняет соседнюю комнату', () => {
    const apartment = setSideFinish('room-a', 'w7', paint).apply(twoRoomApartment());
    expect(apartment.wallFinishes).toEqual({ [wallSurfaceKey('w7', 'room-a')]: paint });
    expect(sideFinishId(apartment, 'room-a', 'w7')).toBe(paint);
    expect(sideFinishId(apartment, 'room-b', 'w7')).toBeNull();
    const both = setSideFinish('room-b', 'w7', wallpaper).apply(apartment);
    expect(sideFinishId(both, 'room-a', 'w7')).toBe(paint);
    expect(sideFinishId(both, 'room-b', 'w7')).toBe(wallpaper);
  });

  it('сторона из нескольких участков получает отделку целиком, но только в своей комнате', () => {
    const apartment = layoutTemplates.find((item) => item.id === '4a')!.apartment;
    const corridor = apartment.rooms.find((room) => room.id === 'room-corridor')!;
    const north = corridor.boundary.map((ref) => ref.wallId).find((id) => sideWallIds(apartment, corridor.id, id).length > 3)!;
    const ids = sideWallIds(apartment, corridor.id, north);
    expect(ids.length).toBeGreaterThan(3);
    const painted = setSideFinish(corridor.id, north, paint).apply(apartment);
    expect(Object.keys(painted.wallFinishes).sort()).toEqual(ids.map((id) => wallSurfaceKey(id, corridor.id)).sort());
    expect(Object.keys(painted.wallFinishes).every((key) => key.endsWith(`:${corridor.id}`))).toBe(true);
    const cleared = setSideFinish(corridor.id, north, null).apply(painted);
    expect(cleared.wallFinishes).toEqual({});
  });

  it('неизвестный материал отклоняется, квартира и история прежние; отмена возвращает состояние', () => {
    const history = createHistory(twoRoomApartment());
    const bad = execute(history, setSideFinish('room-a', 'w7', 'нет-такого'));
    expect(bad.ok).toBe(false);
    expect(bad.history).toBe(history);
    const ok = execute(history, setSideFinish('room-a', 'w7', paint));
    expect(ok.ok).toBe(true);
    expect(ok.history.past).toHaveLength(1);
    expect(undo(ok.history).present.wallFinishes).toEqual({});
  });

  it('целостность отклоняет отделку несуществующей поверхности', () => {
    const apartment = twoRoomApartment();
    apartment.wallFinishes = { 'w1:room-b': paint };
    expect(validateIntegrity(apartment).map((issue) => issue.code)).toContain('broken-reference');
  });
});

describe('отделка сохраняется при изменении геометрии (12.5)', () => {
  it('сдвиг стены не теряет отделку обеих сторон', () => {
    let apartment = setSideFinish('room-a', 'w7', paint).apply(twoRoomApartment());
    apartment = setSideFinish('room-b', 'w7', wallpaper).apply(apartment);
    const shifted = shiftWall('w7', 30).apply(apartment);
    expect(shifted.wallFinishes).toEqual(apartment.wallFinishes);
    expect(validateIntegrity(shifted)).toEqual([]);
  });
});

describe('физический масштаб рисунка (12.4)', () => {
  it('повтор считается из размера плитки в см и не зависит от длины стены', () => {
    expect(textureRepeatPerMeter({ width: 100, height: 100 })).toEqual({ x: 1, y: 1 });
    expect(textureRepeatPerMeter({ width: 25, height: 50 })).toEqual({ x: 4, y: 2 });
    const material = findFinish(wallpaper)!.tileSizeCm!;
    const repeat = textureRepeatPerMeter(material);
    // Число повторов на стене растёт пропорционально длине, а размер одного рисунка остаётся прежним.
    const repeatsOn = (lengthCm: number) => (lengthCm / 100) * repeat.x;
    expect(repeatsOn(480) / repeatsOn(240)).toBeCloseTo(2, 10);
    expect(100 / repeat.x).toBeCloseTo(material.width, 10);
  });
});

describe('каталог отделки (12.2, задача 28)', () => {
  it('много красок и обоев, id уникальны, размеры положительны, узоры существуют', () => {
    expect(finishCatalog.filter((item) => item.kind === 'paint').length).toBeGreaterThanOrEqual(12);
    expect(finishCatalog.filter((item) => item.kind === 'wallpaper').length).toBeGreaterThanOrEqual(30);
    expect(new Set(finishCatalog.map((item) => item.id)).size).toBe(finishCatalog.length);
    for (const item of finishCatalog) {
      if (item.kind === 'wallpaper') {
        expect(item.tileSizeCm!.width, item.id).toBeGreaterThan(0);
        expect(Boolean(item.pattern) !== Boolean(item.textureUrl), `${item.id}: либо узор, либо файл`).toBe(true);
      }
      if (item.pattern) expect(PATTERN_KINDS, item.id).toContain(item.pattern.kind);
      if (item.textureUrl) {
        expect(existsSync(`public${item.textureUrl}`), item.id).toBe(true);
        expect(item.license?.license, item.id).toBe('CC0 1.0');
      }
    }
  });
});
