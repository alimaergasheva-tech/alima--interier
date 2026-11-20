import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import { PMREMGenerator, Plane, Raycaster, Vector2, Vector3, type Group, type Mesh } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { findCatalogItem } from '../catalog/techCatalog';
import { plannerDebug } from '../debug';
import { getRoom, rectDepth, rectWidth, roomClearRect, roomOuterRect } from '../domain/rooms';
import type { Apartment, FurnitureInstance, Id } from '../domain/types';
import { cmToScene, sceneToCm } from '../domain/units';
import { startDrag } from '../interaction/drag';
import { registerSurface } from '../interaction/surfaces';
import { useUiStore } from '../store/uiStore';
import { FurnitureModel } from './FurnitureModel';

export const SCENE_SURFACE_ID = 'scene';

const FLOOR_PLANE = new Plane(new Vector3(0, 1, 0), 0);

/** Связывает 3D-вид с общим циклом переноса: луч из камеры до плоскости пола. */
function SurfaceBridge() {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const element = gl.domElement;
    const raycaster = new Raycaster();
    const hit = new Vector3();
    return registerSurface(SCENE_SURFACE_ID, {
      element,
      toProject: (clientX, clientY) => {
        const rect = element.getBoundingClientRect();
        const ndc = new Vector2(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(ndc, camera);
        if (!raycaster.ray.intersectPlane(FLOOR_PLANE, hit)) return null;
        return { xCm: sceneToCm(hit.x), zCm: sceneToCm(hit.z) };
      },
      toClient: (xCm, zCm) => {
        const rect = element.getBoundingClientRect();
        const point = new Vector3(cmToScene(xCm), 0, cmToScene(zCm)).project(camera);
        return {
          x: rect.left + ((point.x + 1) / 2) * rect.width,
          y: rect.top + ((1 - point.y) / 2) * rect.height,
        };
      },
    });
  }, [camera, gl]);

  useFrame(() => {
    plannerDebug.sceneReadyMs ??= performance.now();
    plannerDebug.camera = { position: [camera.position.x, camera.position.y, camera.position.z] };
  });
  return null;
}

/** Нейтральное окружение для отражений PBR-материалов; файлы не загружаются. */
function Environment() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      target.dispose();
      room.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

interface WallSpec {
  key: string;
  position: [number, number, number];
  size: [number, number, number];
  /** Наружная нормаль: стена скрывается, когда камера смотрит на неё снаружи. */
  normal: [number, number];
}

function RoomShell({ apartment, roomId }: { apartment: Apartment; roomId: Id }) {
  const room = getRoom(apartment, roomId);
  const clear = roomClearRect(apartment, room);
  const outer = roomOuterRect(apartment, room);
  const height = cmToScene(apartment.ceilingHeightCm);
  const group = useRef<Group>(null);

  const walls = useMemo<WallSpec[]>(() => {
    const m = cmToScene;
    const midZ = (outer.minZ + outer.maxZ) / 2;
    const midX = (clear.minX + clear.maxX) / 2;
    // Стены по X занимают всю глубину контура, стены по Z — только чистую ширину:
    // объёмы не перекрываются, поэтому совпадающих граней нет.
    return [
      {
        key: 'minX',
        position: [m((outer.minX + clear.minX) / 2), height / 2, m(midZ)],
        size: [m(clear.minX - outer.minX), height, m(rectDepth(outer))],
        normal: [-1, 0],
      },
      {
        key: 'maxX',
        position: [m((outer.maxX + clear.maxX) / 2), height / 2, m(midZ)],
        size: [m(outer.maxX - clear.maxX), height, m(rectDepth(outer))],
        normal: [1, 0],
      },
      {
        key: 'minZ',
        position: [m(midX), height / 2, m((outer.minZ + clear.minZ) / 2)],
        size: [m(rectWidth(clear)), height, m(clear.minZ - outer.minZ)],
        normal: [0, -1],
      },
      {
        key: 'maxZ',
        position: [m(midX), height / 2, m((outer.maxZ + clear.maxZ) / 2)],
        size: [m(rectWidth(clear)), height, m(outer.maxZ - clear.maxZ)],
        normal: [0, 1],
      },
    ];
  }, [clear.minX, clear.maxX, clear.minZ, clear.maxZ, outer.minX, outer.maxX, outer.minZ, outer.maxZ, height]);

  useFrame(({ camera }) => {
    group.current?.children.forEach((child, index) => {
      const wall = walls[index];
      if (!wall) return;
      const dx = camera.position.x - wall.position[0];
      const dz = camera.position.z - wall.position[2];
      (child as Mesh).visible = dx * wall.normal[0] + dz * wall.normal[1] <= 0;
    });
  });

  const floorW = cmToScene(rectWidth(clear));
  const floorD = cmToScene(rectDepth(clear));
  return (
    <>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[cmToScene((clear.minX + clear.maxX) / 2), 0, cmToScene((clear.minZ + clear.maxZ) / 2)]}
        receiveShadow
      >
        <planeGeometry args={[floorW, floorD]} />
        <meshStandardMaterial color="#b89a78" roughness={0.75} />
      </mesh>
      <group ref={group}>
        {walls.map((wall) => (
          <mesh key={wall.key} position={wall.position} receiveShadow castShadow>
            <boxGeometry args={wall.size} />
            <meshStandardMaterial color="#e6e2da" roughness={0.92} />
          </mesh>
        ))}
      </group>
    </>
  );
}

