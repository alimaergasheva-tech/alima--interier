import { beforeEach, describe, expect, it } from 'vitest';
import { CEILING_LIGHT, ceilingLightY } from '../../src/scene3d/CeilingLight';
import { useUiStore } from '../../src/store/uiStore';

// Задача 21.1: потолочный светильник и выключатель комнаты (SPEC D-11).

describe('потолочный светильник (21.1)', () => {
  beforeEach(() => useUiStore.setState({ roomLights: {} }));

  it('плафон висит под потолком на длине подвеса', () => {
    expect(ceilingLightY(2.7)).toBeCloseTo(2.7 - CEILING_LIGHT.drop, 9);
    expect(ceilingLightY(2.7)).toBeGreaterThan(2.0);
  });

  it('по умолчанию свет выключен, выключатель переключает только свою комнату', () => {
    const { toggleRoomLight } = useUiStore.getState();
    expect(useUiStore.getState().roomLights['a']).toBeUndefined();
    toggleRoomLight('a');
    expect(useUiStore.getState().roomLights).toEqual({ a: true });
    toggleRoomLight('b');
    toggleRoomLight('a');
    expect(useUiStore.getState().roomLights).toEqual({ a: false, b: true });
  });

  it('смена активной комнаты не сбрасывает выключатели', () => {
    useUiStore.getState().toggleRoomLight('a');
    useUiStore.getState().setActiveRoom('b');
    useUiStore.getState().setActiveRoom('a');
    expect(useUiStore.getState().roomLights['a']).toBe(true);
  });
});
