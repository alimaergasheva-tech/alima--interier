import { create } from 'zustand';
import { findCatalogItem } from '../catalog/techCatalog';
import {
  createHistory,
  execute,
  redo,
  undo,
  type Change,
  type ExecuteResult,
  type History,
  type Validator,
} from '../commands/history';
import type { Apartment } from '../domain/types';
import { createApartmentValidator } from '../geometry/validateApartment';

// Данные проекта и история отмены. Состояние интерфейса хранится отдельно (uiStore).

const defaultValidator = createApartmentValidator(findCatalogItem);

interface ProjectState {
  /** null — схема квартиры ещё не выбрана. */
  history: History | null;
  /** Заменяет квартиру целиком и очищает историю отмены (выбор схемы, SPEC §8). */
  loadApartment(apartment: Apartment): void;
  /** Единственный путь изменения квартиры из интерфейса. */
  execute(change: Change, validate?: Validator): ExecuteResult | null;
  undo(): void;
  redo(): void;
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  history: null,
  loadApartment: (apartment) => set({ history: createHistory(apartment) }),
  execute: (change, validate = defaultValidator) => {
    const { history } = get();
    if (!history) return null;
    const result = execute(history, change, validate);
    if (result.ok && result.history !== history) set({ history: result.history });
    return result;
  },
  undo: () => {
    const { history } = get();
    if (history) set({ history: undo(history) });
  },
  redo: () => {
    const { history } = get();
    if (history) set({ history: redo(history) });
  },
}));

export function selectApartment(state: ProjectState): Apartment | null {
  return state.history?.present ?? null;
}
