import { validateIntegrity, type Issue } from '../domain/integrity';
import { roomClearRect, type Rect } from '../domain/rooms';
import type { Apartment, Id } from '../domain/types';
import { EPS_CM } from '../domain/units';

// Контракт изменения (SPEC §9): действующее состояние → кандидат → проверка →
// атомарное применение либо прежнее состояние. Квартира не изменяется на месте.

export interface Change {
  /** Название шага для истории и подсказок. */
  label: string;
  /** Возвращает новую квартиру; исходную не меняет. */
  apply(apartment: Apartment): Apartment;
}

export type Validator = (apartment: Apartment) => Issue[];

export interface Proposal {
  candidate: Apartment;
  issues: Issue[];
  /** Комнаты, чьи чистовые размеры изменились, а также добавленные и удалённые. */
  affectedRoomIds: Id[];
}

function sameRect(a: Rect, b: Rect): boolean {
  return (
    Math.abs(a.minX - b.minX) <= EPS_CM &&
    Math.abs(a.maxX - b.maxX) <= EPS_CM &&
    Math.abs(a.minZ - b.minZ) <= EPS_CM &&
    Math.abs(a.maxZ - b.maxZ) <= EPS_CM
  );
}

function affectedRooms(before: Apartment, after: Apartment): Id[] {
  const ids = new Set<Id>();
  const beforeIds = new Set(before.rooms.map((room) => room.id));
  for (const room of after.rooms) {
    const previous = before.rooms.find((candidate) => candidate.id === room.id);
    if (!previous || !sameRect(roomClearRect(before, previous), roomClearRect(after, room))) {
      ids.add(room.id);
    }
    beforeIds.delete(room.id);
  }
  for (const removed of beforeIds) ids.add(removed);
  return [...ids];
}

/** Строит и проверяет кандидат, не меняя действующую квартиру. Подходит для предпросмотра. */
export function proposeChange(
  apartment: Apartment,
  change: Change,
  validate: Validator = validateIntegrity,
): Proposal {
  let candidate: Apartment;
  try {
    candidate = change.apply(apartment);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      candidate: apartment,
      issues: [{ code: 'broken-reference', message: `Изменение невозможно: ${reason}`, objectIds: [] }],
      affectedRoomIds: [],
    };
  }
  const issues = validate(candidate);
  // Затронутые комнаты вычисляются только для целостного кандидата.
  const affectedRoomIds = issues.length === 0 ? affectedRooms(apartment, candidate) : [];
  return { candidate, issues, affectedRoomIds };
}

export interface History {
  past: Apartment[];
  present: Apartment;
  future: Apartment[];
}

export const HISTORY_LIMIT = 200;

export function createHistory(apartment: Apartment): History {
  return { past: [], present: apartment, future: [] };
}

export type ExecuteResult =
  | { ok: true; history: History; affectedRoomIds: Id[] }
  | { ok: false; history: History; issues: Issue[] };

/**
 * Применяет изменение целиком либо не применяет вовсе.
 * Один успешный вызов — один шаг истории отмены. При отказе возвращается
 * та же история; временные превью сюда не попадают — они не вызывают execute.
 */
export function execute(
  history: History,
  change: Change,
  validate: Validator = validateIntegrity,
): ExecuteResult {
  const proposal = proposeChange(history.present, change, validate);
  if (proposal.issues.length > 0) return { ok: false, history, issues: proposal.issues };
  if (proposal.candidate === history.present) return { ok: true, history, affectedRoomIds: [] };
  return {
    ok: true,
    history: {
      past: [...history.past, history.present].slice(-HISTORY_LIMIT),
      present: proposal.candidate,
      future: [],
    },
    affectedRoomIds: proposal.affectedRoomIds,
  };
}

export function canUndo(history: History): boolean {
  return history.past.length > 0;
}

export function canRedo(history: History): boolean {
  return history.future.length > 0;
}

export function undo(history: History): History {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo(history: History): History {
  const [next, ...rest] = history.future;
  if (!next) return history;
  return { past: [...history.past, history.present], present: next, future: rest };
}
