import { describe, expect, it } from 'vitest';
import { AREA_RANGE_M2, parseAreaM2, parseCm, parseDecimal } from '../../src/domain/parse';
import { rankTemplates } from '../../src/layouts/templates';

// Этап 18.1: некорректные и граничные числа во всех текстовых полях (AC-13, отчёт docs/stage-18/edge-cases.md).

describe('разбор чисел из полей (18.1)', () => {
  it('принимает целые и дробные с точкой или запятой, пробелы по краям игнорирует', () => {
    expect(parseDecimal('45')).toBe(45);
    expect(parseDecimal('45,5')).toBe(45.5);
    expect(parseDecimal(' 45.5 ')).toBe(45.5);
    expect(parseDecimal('0')).toBe(0);
    expect(parseDecimal('007')).toBe(7);
  });

  it.each(['', ' ', 'abc', '12abc', '1e3', '0x10', 'Infinity', 'NaN', '1 000', '1,000.5', '1..5', '5,', ',5', '.5', '-5', '+5', '--5', '１２'])(
    'отклоняет «%s»', (text) => {
      expect(parseDecimal(text)).toBeNull();
      expect(parseCm(text)).toBeNull();
      expect(parseAreaM2(text)).toBeNull();
    },
  );

  it('дробные сантиметры округляются до целого', () => {
    expect(parseCm('120,4')).toBe(120);
    expect(parseCm('120.5')).toBe(121);
    expect(parseCm('0,2')).toBe(0);
  });

  it('очень длинные строки цифр не ломают разбор', () => {
    expect(parseCm('9'.repeat(400))).toBeNull(); // Number() даёт Infinity
    expect(parseCm('9'.repeat(30))).toBe(Math.round(Number('9'.repeat(30))));
    expect(parseDecimal('1'.repeat(5000) + 'x')).toBeNull();
  });

  it('площадь квартиры ограничена разумными пределами', () => {
    expect(parseAreaM2(String(AREA_RANGE_M2.min))).toBe(AREA_RANGE_M2.min);
    expect(parseAreaM2(String(AREA_RANGE_M2.max))).toBe(AREA_RANGE_M2.max);
    expect(parseAreaM2('9,99')).toBeNull();
    expect(parseAreaM2('1000,01')).toBeNull();
    expect(parseAreaM2('0')).toBeNull();
  });

  it('подбор схем работает на всём допустимом диапазоне площади и всегда возвращает схемы', () => {
    for (const rooms of [1, 2, 3, 4] as const) {
      for (const area of [AREA_RANGE_M2.min, 45.5, 200, AREA_RANGE_M2.max]) {
        const ranked = rankTemplates(rooms, area);
        expect(ranked.length, `${rooms} комн., ${area} м²`).toBeGreaterThan(0);
        for (const template of ranked) expect(template.livingRooms).toBe(rooms);
      }
    }
  });
});
