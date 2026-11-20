import type { ModelUnit } from './types';

// Единицы (SPEC §5): проект хранит сантиметры, сцена метрическая.
// Пересчёт выполняется только здесь, на границе сцены и импорта.

export const CM_PER_SCENE_UNIT = 100;
export const CM2_PER_M2 = 10_000;

/** Геометрический допуск; не связан с округлением подписей. */
export const EPS_CM = 0.01;

export function cmToScene(cm: number): number {
  return cm / CM_PER_SCENE_UNIT;
}

export function sceneToCm(units: number): number {
  return units * CM_PER_SCENE_UNIT;
}

export function cm2ToM2(cm2: number): number {
  return cm2 / CM2_PER_M2;
}

export function m2ToCm2(m2: number): number {
  return m2 * CM2_PER_M2;
}

const SCENE_UNITS_PER_MODEL_UNIT: Record<ModelUnit, number> = { m: 1, cm: 0.01, mm: 0.001 };

/**
 * Множитель, приводящий исходную геометрию модели к единицам сцены.
 * Применяется один раз к загруженному ассету; положение предмета
 * пересчитывается отдельно через cmToScene.
 */
export function modelScaleToScene(unit: ModelUnit): number {
  return SCENE_UNITS_PER_MODEL_UNIT[unit];
}

/** Подпись длины: целые сантиметры. В проверках геометрии не участвует. */
export function formatCm(cm: number): string {
  return `${Math.round(cm)} см`;
}

/** Подпись площади: м² с одним знаком, десятичная запятая. */
export function formatM2(cm2: number): string {
  return `${cm2ToM2(cm2).toFixed(1).replace('.', ',')} м²`;
}