function SceneContents({ apartment, roomId }: { apartment: Apartment; roomId: Id }) {
  const selection = useUiStore((state) => state.selection);
  const draft = useUiStore((state) => state.draft);
  const select = useUiStore((state) => state.select);
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null;

  const clear = roomClearRect(apartment, getRoom(apartment, roomId));
  const center: [number, number, number] = [
    cmToScene((clear.minX + clear.maxX) / 2),
    0.5,
    cmToScene((clear.minZ + clear.maxZ) / 2),
  ];

  const startMove = (instance: FurnitureInstance) => (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    // Отключается синхронно, до обработчика камеры: перенос не вращает вид.
    if (controls) controls.enabled = false;
    select({ kind: 'furniture', id: instance.id });
    startDrag({ type: 'move', furnitureId: instance.id }, event.nativeEvent, {
      roomId,
      catalogItemId: instance.catalogItemId,
      pose: instance,
      surfaceId: SCENE_SURFACE_ID,
    });
  };

  const movingId = draft?.source.type === 'move' && draft.overSurface ? draft.source.furnitureId : null;
  const draftItem = draft?.overSurface ? findCatalogItem(draft.catalogItemId) : undefined;

  return (
    <>
      <color attach="background" args={['#14161a']} />
      <Environment />
      <hemisphereLight args={['#ffffff', '#8a7f72', 0.55]} />
      <directionalLight
        position={[center[0] + 2.5, 5.5, center[2] + 1.5]}
        intensity={2.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      >
        <orthographicCamera attach="shadow-camera" args={[-5, 5, 5, -5, 0.5, 14]} />
      </directionalLight>

      <RoomShell apartment={apartment} roomId={roomId} />

      {apartment.furniture
        .filter((instance) => instance.roomId === roomId && instance.id !== movingId)
        .map((instance) => {
          const item = findCatalogItem(instance.catalogItemId);
          if (!item) return null;
          return (
            <Suspense key={instance.id} fallback={null}>
              <FurnitureModel
                item={item}
                pose={instance}
                elevationCm={instance.elevationCm}
                selected={selection?.kind === 'furniture' && selection.id === instance.id}
                onPointerDown={startMove(instance)}
              />
            </Suspense>
          );
        })}

      {draft && draftItem && (
        <Suspense fallback={null}>
          <FurnitureModel item={draftItem} pose={draft.pose} ghost valid={draft.result.valid} />
        </Suspense>
      )}

      <OrbitControls
        makeDefault
        enabled={draft === null}
        target={center}
        minDistance={1.5}
        maxDistance={14}
        maxPolarAngle={Math.PI / 2 - 0.05}
      />
      <SurfaceBridge />
    </>
  );
}

export function RoomScene({ apartment, roomId }: { apartment: Apartment; roomId: Id }) {
  const select = useUiStore((state) => state.select);
  const clear = roomClearRect(apartment, getRoom(apartment, roomId));
  const cx = cmToScene((clear.minX + clear.maxX) / 2);
  const cz = cmToScene((clear.minZ + clear.maxZ) / 2);
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [cx + 3.4, 4.2, cz + 5.4], fov: 45, near: 0.1, far: 60 }}
      onPointerMissed={() => select(null)}
    >
      <SceneContents apartment={apartment} roomId={roomId} />
    </Canvas>
  );
}
