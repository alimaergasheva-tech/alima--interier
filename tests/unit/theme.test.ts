import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Проверка окружения тестов (задача 2.4) и контраста переменных темы (D-13).
const css = readFileSync(new URL('../../src/ui/theme.css', import.meta.url), 'utf8');

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!match?.[1]) throw new Error(`Переменная --${name} не найдена`);
  return match[1];
}

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('панели поверх 3D (25.3)', () => {
  // Полупрозрачная поверхность панелей считается как --color-surface: самый светлый реальный случай — 3D-фон белой стены,
  // поэтому берём худший вариант — поверхность над ярким фоном (92 % непрозрачности).
  const surface = token('color-surface');
  const accentSurface = token('color-accent-surface');
  it('текст на активной кнопке панели и на поверхности не ниже AA', () => {
    expect(contrast(token('color-text'), accentSurface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('color-text'), surface)).toBeGreaterThanOrEqual(4.5);
  });
  it('панели берут цвета только из переменных: в блоке нет жёстко заданных цветов', () => {
    const block = css.slice(css.indexOf('/* Панели поверх 3D-вида'));
    expect(block.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
    expect(block).not.toMatch(/rgba?\(\s*255/);
  });
});

describe('тёмная тема', () => {
  const backgrounds = ['color-bg', 'color-surface', 'color-surface-raised', 'color-surface-hover'];
  const texts = ['color-text', 'color-text-muted', 'color-accent', 'color-danger', 'color-success'];

  for (const bg of backgrounds) {
    for (const text of texts) {
      it(`--${text} на --${bg} не ниже AA (4,5:1)`, () => {
        expect(contrast(token(text), token(bg))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it('текст на акцентной кнопке не ниже AA', () => {
    expect(contrast(token('color-text-on-accent'), token('color-accent'))).toBeGreaterThanOrEqual(4.5);
  });
});
