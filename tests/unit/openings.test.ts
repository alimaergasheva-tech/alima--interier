import { describe, expect, it } from 'vitest';
import { createHistory, execute } from '../../src/commands/history';
import { openingPositionCm, swingTarget, updateOpening } from '../../src/commands/openings';
import { previewChange, withSetupLimits } from '../../src/commands/setup';
import { doorZones, openingSpan } from '../../src/geometry/openings';
import { createApartmentValidator } from '../../src/geometry/validateApartment';
import type { DoorOpening } from '../../src/domain/types';
import { findTestItem, twoRoomApartment, twoRoomApartmentWithWindow } from './fixtures';

const validate = withSetupLimits(createApartmentValidator(findTestItem));
const door = (apartment: ReturnType<typeof twoRoomApartment>) => apartment.openings.find((o) => o.id === 'door-ab') as DoorOpening;

describe('положение проёма (9.1, 9.2, AC-04)', () => {
  it('положение считается от чистого угла комнаты', () => {
    const apartment = twoRoomApartment();
    expect(openingPositionCm(apartment, door(apartment))).toBe(110); // ось на 125 см от узла, угол чистой комнаты на 15 см дальше
  });

  it('общая дверь остаётся одним проёмом и смещается для обеих комнат', () => {
    const before = twoRoomApartment();
    const { proposal } = previewChange(before, updateOpening('door-ab', { positionCm: 200 }), validate);
    expect(proposal.issues).toEqual([]);
    const after = proposal.candidate;
    expect(after.openings.filter((o) => o.kind === 'door')).toHaveLength(1);
    expect(openingPositionCm(after, door(after))).toBe(200);
    expect(openingSpan(after, door(after)).min).toBe(200);
    for (const room of after.rooms) {
      const zone = doorZones(after, room).find((z) => z.kind === 'threshold')!;
      expect(Math.min(...zone.polygon.map((p) => p.zCm))).toBe(200);
    }
    expect(door(before).offsetCm).toBe(125); // исходная квартира не тронута
  });

  it('ширина меняется от неподвижного края', () => {
    const { proposal } = previewChange(twoRoomApartment(), updateOpening('door-ab', { widthCm: 100 }), validate);
    expect(proposal.issues).toEqual([]);
    const span = openingSpan(proposal.candidate, door(proposal.candidate));
    expect([span.min, span.max]).toEqual([110, 210]);
  });
});

describe('границы и пересечения (9.3, AC-10)', () => {
  it('проём не выходит за чистый участок стены', () => {
    const { issues } = previewChange(twoRoomApartment(), updateOpening('door-ab', { positionCm: 230 }), validate).proposal;
    expect(issues.map((i) => i.code)).toContain('opening-outside-wall');
    const left = previewChange(twoRoomApartment(), updateOpening('door-ab', { positionCm: -5 }), validate).proposal;
    expect(left.issues.length).toBeGreaterThan(0);
  });

  it('проёмы на одной стене не пересекаются, касание допустимо', () => {
    const base = twoRoomApartment();
    base.openings.push({ id: 'door-2', kind: 'door', wallId: 'w7', offsetCm: 20, widthCm: 60, heightCm: 210, hinge: 'start', swing: 'right' });
    const overlap = previewChange(base, updateOpening('door-2', { positionCm: 60 }), validate).proposal;
    expect(overlap.issues.map((i) => i.code)).toContain('openings-overlap');
    const touch = previewChange(base, updateOpening('door-2', { positionCm: 30 }), validate).proposal;
    expect(touch.issues.map((i) => i.code)).not.toContain('openings-overlap');
  });

  it('пределы размеров D-04 и высота относительно потолка', () => {
    const win = twoRoomApartmentWithWindow();
    const code = (patch: Parameters<typeof updateOpening>[1], id = 'window-a') =>
      previewChange(win, updateOpening(id, patch), validate).proposal.issues.map((i) => i.code);
    expect(code({ heightCm: 300 })).toContain('size-out-of-range');
    expect(code({ widthCm: 20 })).toContain('size-out-of-range');
    expect(code({ sillCm: 160 })).toContain('size-out-of-range');
    expect(code({ sillCm: 150, heightCm: 140 })).toContain('opening-too-tall');
    expect(code({ sillCm: 100, heightCm: 150 })).toEqual([]);
    expect(code({ widthCm: 50 }, 'door-ab')).toContain('size-out-of-range');
  });

  it('отказ не меняет квартиру и историю', () => {
    const history = createHistory(twoRoomApartment());
    const snapshot = structuredClone(history.present);
    const result = execute(history, updateOpening('door-ab', { positionCm: 230 }), validate);
    expect(result.ok).toBe(false);
    expect(result.history).toBe(history);
    expect(history.present).toEqual(snapshot);
  });
});

describe('створка (9.5)', () => {
  it('направление открывания переключает зону створки на плане', () => {
    const apartment = twoRoomApartment();
    expect(swingTarget(apartment, door(apartment), 'left')?.id).toBe('room-b');
    expect(swingTarget(apartment, door(apartment), 'right')?.id).toBe('room-a');
    const flipped = previewChange(apartment, updateOpening('door-ab', { swing: 'right' }), validate).proposal.candidate;
    const swing = (room: number) => doorZones(flipped, flipped.rooms[room]!).some((z) => z.kind === 'swing');
    expect([swing(0), swing(1)]).toEqual([true, false]);
  });

  it('конфликт створки с мебелью блокирует изменение', () => {
    const apartment = twoRoomApartment();
    apartment.openings = apartment.openings.map((o) => (o.id === 'door-ab' ? { ...(o as DoorOpening), swing: 'right' } : o));
    apartment.furniture.push({ id: 'f1', catalogItemId: 'dresser', assetVersion: 1, roomId: 'room-b', xCm: 480, zCm: 150,
      elevationCm: 0, rotationDeg: 90, variantId: null });
    expect(previewChange(apartment, updateOpening('door-ab', { positionCm: 110 }), validate).proposal.issues).toEqual([]);
    const { issues } = previewChange(apartment, updateOpening('door-ab', { swing: 'left' }), validate).proposal;
    expect(issues.map((i) => i.code)).toContain('furniture-conflict');
  });

  it('петли переключаются на другой край', () => {
    const { proposal } = previewChange(twoRoomApartment(), updateOpening('door-ab', { hinge: 'end' }), validate);
    expect(proposal.issues).toEqual([]);
    expect(door(proposal.candidate).hinge).toBe('end');
  });
});
