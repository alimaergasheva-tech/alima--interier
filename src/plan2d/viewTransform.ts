import type { Rect } from '../domain/rooms';
import type { Point } from '../geometry/placement';

// Преобразование вида плана: масштаб и сдвиг. Меняет только отображение,
// размеры предметов в проекте от него не зависят (SPEC §10.1).

export interface ViewTransform {
  /** Пикселей на сантиметр. */
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Вписывает прямоугольник проекта в область экрана с полями. Ось Z направлена вниз. */
export function fitRect(rect: Rect, widthPx: number, heightPx: number, paddingPx: number): ViewTransform {
  const rectW = rect.maxX - rect.minX;
  const rectD = rect.maxZ - rect.minZ;
  const availW = Math.max(widthPx - paddingPx * 2, 1);
  const availH = Math.max(heightPx - paddingPx * 2, 1);
  const scale = Math.min(availW / rectW, availH / rectD);
  return {
    scale,
    offsetX: (widthPx - rectW * scale) / 2 - rect.minX * scale,
    offsetY: (heightPx - rectD * scale) / 2 - rect.minZ * scale,
  };
}

export function projectToScreen(view: ViewTransform, xCm: number, zCm: number): { x: number; y: number } {
  return { x: xCm * view.scale + view.offsetX, y: zCm * view.scale + view.offsetY };
}

export function screenToProject(view: ViewTransform, x: number, y: number): Point {
  return { xCm: (x - view.offsetX) / view.scale, zCm: (y - view.offsetY) / view.scale };
}

/** Масштабирование вокруг указателя оставляет точку проекта под ним неподвижной. */
export function zoomAt(view: ViewTransform, factor: number, x: number, y: number): ViewTransform {
  const point = screenToProject(view, x, y);
  const scale = view.scale * factor;
  return { scale, offsetX: x - point.xCm * scale, offsetY: y - point.zCm * scale };
}

export function panBy(view: ViewTransform, dx: number, dy: number): ViewTransform {
  return { ...view, offsetX: view.offsetX + dx, offsetY: view.offsetY + dy };
}
