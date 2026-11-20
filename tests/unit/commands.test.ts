import { beforeEach, describe, expect, it } from 'vitest';
import {
  canRedo,
  canUndo,
  createHistory,
  execute,
  proposeChange,
  redo,
  undo,
  type Change,
} from '../../src/commands/history';
import { historyActionForKey, isEditableTarget } from '../../src/commands/hotkeys';
import { getRoom, rectWidth, roomClearRect, totalNetAreaCm2 } from '../../src/domain/rooms';
import type { Apartment } from '../../src/domain/types';
import { cm2ToM2 } from '../../src/domain/units';
import { selectApartment, useProjectStore } from '../../src/store/projectStore';
import { useUiStore } from '../../src/store/uiStore';
import { twoRoomApartment } from './fixtures';

/** Сдвиг общей перегородки w7 вдоль X: двигаются оба её узла. */
function moveSharedWall(deltaCm: number): Change {
  return {
    label: 'Сдвиг общей стены',
    apply: (apartment) => ({
      ...apartment,
      vertices: apartment.vertices.map((vertex) =>
        vertex.id === 'v2' || vertex.id === 'v5' ? { ...vertex, xCm: vertex.xCm + deltaCm } : vertex,
      ),
    }),
  };
}

function setCeiling(heightCm: number): Change {
  return { label: 'Высота потолка', apply: (apartment) => ({ ...apartment, ceilingHeightCm: heightCm }) };
}

function widths(apartment: Apartment): [number, number] {
  return [
    rectWidth(roomClearRect(apartment, getRoom(apartment, 'room-a'))),
    rectWidth(roomClearRect(apartment, getRoom(apartment, 'room-b'))),
  ];
}

describe('предложение и атомарное применение (3.5)', () => {
  it('сдвиг общей стены меняет обе комнаты, сумма площадей сохраняется', () => {
    const before = twoRoomApartment();
    const proposal = proposeChange(before, moveSharedWall(30));
    expect(proposal.issues).toEqual([]);
    expect(widths(proposal.candidate)).toEqual([430, 170]);
    expect(cm2ToM2(totalNetAreaCm2(proposal.candidate))).toBe(18);
    expect(proposal.affectedRoomIds.sort()).toEqual(['room-a', 'room-b']);
  });

  it('предложение не меняет действующую квартиру', () => {
    const before = twoRoomApartment();
    const snapshot = structuredClone(before);
    proposeChange(before, moveSharedWall(30));
    expect(before).toEqual(snapshot);
  });

  it('невалидный кандидат не применяется: состояние до и после отказа одно и то же', () => {
    const history = createHistory(twoRoomApartment());
    const snapshot = structuredClone(history.present);
    // Сдвиг на 220 см совмещает перегородку с внешней стеной: стены w2 и w4 вырождаются.
    const result = execute(history, moveSharedWall(220));
    expect(result.ok).toBe(false);
    expect(result.history).toBe(history);
    expect(result.history.present).toEqual(snapshot);
    if (!result.ok) expect(result.issues[0]?.code).toBe('degenerate-wall');
    expect(canUndo(result.history)).toBe(false);
  });

  it('изменение с ошибкой внутри не ломает состояние', () => {
    const history = createHistory(twoRoomApartment());
    const result = execute(history, {
      label: 'Сбой',
      apply: () => {
        throw new Error('нет такой стены');
      },
    });
    expect(result.ok).toBe(false);
    expect(result.history).toBe(history);
  });
});

