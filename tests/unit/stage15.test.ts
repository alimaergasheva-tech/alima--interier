import { describe, expect, it } from 'vitest';
import { findCatalogItem } from '../../src/catalog/techCatalog';
import { setSideFinish } from '../../src/commands/finishes';
import { addFurniture, removeFurniture, setFurniturePose } from '../../src/commands/furniture';
import { canRedo, canUndo, createHistory, execute, redo, undo, type History } from '../../src/commands/history';
import { shiftWall, withSetupLimits } from '../../src/commands/setup';
import type { Apartment, FurnitureInstance } from '../../src/domain/types';
import { createApartmentValidator } from '../../src/geometry/validateApartment';
import { useProjectStore } from '../../src/store/projectStore';
import { useUiStore } from '../../src/store/uiStore';
import { twoRoomApartment } from './fixtures';

// Этап 15: связка настройки и интерьера, скрытые комнаты, отмена по всему сценарию (AC-09, AC-16).

const validate = withSetupLimits(createApartmentValidator(findCatalogItem));

function instance(id: string, catalogItemId: string, roomId: string, xCm: number, zCm: number, rotationDeg = 0): FurnitureInstance {
  return { id, catalogItemId, assetVersion: 1, roomId, xCm, zCm, elevationCm: 0, rotationDeg, variantId: null };
}

/** Комната А — гостиная 400 × 330 (x −0…400), коридор Б — 200 × 330 (x 410…610), общая стена w7 толщиной 10 см. */
function furnished(): Apartment {
  const base = twoRoomApartment();
  return {
    ...base,
    furniture: [
      instance('sofa-a', 'sofa_03', 'room-a', 200, 100),
      // Стул у общей стены в скрытой комнате Б (зазор около 8 см): сдвиг стены на 30 см его заденет.
      instance('chair-b', 'dining_chair_02', 'room-b', 440, 50),
    ],
  };
}

describe('конфликт с мебелью в скрытой комнате (15.3, 15.4, AC-09)', () => {
  const start = createHistory(furnished());

  it('исходная расстановка допустима', () => {
    expect(validate(start.present).map((issue) => issue.message)).toEqual([]);
  });

  it('сдвиг стены внутрь комнаты Б отклоняется: комната, предмет и причина названы', () => {
    const result = execute(start, shiftWall('w7', 30), validate);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const issue = result.issues.find((item) => item.code === 'furniture-conflict');
    expect(issue, JSON.stringify(result.issues)).toBeDefined();
    expect(issue!.message).toContain('Коридор Б');
    expect(issue!.message).toMatch(/стул/i);
    expect(issue!.message).toContain('пересекает стену');
    expect(issue!.objectIds).toContain('chair-b');
  });

  it('при отказе прежнее состояние и история не меняются', () => {
    const result = execute(start, shiftWall('w7', 30), validate);
    expect(result.history.present).toEqual(start.present);
    expect(result.history.past).toHaveLength(0);
  });

  it('конфликт исправляется: после переноса стула сдвиг проходит, остальные данные целы', () => {
    const fixed = execute(start, setFurniturePose('chair-b', { xCm: 480, zCm: 50, rotationDeg: 0 }), validate);
    expect(fixed.ok).toBe(true);
    const shifted = execute(fixed.history, shiftWall('w7', 30), validate);
    expect(shifted.ok).toBe(true);
    expect(shifted.history.present.furniture.map((item) => item.id).sort()).toEqual(['chair-b', 'sofa-a']);
  });
});

describe('возврат в настройку не очищает проект (15.1, 15.2)', () => {
  it('смена этапа не трогает мебель, отделку и историю', () => {
    const apartment = setSideFinish('room-a', 'w7', 'paint-sage').apply(furnished());
    useProjectStore.getState().loadApartment(apartment);
    useProjectStore.getState().execute(setFurniturePose('sofa-a', { xCm: 220, zCm: 100, rotationDeg: 0 }));
    const before = useProjectStore.getState().history;
    for (const stage of ['setup', 'interior', 'setup', 'interior'] as const) useUiStore.getState().setStage(stage);
    expect(useProjectStore.getState().history).toBe(before);
    expect(useProjectStore.getState().history!.present.furniture).toHaveLength(2);
  });
});

describe('отмена и повтор по всему сценарию (15.6, AC-16)', () => {
  const steps = [
    { label: 'добавить диван', change: () => addFurniture(instance('sofa-2', 'sofa_03', 'room-a', 200, 250), 'Диван') },
    { label: 'покрасить стену', change: () => setSideFinish('room-a', 'w7', 'paint-sage') },
    { label: 'сдвинуть стену', change: () => shiftWall('w7', 5) },
    { label: 'переместить диван', change: () => setFurniturePose('sofa-2', { xCm: 150, zCm: 250, rotationDeg: 0 }) },
    { label: 'удалить стул', change: () => removeFurniture('chair-b') },
  ];

  it('каждый шаг применим и отменяется до исходного состояния, повтор возвращает итог', () => {
    const initial = createHistory(furnished());
    let history: History = initial;
    const snapshots: Apartment[] = [initial.present];
    for (const step of steps) {
      const result = execute(history, step.change(), validate);
      expect(result.ok ? 'ok' : result.issues.map((issue) => issue.message).join('; '), step.label).toBe('ok');
      history = result.history;
      snapshots.push(history.present);
    }
    const final = history.present;
    expect(history.past).toHaveLength(steps.length);

    for (let i = steps.length - 1; i >= 0; i -= 1) {
      history = undo(history);
      expect(history.present, `отмена: ${steps[i]!.label}`).toEqual(snapshots[i]);
    }
    expect(canUndo(history)).toBe(false);
    expect(history.present).toEqual(initial.present);

    for (let i = 0; i < steps.length; i += 1) history = redo(history);
    expect(canRedo(history)).toBe(false);
    expect(history.present).toEqual(final);
  });
});
