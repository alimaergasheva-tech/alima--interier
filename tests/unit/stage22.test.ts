import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { roomNetAreaCm2 } from '../../src/domain/rooms';
import { layoutTemplates, rankTemplates, templateAreaCm2 } from '../../src/layouts/templates';

// Этап 22: стартовые схемы на 10 % длиннее по каждой стороне (D-15); сверка с SPEC §3.1 и подбор по площади.

const m2 = (id: string) => templateAreaCm2(layoutTemplates.find((t) => t.id === id)!) / 10_000;

/** Площади из таблицы SPEC §3.1: «1А» → 36.8 (для 4А берётся первое число). */
function specAreas(): Record<string, number> {
  const text = readFileSync('SPEC.md', 'utf8');
  const section = text.slice(text.indexOf('### 3.1.'), text.indexOf('### 3.2.'));
  const ids: Record<string, string> = { '1А': '1a', '1Б': '1b', '1В': '1v', '2А': '2a', '2Б': '2b', '2В': '2v', '3А': '3a', '3Б': '3b', '3В': '3v', '4А': '4a' };
  const result: Record<string, number> = {};
  for (const line of section.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    const id = ids[cells[1]?.slice(0, 2) ?? ''];
    if (!id) continue;
    const match = cells[5]?.match(/^(\d+(?:,\d+)?)/);
    if (match) result[id] = Number(match[1]!.replace(',', '.'));
  }
  return result;
}

describe('сверка схем с SPEC §3.1 (22.1, 22.4)', () => {
  it('площадь каждой схемы в коде совпадает с таблицей SPEC с точностью 0,1 м²', () => {
    const spec = specAreas();
    expect(Object.keys(spec).sort()).toEqual(layoutTemplates.map((t) => t.id).sort());
    for (const template of layoutTemplates) {
      const total = m2(template.id);
      // Для 4А SPEC указывает 147,5 м² без двух балконов; допускается и сумма с ними.
      const candidates = template.id === '4a' ? [total, total - balconyArea(template)] : [total];
      const best = Math.min(...candidates.map((value) => Math.abs(value - spec[template.id]!)));
      expect(best, `${template.id}: код ${candidates.map((v) => v.toFixed(2)).join(' / ')}, SPEC ${spec[template.id]}`).toBeLessThanOrEqual(0.1 + 1e-9);
    }
  });

  it('высота потолка не меняется: 270 см, у схемы 4А 350 см', () => {
    for (const template of layoutTemplates) {
      expect(template.apartment.ceilingHeightCm, template.id).toBe(template.id === '4a' ? 350 : 270);
    }
  });
});

function balconyArea(template: (typeof layoutTemplates)[number]): number {
  return template.apartment.rooms.filter((r) => r.type === 'balcony')
    .reduce((sum, r) => sum + roomNetAreaCm2(template.apartment, r) / 10_000, 0);
}

describe('подбор схемы по площади (22.2)', () => {
  it('для 36, 52 и 72 м² «ближе всего» остаётся логичная схема', () => {
    expect(rankTemplates(1, 36)[0]?.id).toBe('1a');
    expect(rankTemplates(1, 46)[0]?.id).toMatch(/^1[bv]$/);
    expect(rankTemplates(2, 52)[0]?.id).toBe('2a');
    expect(rankTemplates(2, 72)[0]?.id).toBe('2b');
    expect(rankTemplates(3, 72)[0]?.id).toBe('3a');
  });

  it('ранжирование монотонно: чем больше введённая площадь, тем не меньше площадь первой схемы', () => {
    for (const count of [1, 2, 3] as const) {
      let previous = 0;
      for (let area = 20; area <= 120; area += 2) {
        const first = rankTemplates(count, area)[0]!;
        const value = templateAreaCm2(first);
        expect(value, `${count} комн., ${area} м²`).toBeGreaterThanOrEqual(previous);
        previous = value;
      }
    }
  });
});
