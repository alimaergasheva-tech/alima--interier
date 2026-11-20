import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { PointLight } from 'three';
import { plannerDebug } from '../debug';
import { roomClearRect } from '../domain/rooms';
import type { Apartment } from '../domain/types';
import { cmToScene } from '../domain/units';
import { useUiStore } from '../store/uiStore';
import { WALK_LIGHT_LIMIT, pickWalkLights, type RoomLightSpot } from '../walk/lights';
import { CEILING_LIGHT, ceilingLightY } from './CeilingLight';

/**
 * Постоянный набор точечных источников для прогулки: их число не меняется (смена числа источников
 * пересобирает шейдеры и даёт рывок), каждый кадр они переназначаются включённым светильникам рядом с игроком.
 */
export function WalkLights({ apartment, skipRooms }: { apartment: Apartment; skipRooms?: Set<string> }) {
  const refs = useRef<Array<PointLight | null>>([]);
  const spots = useRef<RoomLightSpot[]>([]);
  const key = apartment.rooms.map((room) => room.id).join(',') + apartment.ceilingHeightCm;
  const built = useRef('');
  if (built.current !== key) {
    built.current = key;
    spots.current = apartment.rooms.map((room) => {
      const c = roomClearRect(apartment, room);
      return { roomId: room.id, xCm: (c.minX + c.maxX) / 2, zCm: (c.minZ + c.maxZ) / 2, on: false };
    });
  }
  const y = ceilingLightY(cmToScene(apartment.ceilingHeightCm));

  useFrame(() => {
    const lights = useUiStore.getState().roomLights;
    const player = plannerDebug.walk ?? { xCm: 0, zCm: 0 };
    for (const spot of spots.current) spot.on = lights[spot.roomId] === true && !skipRooms?.has(spot.roomId);
    const chosen = pickWalkLights(spots.current, player);
    refs.current.forEach((light, index) => {
      if (!light) return;
      const spot = chosen[index];
      light.intensity = spot ? CEILING_LIGHT.intensity : 0;
      if (spot) light.position.set(cmToScene(spot.xCm), y - 0.05, cmToScene(spot.zCm));
    });
    plannerDebug.walkLights = chosen.map((spot) => spot.roomId);
  });

  return (
    <>
      {Array.from({ length: WALK_LIGHT_LIMIT }, (_, index) => (
        <pointLight key={index} ref={(light) => { refs.current[index] = light; }} color={CEILING_LIGHT.color} intensity={0} distance={0} decay={2} />
      ))}
    </>
  );
}