describe('история отмены и повтора (3.6)', () => {
  it('один шаг истории — одно применённое изменение; отмена и повтор восстанавливают квартиру целиком', () => {
    const initial = twoRoomApartment();
    let history = createHistory(initial);

    const first = execute(history, moveSharedWall(30));
    expect(first.ok).toBe(true);
    history = first.history;
    const afterFirst = history.present;

    const second = execute(history, setCeiling(300));
    history = second.history;
    expect(history.past).toHaveLength(2);

    history = undo(history);
    expect(history.present).toBe(afterFirst);
    history = undo(history);
    expect(history.present).toBe(initial);
    expect(history.present).toEqual(twoRoomApartment());
    expect(canUndo(history)).toBe(false);

    history = redo(redo(history));
    expect(history.present.ceilingHeightCm).toBe(300);
    expect(widths(history.present)).toEqual([430, 170]);
    expect(canRedo(history)).toBe(false);
  });

  it('новое изменение после отмены очищает ветку повтора', () => {
    let history = execute(createHistory(twoRoomApartment()), moveSharedWall(30)).history;
    history = undo(history);
    expect(canRedo(history)).toBe(true);
    history = execute(history, setCeiling(250)).history;
    expect(canRedo(history)).toBe(false);
  });

  it('предпросмотр и отклонённые изменения в историю не попадают', () => {
    const history = createHistory(twoRoomApartment());
    proposeChange(history.present, moveSharedWall(30));
    const rejected = execute(history, moveSharedWall(220));
    expect(rejected.history.past).toHaveLength(0);
  });

  it('отмена и повтор на пустой истории ничего не меняют', () => {
    const history = createHistory(twoRoomApartment());
    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
  });
});

describe('хранилище проекта', () => {
  beforeEach(() => {
    useProjectStore.setState({ history: null });
    useUiStore.setState({ stage: 'params', activeRoomId: null, selection: null });
  });

  it('применяет, отменяет и повторяет изменения', () => {
    const store = useProjectStore.getState();
    expect(store.execute(setCeiling(300))).toBeNull();

    store.loadApartment(twoRoomApartment());
    expect(useProjectStore.getState().execute(setCeiling(300))?.ok).toBe(true);
    expect(selectApartment(useProjectStore.getState())?.ceilingHeightCm).toBe(300);

    useProjectStore.getState().undo();
    expect(selectApartment(useProjectStore.getState())?.ceilingHeightCm).toBe(270);
    useProjectStore.getState().redo();
    expect(selectApartment(useProjectStore.getState())?.ceilingHeightCm).toBe(300);
  });

  it('загрузка другой квартиры очищает историю', () => {
    useProjectStore.getState().loadApartment(twoRoomApartment());
    useProjectStore.getState().execute(setCeiling(300));
    useProjectStore.getState().loadApartment(twoRoomApartment());
    expect(useProjectStore.getState().history?.past).toHaveLength(0);
  });

  it('выбор и активная комната хранятся отдельно от проекта и не создают шагов истории', () => {
    useProjectStore.getState().loadApartment(twoRoomApartment());
    const before = useProjectStore.getState().history;
    useUiStore.getState().setActiveRoom('room-a');
    useUiStore.getState().select({ kind: 'wall', id: 'w7' });
    expect(useProjectStore.getState().history).toBe(before);

    useUiStore.getState().setActiveRoom('room-b');
    expect(useUiStore.getState().selection).toBeNull();
  });
});

describe('горячие клавиши истории', () => {
  const key = (code: string, extra: Partial<Parameters<typeof historyActionForKey>[0]> = {}) => ({
    code,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...extra,
  });

  it('Ctrl+Z — отмена, Ctrl+Y и Ctrl+Shift+Z — повтор', () => {
    expect(historyActionForKey(key('KeyZ'))).toBe('undo');
    expect(historyActionForKey(key('KeyY'))).toBe('redo');
    expect(historyActionForKey(key('KeyZ', { shiftKey: true }))).toBe('redo');
    expect(historyActionForKey(key('KeyZ', { ctrlKey: false }))).toBeNull();
    expect(historyActionForKey(key('KeyR'))).toBeNull();
  });

  it('в полях ввода клавиши не перехватываются', () => {
    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isEditableTarget({ tagName: 'textarea' })).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isEditableTarget({ tagName: 'CANVAS' })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
