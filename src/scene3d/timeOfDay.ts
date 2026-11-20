import { LIGHTING } from './lighting';

// Модель времени суток (задача 20.1, SPEC D-12). Чистые функции: час 0–24 → свет и цвета неба.
// Время суток не входит в проект и в историю отмены; хранится только в состоянии интерфейса.

export type Vec3 = [number, number, number];

export interface SkyState {
  /** Час, приведённый к [0, 24). */
  hour: number;
  /** Единичный вектор на солнце (Y вверх, +X — восток, +Z — юг). */
  sunDirection: Vec3;
  /** Единичный вектор на луну (противоположен солнцу). */
  moonDirection: Vec3;
  /** Высота солнца над горизонтом, −1…1 (синус угла). */
  sunHeight: number;
  /** Свет солнца: цвет и сила (0 ночью). */
  sun: { color: string; intensity: number };
  /** Свет луны: холодный цвет и сила (0 днём). */
  moon: { color: string; intensity: number };
  /** Цвета неба: зенит и горизонт. */
  sky: { top: string; horizon: string };
  /** Заполняющий свет полусферы. */
  hemisphere: { sky: string; ground: string; intensity: number };
  /** Отражения PBR-материалов от окружения, множитель к LIGHTING.environmentIntensity. */
  environmentScale: number;
  /** Видимость звёзд 0…1. */
  stars: number;
  /** Доля дневного света 0…1 (для окон и внешнего мира). */
  daylight: number;
}

/** Быстрые кнопки (D-12): час, на который они ставят ползунок. */
export const TIME_PRESETS = [
  { id: 'morning', label: 'Утро', hour: 7 },
  { id: 'day', label: 'День', hour: 13 },
  { id: 'evening', label: 'Вечер', hour: 17.5 },
  { id: 'night', label: 'Ночь', hour: 23 },
] as const;

export const DEFAULT_HOUR = 13;

/** Приводит любой час к [0, 24); нечисловое значение даёт час по умолчанию. */
export function normalizeHour(hour: number): number {
  if (!Number.isFinite(hour)) return DEFAULT_HOUR;
  return ((hour % 24) + 24) % 24;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

type Rgb = [number, number, number];
function parse(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function format([r, g, b]: Rgb): string {
  const to = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}
/** Смешивание цветов #rrggbb: t = 0 → a, t = 1 → b. */
export function mixColors(a: string, b: string, t: number): string {
  const [x, y] = [parse(a), parse(b)];
  const k = clamp01(t);
  return format([x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k]);
}

const NIGHT = { top: '#04060e', horizon: '#0f1830' };
const DAY = { top: '#5c9be3', horizon: '#cfe4f7' };
const TWILIGHT = { top: '#33406e', horizon: '#ff9c6a' };

/** Положение и свет по часу: восход в 6:00, закат в 18:00, полдень — наибольшая высота. */
export function skyAt(hourInput: number): SkyState {
  const hour = normalizeHour(hourInput);
  // Угол на суточной дуге: 0 — восход (восток), π/2 — полдень, π — закат (запад), 3π/2 — полночь.
  const angle = (2 * Math.PI * (hour - 6)) / 24;
  const raw: Vec3 = [Math.cos(angle), Math.sin(angle) * 0.95, 0.35];
  const length = Math.hypot(...raw);
  const sunDirection = raw.map((v) => v / length) as Vec3;
  const moonDirection = sunDirection.map((v) => -v) as Vec3;
  const height = sunDirection[1];
  const moonHeight = moonDirection[1];

  // Дневной свет нарастает от горизонта и выходит на максимум примерно при 20° высоты.
  const daylight = smoothstep(-0.08, 0.3, height);
  // Сумерки: узкая полоса вокруг горизонта.
  const twilight = Math.exp(-(((height + 0.02) / 0.16) ** 2));
  const warm = 1 - smoothstep(0.05, 0.5, height);

  const sun = {
    color: mixColors('#fff3df', '#ff9457', warm),
    intensity: LIGHTING.sun.intensity * smoothstep(-0.02, 0.28, height),
  };
  const moon = {
    color: '#9bb4ff',
    intensity: 0.45 * smoothstep(-0.02, 0.3, moonHeight) * (1 - daylight),
  };

  const base = { top: mixColors(NIGHT.top, DAY.top, daylight), horizon: mixColors(NIGHT.horizon, DAY.horizon, daylight) };
  const sky = {
    top: mixColors(base.top, TWILIGHT.top, twilight * 0.75),
    horizon: mixColors(base.horizon, TWILIGHT.horizon, twilight * 0.9),
  };

  const hemisphere = {
    sky: mixColors('#7d93c9', LIGHTING.hemisphere.sky, daylight),
    ground: mixColors('#1c1a1f', LIGHTING.hemisphere.ground, daylight),
    intensity: 0.1 + (LIGHTING.hemisphere.intensity - 0.1) * daylight,
  };

  return {
    hour, sunDirection, moonDirection, sunHeight: height, sun, moon, sky, hemisphere,
    environmentScale: 0.2 + 0.8 * daylight,
    stars: 1 - smoothstep(-0.32, -0.04, height),
    daylight,
  };
}

/** Час для подписи: 13 → «13:00», 17,5 → «17:30». */
export function formatHour(hourInput: number): string {
  const total = Math.round(normalizeHour(hourInput) * 60) % (24 * 60);
  const h = Math.floor(total / 60), m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Идентификатор быстрой кнопки, чей час совпадает с текущим; иначе null. */
export function activePreset(hour: number): (typeof TIME_PRESETS)[number]['id'] | null {
  return TIME_PRESETS.find((preset) => Math.abs(normalizeHour(hour) - preset.hour) < 1e-9)?.id ?? null;
}
