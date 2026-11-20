import { roomClearRect } from './domain/rooms';
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
  /** Время суток, час 0–24. */
  timeOfDay(): number;
  /** Выключатели потолочного света по комнатам (задача 21.1). */
  roomLights(): Record<string, boolean>;
  draft(): { valid: boolean; overSurface: boolean } | null;
  /** Проекция точки комнаты (см) на экран 3D-вида; null, если сцены нет. */
  project3d: ((xCm: number, yCm: number, zCm: number) => { x: number; y: number }) | null;
  /** Что сейчас построено в 3D: активная комната и двери с центрами, см. */
  /** Идентификаторы предметов, построенных в 3D сейчас. */
  sceneFurniture: string[];
  sceneInfo: { roomId: string; finishedSides: string[]; clearCm: { width: number; depth: number }; doors: Array<{ id: string; xCm: number; yCm: number; zCm: number }> } | null;
  selection(): unknown;
  /** Что построено во внешнем мире (задача 20.3); null, пока мира нет. */
  world: { houses: number; trees: number; windows: number } | null;
  /** Свет комнаты сейчас (задача 20.4): основной источник с тенью, его сила, экспозиция и отражения; null без сцены. */
  lighting: { key: 'sun' | 'moon'; keyIntensity: number; hemisphere: number; exposure: number; environment: number } | null;
  /** Ресурсы отрисовщика (задача 20.6): геометрии, текстуры, программы шейдеров и вызовы отрисовки в последнем кадре; null без сцены. */
  renderInfo: (() => { geometries: number; textures: number; programs: number; calls: number }) | null;
  /** Положение игрока в режиме «Прогулка», см и градусы; null вне режима. */
  walk: { xCm: number; zCm: number; yawDeg: number; roomId: string } | null;
  /** Комнаты, чьи светильники сейчас светят в прогулке (не больше WALK_LIGHT_LIMIT). */
  walkLights: string[];
  /** Светильники каталога, чьи источники света сейчас назначены (не больше LAMP_LIGHT_LIMIT), id предметов. */
  lampLights: string[];
  /** Телепорт игрока (см, градусы); нужен для воспроизводимых проверок. */
  walkTo: ((xCm: number, zCm: number, yawDeg: number) => void) | null;
  /** Ставит камеру 3D-вида и точку взгляда (см); нужна для воспроизводимых кадров. */
  lookAt: ((positionCm: [number, number, number], targetCm: [number, number, number]) => void) | null;
  /** Центр чистового пола активной комнаты, см; null, если комнаты нет. */
  activeRoomCenter(): { xCm: number; zCm: number } | null;
  /** Смена активной комнаты, как при переходе через дверь. */
  setActiveRoom(roomId: string | null): void;
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
  project3d: null,
  sceneInfo: null,
  sceneFurniture: [],
  selection: () => useUiStore.getState().selection,
  world: null,
  walk: null,
  walkTo: null,
  walkLights: [],
  lampLights: [],
  lighting: null,
  renderInfo: null,
  lookAt: null,
  activeRoomCenter: () => {
    const apartment = selectApartment(useProjectStore.getState());
    const room = apartment?.rooms.find((item) => item.id === useUiStore.getState().activeRoomId);
    if (!apartment || !room) return null;
    const rect = roomClearRect(apartment, room);
    return { xCm: (rect.minX + rect.maxX) / 2, zCm: (rect.minZ + rect.maxZ) / 2 };
  },
  setActiveRoom: (roomId) => useUiStore.getState().setActiveRoom(roomId),
  furniture: () =>
    (selectApartment(useProjectStore.getState())?.furniture ?? []).map((item) => ({
      id: item.id,
      catalogItemId: item.catalogItemId,
      xCm: item.xCm,
      zCm: item.zCm,
      rotationDeg: item.rotationDeg,
    })),
  timeOfDay: () => useUiStore.getState().timeOfDay,
  roomLights: () => ({ ...useUiStore.getState().roomLights }),
  historyLength: () => useProjectStore.getState().history?.past.length ?? 0,
  draft: () => {
    const draft = useUiStore.getState().draft;
    return draft ? { valid: draft.result.valid, overSurface: draft.overSurface } : null;
  },
  toClient: (surfaceId, xCm, zCm) => getSurface(surfaceId)?.toClient(xCm, zCm) ?? null,
};

// В dev всегда; в сборке для замеров скорости (этап 18.3) — только при VITE_PLANNER_DEBUG=1.
if (import.meta.env.DEV || import.meta.env.VITE_PLANNER_DEBUG === '1') window.__planner = plannerDebug;
