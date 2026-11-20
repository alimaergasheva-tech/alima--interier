import type { Id } from '../domain/types';

/**
 * Светильники каталога (SPEC D-11, D-14, задача 21): где у предмета источник света и какой он.
 * Включаются выключателем комнаты вместе со стандартным потолочным светильником.
 * Люстра и плафон (`replacesCeiling`) заменяют стандартный подвесной светильник своей комнаты.
 */
export interface LampSpec {
  /** Высота источника над нижней точкой предмета, см. */
  yCm: number;
  /** Смещение источника от центра предмета «вперёд» (по +Z предмета), см; для бра — от стены. */
  forwardCm?: number;
  color: string;
  /** Сила точечного света, кд. */
  intensity: number;
  /** Радиус видимого свечения (лампочка/плафон), см. */
  glowCm: number;
  replacesCeiling?: boolean;
}

export const LAMPS: Record<Id, LampSpec> = {
  floor_lamp: { yCm: 140, color: '#ffd9a8', intensity: 14, glowCm: 14 },
  desk_lamp_arm_01: { yCm: 70, forwardCm: 22, color: '#ffe2b8', intensity: 7, glowCm: 5 },
  industrial_wall_sconce: { yCm: 22, forwardCm: 10, color: '#ffd9a8', intensity: 6, glowCm: 5 },
  chandelier_01: { yCm: 8, color: '#ffe0b0', intensity: 46, glowCm: 12, replacesCeiling: true },
  chandelier_02: { yCm: 2, color: '#ffe6c2', intensity: 40, glowCm: 24, replacesCeiling: true },
  ceiling_shade_01: { yCm: 6, color: '#ffe6c2', intensity: 30, glowCm: 14, replacesCeiling: true },
};

export function lampSpec(catalogItemId: Id): LampSpec | undefined {
  return LAMPS[catalogItemId];
}

/** Не более стольких светильников каталога светят одновременно (SPEC D-08: число источников ограничено). */
export const LAMP_LIGHT_LIMIT = 3;

export interface LampSpot {
  instanceId: Id;
  roomId: Id;
  /** Положение источника, см. */
  xCm: number;
  yCm: number;
  zCm: number;
  spec: LampSpec;
}

interface LampInstance { id: Id; catalogItemId: Id; roomId: Id; xCm: number; zCm: number; elevationCm: number; rotationDeg: number }

/** Места источников света для светильников из списка предметов. Чистая функция. */
export function lampSpots(furniture: LampInstance[]): LampSpot[] {
  const spots: LampSpot[] = [];
  for (const instance of furniture) {
    const spec = LAMPS[instance.catalogItemId];
    if (!spec) continue;
    const angle = (instance.rotationDeg * Math.PI) / 180;
    const forward = spec.forwardCm ?? 0;
    spots.push({
      instanceId: instance.id, roomId: instance.roomId, spec,
      xCm: instance.xCm + Math.sin(angle) * forward,
      yCm: instance.elevationCm + spec.yCm,
      zCm: instance.zCm + Math.cos(angle) * forward,
    });
  }
  return spots;
}

/** Комнаты, где стандартный подвесной светильник заменён люстрой или плафоном (SPEC D-14). */
export function roomsWithReplacedCeilingLight(furniture: LampInstance[]): Set<Id> {
  return new Set(furniture.filter((instance) => LAMPS[instance.catalogItemId]?.replacesCeiling).map((instance) => instance.roomId));
}

/** Не более `limit` светильников включённых комнат, ближайших к наблюдателю; порядок — по близости. */
export function pickLamps(spots: LampSpot[], isOn: (roomId: Id) => boolean, viewer: { xCm: number; zCm: number },
  limit: number = LAMP_LIGHT_LIMIT): LampSpot[] {
  return spots
    .filter((spot) => isOn(spot.roomId))
    .map((spot) => ({ spot, distance: Math.hypot(spot.xCm - viewer.xCm, spot.zCm - viewer.zCm) }))
    .sort((a, b) => a.distance - b.distance || a.spot.instanceId.localeCompare(b.spot.instanceId))
    .slice(0, Math.max(0, limit))
    .map((item) => item.spot);
}
