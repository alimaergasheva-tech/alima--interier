import { ACESFilmicToneMapping } from 'three';
import type { SkyState } from './timeOfDay';

// Единое освещение интерактивного вида (задача 16.1): все числа здесь, чтобы окружение, солнце
// и тени менялись в одном месте. Время суток (этап 20) и светильники (этап 21) надстраиваются над ним.

export const LIGHTING = {
  toneMapping: ACESFilmicToneMapping,
  toneMappingExposure: 1,
  /** Отражения PBR-материалов от нейтральной комнаты, файлы не загружаются. */
  environmentIntensity: 0.55,
  hemisphere: { sky: '#ffffff', ground: '#8a7f72', intensity: 0.55 },
  sun: {
    intensity: 2.4,
    /** Направление на солнце от центра комнаты (единицы сцены), расстояние подбирается по размеру комнаты. */
    direction: [2.5, 5.5, 1.5] as const,
    shadowMapSize: 2048,
    shadowBias: -0.0004,
    shadowNormalBias: 0.02,
  },
} as const;

export interface ShadowFrustum {
  /** Положение солнца в сцене. */
  position: [number, number, number];
  /** Полуразмер ортографической камеры тени. */
  half: number;
  near: number;
  far: number;
}

/**
 * Камера тени по габаритам комнаты: охватывает описанный шар комнаты, поэтому тени не обрезаются
 * в больших комнатах и не тратят разрешение карты в маленьких. Размеры и центр — в единицах сцены.
 */
export function shadowFrustum(
  center: readonly [number, number],
  size: { width: number; depth: number; height: number },
  direction: readonly [number, number, number] = LIGHTING.sun.direction,
): ShadowFrustum {
  const radius = Math.hypot(size.width, size.depth, size.height) / 2;
  const [dx, dy, dz] = direction;
  const length = Math.hypot(dx, dy, dz);
  const distance = radius + 1;
  const target: [number, number, number] = [center[0], size.height / 2, center[1]];
  return {
    position: [
      target[0] + (dx / length) * distance,
      target[1] + (dy / length) * distance,
      target[2] + (dz / length) * distance,
    ],
    half: radius,
    near: 0.1,
    far: 2 * radius + 2,
  };
}

export interface KeyLight {
  kind: 'sun' | 'moon';
  /** Единичный вектор на источник. */
  direction: [number, number, number];
  color: string;
  intensity: number;
}

/**
 * Единственный источник с тенью (этап 20.4): солнце, пока оно над горизонтом, иначе луна.
 * Переключение происходит у горизонта, где сила обоих источников близка к нулю, поэтому скачка нет.
 */
export function keyLight(sky: SkyState): KeyLight {
  if (sky.sunHeight >= 0) return { kind: 'sun', direction: [...sky.sunDirection], color: sky.sun.color, intensity: sky.sun.intensity };
  return { kind: 'moon', direction: [...sky.moonDirection], color: sky.moon.color, intensity: sky.moon.intensity };
}

/** Экспозиция: ночью чуть выше, чтобы тёмная комната оставалась читаемой, днём — базовая. */
export function exposureFor(sky: SkyState): number {
  return LIGHTING.toneMappingExposure * (1 + 0.8 * (1 - sky.daylight));
}

/** Сила отражений окружения с учётом времени суток. */
export function environmentFor(sky: SkyState): number {
  return LIGHTING.environmentIntensity * sky.environmentScale;
}
