import { describe, expect, it } from 'vitest';
import { STAINED_GLASS } from '../../src/scene3d/stainedGlass';

// Задача 20.5: витраж просвечивает мир, переплёты остаются плотными.
describe('прозрачность витража (20.5)', () => {
  it('стёкла прозрачнее переплётов, но не невидимы', () => {
    expect(STAINED_GLASS.glassAlpha).toBeGreaterThan(0.2);
    expect(STAINED_GLASS.glassAlpha).toBeLessThanOrEqual(0.6);
    expect(STAINED_GLASS.leadAlpha).toBeGreaterThan(STAINED_GLASS.glassAlpha);
    expect(STAINED_GLASS.leadAlpha).toBeLessThanOrEqual(1);
  });
});
