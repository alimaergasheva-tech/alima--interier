import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { PointLight } from 'three';
import { LAMP_LIGHT_LIMIT, lampSpots, pickLamps } from '../catalog/lights';
import { plannerDebug } from '../debug';
import type { Apartment } from '../domain/types';
import { cmToScene } from '../domain/units';
import { useUiStore } from '../store/uiStore';

/**
 * Светильники из каталога (торшер, лампа, бра, люстры): видимое свечение у каждого включённого и
 * постоянный набор из LAMP_LIGHT_LIMIT точечных источников, переназначаемых ближайшим к наблюдателю
 * (число источников не меняется — иначе шейдеры пересобираются). Тени не отбрасываются.
 * Выключатель — общий выключатель комнаты (D-11).
 */
export function LampLights({ apartment, roomIds, walk, excludeId }: {
  apartment: Apartment; roomIds: string[]; walk: boolean; excludeId: string | null;
}) {
  const camera = useThree((state) => state.camera);
  const roomLights = useUiStore((state) => state.roomLights);
  const refs = useRef<Array<PointLight | null>>([]);
  const spots = useMemo(
    () => lampSpots(apartment.furniture.filter((f) => roomIds.includes(f.roomId) && f.id !== excludeId)),
    [apartment.furniture, roomIds.join(','), excludeId],
  );
  const lit = spots.filter((spot) => roomLights[spot.roomId] === true);

  useFrame(() => {
    const lights = useUiStore.getState().roomLights;
    const viewer = walk && plannerDebug.walk
      ? plannerDebug.walk
      : { xCm: camera.position.x * 100, zCm: camera.position.z * 100 };
    const chosen = pickLamps(spots, (roomId) => lights[roomId] === true, viewer);
    refs.current.forEach((light, index) => {
      if (!light) return;
      const spot = chosen[index];
      light.intensity = spot ? spot.spec.intensity : 0;
      if (spot) {
        light.color.set(spot.spec.color);
        light.position.set(cmToScene(spot.xCm), cmToScene(spot.yCm), cmToScene(spot.zCm));
      }
    });
    plannerDebug.lampLights = chosen.map((spot) => spot.instanceId);
  });

  return (
    <>
      {Array.from({ length: LAMP_LIGHT_LIMIT }, (_, index) => (
        <pointLight key={index} ref={(light) => { refs.current[index] = light; }} intensity={0} distance={0} decay={2} />
      ))}
      {lit.map((spot) => (
        <mesh key={spot.instanceId} position={[cmToScene(spot.xCm), cmToScene(spot.yCm), cmToScene(spot.zCm)]} name="lamp-glow" raycast={() => null}>
          <sphereGeometry args={[cmToScene(spot.spec.glowCm), 16, 12]} />
          <meshBasicMaterial color={spot.spec.color} toneMapped={false} transparent opacity={0.9} />
        </mesh>
      ))}
    </>
  );
}
