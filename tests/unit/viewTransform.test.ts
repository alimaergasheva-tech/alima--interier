import { describe, expect, it } from 'vitest';
import { fitRect, panBy, projectToScreen, screenToProject, zoomAt } from '../../src/plan2d/viewTransform';

describe('координаты SVG-плана', () => {
  const bounds = { minX: -15, maxX: 625, minZ: -15, maxZ: 315 };

  it('одна точка проекта восстанавливается при разных масштабах и сдвигах', () => {
    const fit = fitRect(bounds, 800, 600, 56);
    const point = { xCm: 402.5, zCm: 137.25 };
    const variants = [fit, panBy(fit, 83, -47), zoomAt(fit, 2.4, 321, 278)];
    for (const view of variants) {
      const screen = projectToScreen(view, point.xCm, point.zCm);
      const restored = screenToProject(view, screen.x, screen.y);
      expect(restored.xCm).toBeCloseTo(point.xCm, 8);
      expect(restored.zCm).toBeCloseTo(point.zCm, 8);
    }
  });

  it('масштабирование оставляет выбранную точку под указателем', () => {
    const fit = fitRect(bounds, 800, 600, 56);
    const before = screenToProject(fit, 240, 310);
    const zoomed = zoomAt(fit, 1.75, 240, 310);
    expect(screenToProject(zoomed, 240, 310)).toEqual({
      xCm: expect.closeTo(before.xCm, 8), zCm: expect.closeTo(before.zCm, 8),
    });
    expect(zoomed.scale).toBeCloseTo(fit.scale * 1.75);
  });
});
