import { getSurface } from './interaction/surfaces';
import { selectApartment, useProjectStore } from './store/projectStore';
import { useUiStore } from './store/uiStore';

// Отладочный доступ для браузерных проверок. Подключается только в режиме разработки.

export interface PlannerDebug {
  /** Фактические габариты загруженных моделей в сцене, см. */
  measured: Record<string, { width: number; depth: number; height: number }>;
  camera: { position: [number, number, number] } | null;
  /** Время от начала навигации до первого кадра сцены, мс. */
  sceneReadyMs: number | null;
  furniture(): Array<{ id: string; catalogItemId: string; xCm: number; zCm: number; rotationDeg: number }>;
  historyLength(): number;
  draft(): { valid: boolean; overSurface: boolean } | null;
  toClient(surfaceId: string, xCm: number, zCm: number): { x: number; y: number } | null;
}

declare global {
  interface Window {
    __planner?: PlannerDebug;
  }
}

export const plannerDebug: PlannerDebug = {
  measured: {},
  camera: null,
  sceneReadyMs: null,
  furniture: () =>
    (selectApartment(useProjectStore.getState())?.furniture ?? []).map((item) => ({
      id: item.id,
      catalogItemId: item.catalogItemId,
      xCm: item.xCm,
      zCm: item.zCm,
      rotationDeg: item.rotationDeg,
    })),
  historyLength: () => useProjectStore.getState().history?.past.length ?? 0,
  draft: () => {
    const draft = useUiStore.getState().draft;
    return draft ? { valid: draft.result.valid, overSurface: draft.overSurface } : null;
  },
  toClient: (surfaceId, xCm, zCm) => getSurface(surfaceId)?.toClient(xCm, zCm) ?? null,
};

if (import.meta.env.DEV) window.__planner = plannerDebug;
