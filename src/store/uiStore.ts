import { create } from 'zustand';
import type { Id } from '../domain/types';
import type { PlacementResult, Pose } from '../geometry/placement';
import { DEFAULT_HOUR, normalizeHour } from '../scene3d/timeOfDay';
import { SNAPSHOT_IDLE, type SnapshotState } from '../scene3d/snapshot';

// Состояние интерфейса (SPEC §6, EditorState): этап, активная комната, выбор,
// черновик взаимодействия. В проект и в историю отмены не входит.

export type Stage = 'params' | 'template' | 'setup' | 'interior';

export type Selection =
  | { kind: 'furniture'; id: Id }
  | { kind: 'wall'; id: Id }
  | { kind: 'wall-surface'; wallId: Id; roomId: Id }
  | { kind: 'opening'; id: Id };

export type DraftSource = { type: 'new'; catalogItemId: Id } | { type: 'move'; furnitureId: Id };

/** Временный кандидат переноса. Пока он есть, вращение камеры отключено. */
export interface Draft {
  source: DraftSource;
  catalogItemId: Id;
  roomId: Id;
  pose: Pose;
  /** Указатель находится над планом или 3D-видом. */
  overSurface: boolean;
  result: PlacementResult;
}

/** Сбой загрузки модели предмета: что показать пользователю. */
export interface ModelLoadError {
  label: string;
  reason: string;
}

/** Команда «Качественному снимку» из интерфейса: сцена исполняет каждую команду один раз (по id). */
export interface SnapshotCommand { id: number; kind: 'start' | 'stop' | 'close'; samples?: number }

interface UiState {
  /** Состояние «Качественного снимка» (SPEC D-09); не входит в проект и в историю. */
  snapshot: SnapshotState;
  snapshotCommand: SnapshotCommand | null;
  setSnapshot(patch: Partial<SnapshotState>): void;
  sendSnapshotCommand(kind: SnapshotCommand['kind'], samples?: number): void;
  stage: Stage;
  activeRoomId: Id | null;
  selection: Selection | null;
  draft: Draft | null;
  /** Последнее сообщение для пользователя: причина отказа и подобное. */
  notice: string | null;
  /** Модели, которые не загрузились, по адресу файла. В проект и историю не входит. */
  modelErrors: Record<string, ModelLoadError>;
  /** Сколько раз пользователь повторил загрузку модели; меняет ключ границы ошибок. */
  modelRetry: Record<string, number>;
  reportModelError(url: string, label: string, reason: string): void;
  retryModel(url: string): void;
  /** Дверь, через которую пользователь вошёл в активную комнату; задаёт стартовую камеру. */
  arrivalDoorId: Id | null;
  /** Переход через дверь: как смена комнаты, но с запоминанием двери. */
  goThroughDoor(roomId: Id, doorId: Id): void;
  setStage(stage: Stage): void;
  /** Смена комнаты сбрасывает выбор и временный кандидат. */
  setActiveRoom(roomId: Id | null): void;
  select(selection: Selection | null): void;
  setDraft(draft: Draft | null): void;
  setNotice(notice: string | null): void;
  /** Время суток, час 0–24 (SPEC D-12). Не входит в проект и в историю отмены. */
  /** Режим «Прогулка» (D-17); не входит в проект и историю. */
  walk: boolean;
  setWalk(on: boolean): void;
  /** Комната, в которой сейчас стоит игрок в прогулке. */
  walkRoomId: Id | null;
  setWalkRoom(roomId: Id | null): void;
  timeOfDay: number;
  /** Выключатели потолочного света по комнатам (SPEC D-11); вне проекта и истории. Нет записи — выключен. */
  roomLights: Record<Id, boolean>;
  toggleRoomLight(roomId: Id): void;
  setTimeOfDay(hour: number): void;
}

export const useUiStore = create<UiState>()((set) => ({
  stage: 'params',
  activeRoomId: null,
  selection: null,
  draft: null,
  notice: null,
  modelErrors: {},
  modelRetry: {},
  arrivalDoorId: null,
  goThroughDoor: (activeRoomId, arrivalDoorId) => set({ activeRoomId, arrivalDoorId, selection: null, draft: null, notice: null }),
  setStage: (stage) => set({ stage, selection: null, draft: null }),
  setActiveRoom: (activeRoomId) => set({ activeRoomId, arrivalDoorId: null, selection: null, draft: null, notice: null }),
  select: (selection) => set({ selection }),
  setDraft: (draft) => set({ draft }),
  setNotice: (notice) => set({ notice }),
  walk: false,
  snapshot: SNAPSHOT_IDLE,
  snapshotCommand: null,
  setSnapshot: (patch) => set((state) => ({ snapshot: { ...state.snapshot, ...patch } })),
  sendSnapshotCommand: (kind, samples) => set((state) => ({ snapshotCommand: { id: (state.snapshotCommand?.id ?? 0) + 1, kind, samples } })),
  // Вход в прогулку закрывает снимок: он построен для одной комнаты и одной камеры.
  setWalk: (walk) => set((state) => ({
    walk, selection: null, draft: null,
    snapshotCommand: walk ? { id: (state.snapshotCommand?.id ?? 0) + 1, kind: 'close' as const } : state.snapshotCommand,
  })),
  walkRoomId: null,
  setWalkRoom: (walkRoomId) => set({ walkRoomId }),
  timeOfDay: DEFAULT_HOUR,
  roomLights: {},
  toggleRoomLight: (roomId) => set((state) => ({ roomLights: { ...state.roomLights, [roomId]: !state.roomLights[roomId] } })),
  setTimeOfDay: (hour) => set({ timeOfDay: normalizeHour(hour) }),
  reportModelError: (url, label, reason) =>
    set((state) => ({ modelErrors: { ...state.modelErrors, [url]: { label, reason } } })),
  retryModel: (url) =>
    set((state) => ({
      modelErrors: Object.fromEntries(Object.entries(state.modelErrors).filter(([key]) => key !== url)),
      modelRetry: { ...state.modelRetry, [url]: (state.modelRetry[url] ?? 0) + 1 },
    })),
}));
