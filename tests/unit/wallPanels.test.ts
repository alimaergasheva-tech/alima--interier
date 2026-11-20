import { ExtrudeGeometry, ShapeUtils } from 'three';
import { describe, expect, it } from 'vitest';
import { updateOpening } from '../../src/commands/openings';
import { setCeilingHeight } from '../../src/commands/setup';
import { doorRooms, roomBehindDoor } from '../../src/geometry/apartmentChecks';
import { layoutTemplates } from '../../src/layouts/templates';
import { buildWallPanels, buildWallShape } from '../../src/scene3d/wallPanels';
import { twoRoomApartmentWithWindow } from './fixtures';

const measure = (apartment: ReturnType<typeof twoRoomApartmentWithWindow>, roomId: string, side: string) => {
  const panel = buildWallPanels(apartment, roomId).find((p) => p.side === side)!;
  const shape = buildWallShape(panel);
  const outline = Math.abs(ShapeUtils.area(shape.getPoints()));
  const holes = shape.holes.reduce((sum, hole) => sum + Math.abs(ShapeUtils.area(hole.getPoints())), 0);
  return { panel, net: outline - holes, shape };
};

describe('стены 3D с отверстиями (10.1, 10.2)', () => {
  it('окно вырезается отверстием, дверь — вырезом снизу; площадь сходится', () => {
    const apartment = twoRoomApartmentWithWindow();
    const west = measure(apartment, 'room-a', 'minX');
    expect(west.shape.holes).toHaveLength(1);
    const full = ((west.panel.uMaxCm - west.panel.uMinCm) * 270) / 10_000;
    expect(west.net).toBeCloseTo(full - (100 * 140) / 10_000, 6);
    const east = measure(apartment, 'room-a', 'maxX');
    expect(east.panel.openings.map((o) => o.id)).toEqual(['door-ab']);
    expect(east.net).toBeCloseTo(((east.panel.uMaxCm - east.panel.uMinCm) * 270 - 80 * 210) / 10_000, 6);
    const geometry = new ExtrudeGeometry(east.shape, { depth: 0.1, bevelEnabled: false });
    expect(geometry.attributes.position!.count).toBeGreaterThan(0);
  });

  it('общая дверь режется в стенах обеих комнат в одном месте', () => {
    const apartment = twoRoomApartmentWithWindow();
    const a = buildWallPanels(apartment, 'room-a').find((p) => p.side === 'maxX')!.openings[0]!;
    const b = buildWallPanels(apartment, 'room-b').find((p) => p.side === 'minX')!.openings[0]!;
    expect([a.uMinCm, a.uMaxCm]).toEqual([b.uMinCm, b.uMaxCm]);
  });

  it('после перемещения проёма и смены потолка отверстие пересчитывается из модели', () => {
    let apartment = twoRoomApartmentWithWindow();
    apartment = updateOpening('door-ab', { positionCm: 200 }).apply(apartment);
    apartment = setCeilingHeight(300).apply(apartment);
    const panel = buildWallPanels(apartment, 'room-a').find((p) => p.side === 'maxX')!;
    expect(panel.openings[0]!.uMinCm).toBe(200);
    expect(panel.heightCm).toBe(300);
  });

  it('в комнате только её стороны; соседние комнаты не строятся', () => {
    const apartment = twoRoomApartmentWithWindow();
    for (const id of ['room-a', 'room-b']) {
      expect(buildWallPanels(apartment, id).map((p) => p.side).sort()).toEqual(['maxX', 'maxZ', 'minX', 'minZ']);
    }
  });
});

describe('переходы через двери (10.4)', () => {
  it('по каждой внутренней двери всех схем есть путь туда и обратно; входная ведёт наружу', () => {
    for (const template of layoutTemplates) {
      const { apartment } = template;
      for (const opening of apartment.openings.filter((o) => o.kind === 'door')) {
        const rooms = doorRooms(apartment, opening.id);
        if (rooms.length === 1) {
          expect(roomBehindDoor(apartment, opening.id, rooms[0]!.id)).toBeNull();
          continue;
        }
        const [a, b] = rooms as [(typeof rooms)[number], (typeof rooms)[number]];
        expect(roomBehindDoor(apartment, opening.id, a.id)?.id).toBe(b.id);
        expect(roomBehindDoor(apartment, opening.id, b.id)?.id).toBe(a.id);
        for (const room of rooms) {
          const found = buildWallPanels(apartment, room.id).some((p) => p.openings.some((o) => o.id === opening.id));
          expect(found, `${template.id}: ${opening.id} в ${room.name}`).toBe(true);
        }
      }
    }
  });
});
