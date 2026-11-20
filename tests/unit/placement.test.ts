import { describe, expect, it } from 'vitest';
import { findCatalogItem, techCatalog } from '../../src/catalog/techCatalog';
import { addFurniture, setFurniturePose } from '../../src/commands/furniture';
import { createHistory, execute } from '../../src/commands/history';
import type { FurnitureInstance } from '../../src/domain/types';
import { colliderCorners, rotateLocal, snapCm, validatePlacement } from '../../src/geometry/placement';
import { createApartmentValidator } from '../../src/geometry/validateApartment';
import { fitRect, projectToScreen, screenToProject } from '../../src/plan2d/viewTransform';
import { TECH_ROOM_ID, createTechApartment } from '../../src/tech/techApartment';
import { Euler, Vector3 } from 'three';

const sofa = findCatalogItem('sofa_03')!;
const apartment = createTechApartment();
const place = (xCm: number, zCm: number, rotationDeg = 0) =>
  validatePlacement(apartment, sofa, TECH_ROOM_ID, { xCm, zCm, rotationDeg });

describe('поворот в плане совпадает со сценой', () => {
  it('rotateLocal даёт тот же результат, что rotation.y в Three.js', () => {
    for (const deg of [15, 90, 135, 270]) {
      const expected = new Vector3(120, 0, 40).applyEuler(new Euler(0, (deg * Math.PI) / 180, 0));
      const actual = rotateLocal(120, 40, deg);
      expect(actual.xCm).toBeCloseTo(expected.x, 9);
      expect(actual.zCm).toBeCloseTo(expected.z, 9);
    }
  });

  it('углы коллайдера учитывают поворот', () => {
    const corners = colliderCorners(sofa.colliders[0]!, { xCm: 200, zCm: 150, rotationDeg: 90 });
    const xs = corners.map((corner) => corner.xCm);
    const zs = corners.map((corner) => corner.zCm);
    // После поворота на 90° ширина 273 см ложится вдоль Z.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(93, 9);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(273, 9);
  });
});

describe('выход за границу комнаты (4.4)', () => {
  it('предмет в середине комнаты допустим', () => {
    expect(place(210, 175).valid).toBe(true);
  });

  it('касание стены без проникновения допустимо, проникновение на 1 см — нет', () => {
    // Диван 273 × 93 см в комнате 420 × 350 см: вплотную к стенам x = 0 и z = 0.
    expect(place(136.5, 46.5).valid).toBe(true);
    expect(place(135.5, 46.5).valid).toBe(false);
    expect(place(136.5, 45.5).valid).toBe(false);
    expect(place(420 - 136.5, 350 - 46.5).valid).toBe(true);
  });

  it('центр внутри комнаты при выступающем угле не считается допустимым', () => {
    const result = place(380, 175);
    expect(result.valid).toBe(false);
    expect(result.code).toBe('outside-room');
    expect(result.message).toBe('Предмет выходит за стену');
  });

  it('поворот может вывести угол за стену', () => {
    expect(place(140, 175, 0).valid).toBe(true);
    expect(place(140, 175, 15).valid).toBe(false);
  });

  it('некорректные числа отклоняются', () => {
    expect(place(Number.NaN, 0).code).toBe('invalid-data');
  });

  it('привязка к сетке 5 см', () => {
    expect(snapCm(212.4, 5)).toBe(210);
    expect(snapCm(212.6, 5)).toBe(215);
  });
});

describe('мебель в командах', () => {
  const validate = createApartmentValidator(findCatalogItem);
  const instance: FurnitureInstance = {
    id: 'f-1',
    catalogItemId: 'sofa_03',
    assetVersion: 1,
    roomId: TECH_ROOM_ID,
    xCm: 210,
    zCm: 175,
    elevationCm: 0,
    rotationDeg: 0,
    variantId: null,
  };

  it('перемещение сохраняет идентификатор и карточку, недопустимое не применяется', () => {
    let history = execute(createHistory(createTechApartment()), addFurniture(instance, 'Диван'), validate).history;
    const moved = execute(history, setFurniturePose('f-1', { xCm: 200, zCm: 100, rotationDeg: 90 }), validate);
    expect(moved.ok).toBe(false); // после поворота на 90° диван длиной 273 см у z = 100 выходит за стену

    const ok = execute(history, setFurniturePose('f-1', { xCm: 200, zCm: 175, rotationDeg: 90 }), validate);
    expect(ok.ok).toBe(true);
    history = ok.history;
    expect(history.present.furniture).toHaveLength(1);
    expect(history.present.furniture[0]).toMatchObject({ id: 'f-1', catalogItemId: 'sofa_03', rotationDeg: 90 });
  });

  it('отказ называет комнату и предмет', () => {
    const history = createHistory(createTechApartment());
    const result = execute(history, addFurniture({ ...instance, xCm: 400 }, 'Диван'), validate);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.message).toBe('В комнате «Техническая комната» диван пересекает стену');
    expect(result.history).toBe(history);
  });

  it('габариты карточек совпадают с коллайдерами', () => {
    for (const item of techCatalog) {
      expect(item.colliders[0]).toMatchObject({ widthCm: item.sizeCm.width, depthCm: item.sizeCm.depth });
    }
  });
});

describe('преобразование вида плана (6.2)', () => {
  const rect = { minX: -30, maxX: 450, minZ: -30, maxZ: 380 };

  it('одна экранная точка даёт те же координаты проекта при разных масштабах', () => {
    for (const [w, h] of [
      [400, 300],
      [900, 700],
      [1600, 500],
    ] as const) {
      const view = fitRect(rect, w, h, 40);
      const screen = projectToScreen(view, 210, 175);
      const back = screenToProject(view, screen.x, screen.y);
      expect(back.xCm).toBeCloseTo(210, 9);
      expect(back.zCm).toBeCloseTo(175, 9);
    }
  });

  it('масштаб вида не меняет размер предмета в сантиметрах', () => {
    const small = fitRect(rect, 400, 300, 40);
    const large = fitRect(rect, 1600, 1200, 40);
    expect(large.scale).toBeGreaterThan(small.scale);
    // 100 см на экране занимают scale × 100 пикселей и переводятся обратно в 100 см.
    for (const view of [small, large]) {
      const a = projectToScreen(view, 0, 0);
      const b = projectToScreen(view, 100, 0);
      expect((b.x - a.x) / view.scale).toBeCloseTo(100, 9);
    }
  });
});
