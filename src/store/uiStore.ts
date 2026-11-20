import { create } from 'zustand';
import type { Id } from '../domain/types';
import type { PlacementResult, Pose } from '../geometry/placement';

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

interface UiState {
  stage: Stage;
  activeRoomId: Id | null;
  selection: Selection | null;
  draft: Draft | null;
  /** Последнее сообщение для пользователя: причина отказа и подобное. */
  notice: string | null;
  setStage(stage: Stage): void;
  /** Смена комнаты сбрасывает выбор и временный кандидат. */
  setActiveRoom(roomId: Id | null): void;
  select(selection: Selection | null): void;
  setDraft(draft: Draft | null): void;
  setNotice(notice: string | null): void;
}

export const useUiStore = create<UiState>()((set) => ({
  stage: 'params',
  activeRoomId: null,
  selection: null,
  draft: null,
  notice: null,
  setStage: (stage) => set({ stage, selection: null, draft: null }),
  setActiveRoom: (activeRoomId) => set({ activeRoomId, selection: null, draft: null }),
  select: (selection) => set({ selection }),
  setDraft: (draft) => set({ draft }),
  setNotice: (notice) => set({ notice }),
}));
