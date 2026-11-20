// «Качественный снимок» (SPEC D-09, этап 17): чистая логика — варианты качества, контракт снимка
// (из чего он построен) и проверка, что результат ещё соответствует проекту. Без three и React.

/** Число выборок path tracing по вариантам качества; на Mac M1 около 1,2 с на выборку (docs/stage-16/pathtrace-mac.json). */
export const SNAPSHOT_QUALITY = [
  { id: 'draft', label: 'Черновик', samples: 16 },
  { id: 'normal', label: 'Обычный', samples: 64 },
  { id: 'clean', label: 'Чистый', samples: 256 },
] as const;

export const DEFAULT_SNAPSHOT_SAMPLES = 64;

/** Из чего построен снимок: любое отличие делает результат неактуальным (задача 17.1, 17.4). */
export interface SnapshotBasis {
  /** Квартира как неизменяемый объект: любая правка проекта даёт новый объект. */
  apartment: unknown;
  roomId: string;
  hour: number;
  /** Включённость света по комнатам. */
  lights: Record<string, boolean>;
  canvasWidth: number;
  canvasHeight: number;
  /** Положение и поворот камеры: x, y, z и кватернион x, y, z, w. */
  camera: number[];
}

const CAMERA_EPS = 1e-6;

function sameLights(a: Record<string, boolean>, b: Record<string, boolean>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) if ((a[key] === true) !== (b[key] === true)) return false;
  return true;
}

/** Причина, по которой снимок устарел, или null, если он соответствует текущему состоянию. */
export function snapshotStaleReason(start: SnapshotBasis, now: SnapshotBasis): string | null {
  if (start.apartment !== now.apartment) return 'проект изменён';
  if (start.roomId !== now.roomId) return 'выбрана другая комната';
  if (start.hour !== now.hour) return 'изменено время суток';
  if (!sameLights(start.lights, now.lights)) return 'изменено освещение комнаты';
  if (start.canvasWidth !== now.canvasWidth || start.canvasHeight !== now.canvasHeight) return 'изменился размер 3D-вида';
  if (start.camera.length !== now.camera.length || start.camera.some((v, i) => Math.abs(v - now.camera[i]!) > CAMERA_EPS)) return 'изменена камера';
  return null;
}

/** Типы материалов, у которых нет поля color: трассировщик их не читает (версия 0.0.28), такие объекты в снимок не берутся. */
const NO_COLOR_MATERIALS = new Set(['ShaderMaterial', 'RawShaderMaterial', 'LineBasicMaterial', 'LineDashedMaterial', 'PointsMaterial']);

/** Нужно ли скрыть объект на время трассировки: помощники редактора, свечение-значок лампы, материалы без цвета. */
export function hiddenInSnapshot(objectName: string, materialTypes: string[]): boolean {
  if (objectName === 'editor-helper' || objectName === 'lamp-glow') return true;
  return materialTypes.some((type) => NO_COLOR_MATERIALS.has(type));
}

export type SnapshotPhase = 'idle' | 'preparing' | 'running' | 'done' | 'error';

export interface SnapshotState {
  phase: SnapshotPhase;
  samples: number;
  target: number;
  seconds: number;
  /** Причина закрытия или текст ошибки; null без сообщения. */
  message: string | null;
}

export const SNAPSHOT_IDLE: SnapshotState = { phase: 'idle', samples: 0, target: DEFAULT_SNAPSHOT_SAMPLES, seconds: 0, message: null };

/** Доля выполненного 0…1 для полосы прогресса. */
export function snapshotProgress(state: Pick<SnapshotState, 'samples' | 'target'>): number {
  if (state.target <= 0) return 0;
  return Math.max(0, Math.min(1, state.samples / state.target));
}

/**
 * Экспозиция снимка. Ночная прибавка экспозиции нужна растровому виду, где нет отражённого света;
 * в трассировке при включённых лампах комната от неё пересвечивается (кадр docs/stage-21/snapshot-night-on.png, 20.11.2026),
 * поэтому с включённым светом прибавка уменьшается до 30 % ночью. Днём экспозиция не меняется.
 */
export function snapshotExposure(baseExposure: number, daylight: number, lightOn: boolean): number {
  const night = 1 - Math.max(0, Math.min(1, daylight));
  const boost = 1 + 0.8 * night;
  return baseExposure * boost * (lightOn ? 1 - 0.7 * night : 1);
}
