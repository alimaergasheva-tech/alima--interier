import type { Point } from '../geometry/placement';

// Реестр областей, принимающих перенос: 2D-план и 3D-вид. Каждая область умеет
// переводить экранную точку в координаты проекта и обратно. Правила размещения
// у областей общие — различается только способ получить точку.

export interface Surface {
  element: Element;
  /** Экранные координаты → точка на полу в см; null — луч не попал в пол. */
  toProject(clientX: number, clientY: number): Point | null;
  /** Точка проекта → экранные координаты (для проверок и подсказок). */
  toClient(xCm: number, zCm: number): { x: number; y: number } | null;
}

const surfaces = new Map<string, Surface>();

export function registerSurface(id: string, surface: Surface): () => void {
  surfaces.set(id, surface);
  return () => {
    if (surfaces.get(id) === surface) surfaces.delete(id);
  };
}

export function getSurface(id: string): Surface | undefined {
  return surfaces.get(id);
}

/** Точка проекта под указателем, если он находится над одной из областей. */
export function projectPointAt(clientX: number, clientY: number): Point | null {
  for (const surface of surfaces.values()) {
    const rect = surface.element.getBoundingClientRect();
    const inside =
      clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    if (inside) return surface.toProject(clientX, clientY);
  }
  return null;
}
