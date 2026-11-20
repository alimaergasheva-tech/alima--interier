/** Разбор чисел из текстовых полей (задача 18.1). Строгий: только цифры и один десятичный разделитель. */

const DECIMAL = /^\d+(?:[.,]\d+)?$/;

/** Неотрицательное число с точкой или запятой; «1e3», «0x10», «Infinity», «1 000», «-5», «5,» — не числа (null). */
export function parseDecimal(text: string): number | null {
  const trimmed = text.trim();
  if (!DECIMAL.test(trimmed)) return null;
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

/** Целые сантиметры; дробное значение округляется до сантиметра (SPEC §3.2). Отрицательные не принимаются. */
export function parseCm(text: string): number | null {
  const value = parseDecimal(text);
  return value === null ? null : Math.round(value);
}

export const AREA_RANGE_M2 = { min: 10, max: 1000 } as const;

/** Примерная площадь квартиры в м²: положительная, в разумных пределах. Иначе null. */
export function parseAreaM2(text: string): number | null {
  const value = parseDecimal(text);
  return value !== null && value >= AREA_RANGE_M2.min && value <= AREA_RANGE_M2.max ? value : null;
}
