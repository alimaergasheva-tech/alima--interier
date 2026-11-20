import { create } from 'zustand';
import type { Id } from '../domain/types';

// Состояние интерфейса (SPEC §6, EditorState): этап, активная комната, выбор.
// В проект и в историю отмены не входит.

export type Stage = 'params' | 'template' | 'setup' | 'interior';

export type Selection =
  | { kind: 'furniture'; id: Id }
  | { kind: 'wall'; id: Id }
  | { kind: 'wall-surface'; wallId: Id; roomId: Id }
  | { kind: 'opening'; id: Id };

interface UiState {
  stage: Stage;
  activeRoomId: Id | null;
  selection: Selection | null;
  setStage(stage: Stage): void;
  /** Смена комнаты сбрасывает выбор: объект другой комнаты не остаётся выбранным. */
  setActiveRoom(roomId: Id | null): void;
  select(selection: Selection | null): void;
}

export const useUiStore = create<UiState>()((set) => ({
  stage: 'params',
  activeRoomId: null,
  selection: null,
  setStage: (stage) => set({ stage, selection: null }),
  setActiveRoom: (activeRoomId) => set({ activeRoomId, selection: null }),
  select: (selection) => set({ selection }),
}));
