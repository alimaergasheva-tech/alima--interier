import { describe, expect, it } from 'vitest';
import { LIGHTING } from '../../src/scene3d/lighting';
import { DEFAULT_HOUR, TIME_PRESETS, activePreset, formatHour, mixColors, normalizeHour, skyAt } from '../../src/scene3d/timeOfDay';

// Задача 20.1: модель времени суток (SPEC D-12). Рассвет, день, закат, ночь и плавность переходов.

const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
};
const channels = (hex: string) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const; };

describe('время суток (20.1)', () => {
  it('приводит час к [0, 24) и не ломается на нечисловых значениях', () => {
    expect(normalizeHour(25)).toBe(1);
    expect(normalizeHour(-1)).toBe(23);
    expect(normalizeHour(24)).toBe(0);
    expect(normalizeHour(NaN)).toBe(DEFAULT_HOUR);
    expect(normalizeHour(Infinity)).toBe(DEFAULT_HOUR);
  });

  it('рассвет и закат: солнце на горизонте, на востоке утром и на западе вечером', () => {
    const dawn = skyAt(6), dusk = skyAt(18);
    expect(Math.abs(dawn.sunHeight)).toBeLessThan(0.01);
    expect(Math.abs(dusk.sunHeight)).toBeLessThan(0.01);
    expect(dawn.sunDirection[0]).toBeGreaterThan(0.9);
    expect(dusk.sunDirection[0]).toBeLessThan(-0.9);
  });

  it('полдень: солнце высоко, свет максимальный; ночью солнца нет, а луна светит', () => {
    const noon = skyAt(12), night = skyAt(0);
    expect(noon.sunHeight).toBeGreaterThan(0.85);
    expect(noon.sun.intensity).toBeCloseTo(LIGHTING.sun.intensity, 5);
    expect(noon.moon.intensity).toBe(0);
    expect(night.sun.intensity).toBe(0);
    expect(night.moon.intensity).toBeGreaterThan(0.3);
    expect(night.moonDirection[1]).toBeGreaterThan(0.8);
  });

  it('небо днём светлое и голубое, ночью тёмное, на закате тёплое у горизонта', () => {
    const day = skyAt(13), night = skyAt(23.5), dusk = skyAt(18.2);
    expect(luminance(day.sky.top)).toBeGreaterThan(100);
    expect(luminance(night.sky.top)).toBeLessThan(15);
    expect(channels(day.sky.top)[2]).toBeGreaterThan(channels(day.sky.top)[0]);
    const [r, , b] = channels(dusk.sky.horizon);
    expect(r, 'горизонт на закате красноватый').toBeGreaterThan(b + 40);
  });

  it('звёзды видны ночью и не видны днём; заполняющий свет ночью слабее', () => {
    expect(skyAt(0).stars).toBeGreaterThan(0.95);
    expect(skyAt(13).stars).toBe(0);
    expect(skyAt(0).hemisphere.intensity).toBeLessThan(skyAt(13).hemisphere.intensity / 3);
    expect(skyAt(13).hemisphere.intensity).toBeCloseTo(LIGHTING.hemisphere.intensity, 5);
  });

  it('сутки замкнуты: 0 и 24 часа дают одно и то же', () => {
    expect(skyAt(0)).toEqual(skyAt(24));
    expect(skyAt(6.5)).toEqual(skyAt(30.5));
  });

  it('переходы плавные: за 3 минуты ничего не прыгает (скачок был бы в разы больше порогов)', () => {
    let prev = skyAt(0);
    for (let minute = 3; minute <= 24 * 60; minute += 3) {
      const next = skyAt(minute / 60);
      expect(Math.abs(next.sun.intensity - prev.sun.intensity), `солнце ${minute} мин`).toBeLessThan(0.2);
      expect(Math.abs(next.moon.intensity - prev.moon.intensity), `луна ${minute} мин`).toBeLessThan(0.04);
      expect(Math.abs(next.hemisphere.intensity - prev.hemisphere.intensity), `заполняющий ${minute} мин`).toBeLessThan(0.04);
      expect(Math.abs(luminance(next.sky.top) - luminance(prev.sky.top)), `небо ${minute} мин`).toBeLessThan(10);
      expect(Math.abs(luminance(next.sky.horizon) - luminance(prev.sky.horizon)), `горизонт ${minute} мин`).toBeLessThan(12);
      expect(Math.abs(next.stars - prev.stars), `звёзды ${minute} мин`).toBeLessThan(0.1);
      prev = next;
    }
  });

  it('все значения конечны, направления единичные, силы не отрицательные при любом часе', () => {
    for (let hour = -5; hour <= 30; hour += 0.25) {
      const s = skyAt(hour);
      expect(Math.hypot(...s.sunDirection)).toBeCloseTo(1, 6);
      expect(Math.hypot(...s.moonDirection)).toBeCloseTo(1, 6);
      for (const v of [s.sun.intensity, s.moon.intensity, s.hemisphere.intensity, s.environmentScale, s.stars, s.daylight]) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
      }
      for (const color of [s.sun.color, s.moon.color, s.sky.top, s.sky.horizon, s.hemisphere.sky, s.hemisphere.ground]) {
        expect(color).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it('кнопки «Утро», «День», «Вечер», «Ночь» дают соответствующее освещение', () => {
    const by = Object.fromEntries(TIME_PRESETS.map((p) => [p.id, skyAt(p.hour)]));
    expect(TIME_PRESETS.map((p) => p.label)).toEqual(['Утро', 'День', 'Вечер', 'Ночь']);
    expect(by.morning!.sunHeight).toBeGreaterThan(0.1);
    expect(by.morning!.sunDirection[0], 'утром солнце на востоке').toBeGreaterThan(0);
    expect(by.day!.sun.intensity).toBeGreaterThan(by.morning!.sun.intensity);
    expect(by.evening!.sunDirection[0], 'вечером солнце на западе').toBeLessThan(0);
    expect(by.evening!.sun.intensity).toBeGreaterThan(0);
    expect(by.evening!.sun.intensity).toBeLessThan(by.day!.sun.intensity);
    expect(by.evening!.stars, 'вечером звёзд ещё нет').toBeLessThan(0.1);
    expect(by.night!.sun.intensity).toBe(0);
    expect(by.night!.moon.intensity).toBeGreaterThan(0);
  });

  it('смешивание цветов: границы и середина', () => {
    expect(mixColors('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixColors('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixColors('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixColors('#102030', '#ffffff', -3)).toBe('#102030');
  });

  it('подпись часа и активная кнопка', () => {
    expect(formatHour(13)).toBe('13:00');
    expect(formatHour(17.5)).toBe('17:30');
    expect(formatHour(0)).toBe('00:00');
    expect(formatHour(24)).toBe('00:00');
    expect(formatHour(23.999)).toBe('00:00');
    expect(activePreset(7)).toBe('morning');
    expect(activePreset(13)).toBe('day');
    expect(activePreset(17.5)).toBe('evening');
    expect(activePreset(23)).toBe('night');
    expect(activePreset(12)).toBeNull();
  });

  it('состояние времени живёт в интерфейсе и приводит час к [0, 24)', async () => {
    const { useUiStore } = await import('../../src/store/uiStore');
    expect(useUiStore.getState().timeOfDay).toBe(DEFAULT_HOUR);
    useUiStore.getState().setTimeOfDay(26);
    expect(useUiStore.getState().timeOfDay).toBe(2);
    useUiStore.getState().setTimeOfDay(NaN);
    expect(useUiStore.getState().timeOfDay).toBe(DEFAULT_HOUR);
    useUiStore.getState().setTimeOfDay(DEFAULT_HOUR);
  });
});
