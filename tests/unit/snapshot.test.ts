import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SNAPSHOT_SAMPLES, SNAPSHOT_QUALITY, hiddenInSnapshot, snapshotExposure, snapshotProgress, snapshotStaleReason, type SnapshotBasis,
} from '../../src/scene3d/snapshot';

const apartment = { id: 'a' };
const basis = (patch: Partial<SnapshotBasis> = {}): SnapshotBasis => ({
  apartment, roomId: 'r1', hour: 13, lights: { r1: true }, canvasWidth: 1000, canvasHeight: 800,
  camera: [1, 2, 3, 0, 0, 0, 1], ...patch,
});

describe('«Качественный снимок»: контракт и устаревание (этап 17)', () => {
  it('то же состояние — снимок актуален', () => {
    expect(snapshotStaleReason(basis(), basis())).toBeNull();
  });

  it('правка проекта, комната, время суток, свет, размер вида и камера делают снимок устаревшим', () => {
    expect(snapshotStaleReason(basis(), basis({ apartment: { id: 'a' } }))).toBe('проект изменён');
    expect(snapshotStaleReason(basis(), basis({ roomId: 'r2' }))).toBe('выбрана другая комната');
    expect(snapshotStaleReason(basis(), basis({ hour: 14 }))).toBe('изменено время суток');
    expect(snapshotStaleReason(basis(), basis({ lights: { r1: false } }))).toBe('изменено освещение комнаты');
    expect(snapshotStaleReason(basis(), basis({ canvasWidth: 900 }))).toBe('изменился размер 3D-вида');
    expect(snapshotStaleReason(basis(), basis({ camera: [1, 2, 3.01, 0, 0, 0, 1] }))).toBe('изменена камера');
  });

  it('свет без записи и свет «выключен» — одно и то же', () => {
    expect(snapshotStaleReason(basis({ lights: {} }), basis({ lights: { r1: false } }))).toBeNull();
    expect(snapshotStaleReason(basis({ lights: { r1: true } }), basis({ lights: {} }))).toBe('изменено освещение комнаты');
  });

  it('помощники редактора, значок свечения лампы и материалы без цвета в снимок не берутся', () => {
    expect(hiddenInSnapshot('editor-helper', ['MeshBasicMaterial'])).toBe(true);
    expect(hiddenInSnapshot('lamp-glow', ['MeshBasicMaterial'])).toBe(true);
    expect(hiddenInSnapshot('', ['ShaderMaterial'])).toBe(true);
    expect(hiddenInSnapshot('', ['LineBasicMaterial'])).toBe(true);
    expect(hiddenInSnapshot('ceiling-light', ['MeshStandardMaterial'])).toBe(false);
    expect(hiddenInSnapshot('', [])).toBe(false);
  });

  it('качество: три варианта по возрастанию, по умолчанию «Обычный»; прогресс ограничен 0…1', () => {
    const samples: number[] = SNAPSHOT_QUALITY.map((q) => q.samples);
    expect(samples).toEqual([...samples].sort((a, b) => a - b));
    expect(samples).toContain(DEFAULT_SNAPSHOT_SAMPLES);
    expect(snapshotProgress({ samples: 32, target: 64 })).toBe(0.5);
    expect(snapshotProgress({ samples: 99, target: 64 })).toBe(1);
    expect(snapshotProgress({ samples: 0, target: 0 })).toBe(0);
  });

  it('экспозиция снимка: днём не меняется; ночью со светом ниже, чем ночью без света', () => {
    expect(snapshotExposure(1, 1, true)).toBeCloseTo(1, 10);
    expect(snapshotExposure(1, 1, false)).toBeCloseTo(1, 10);
    const dark = snapshotExposure(1, 0, false);
    const lit = snapshotExposure(1, 0, true);
    expect(dark).toBeCloseTo(1.8, 10);
    expect(lit).toBeCloseTo(0.54, 10);
    expect(lit).toBeLessThan(dark);
  });
});
