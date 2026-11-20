import { OuterWorld } from './OuterWorld';
import { NoWebGLMessage, SceneBoundary, hasWebGL } from './webglSupport';
import { PATH_TRACE_ENABLED, PathTraceProbe } from './PathTraceProbe';
import { QualitySnapshot } from './QualitySnapshot';
import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { DirectionalLight, ExtrudeGeometry, Mesh, PlaneGeometry, ShapeGeometry, PMREMGenerator, Plane, Raycaster, Vector2, Vector3 } from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { findCatalogItem } from '../catalog/techCatalog';
import { ModelGuard } from './ModelGuard';
import { plannerDebug } from '../debug';
import { getRoom, rectDepth, rectWidth, roomClearRect, roomOuterRect } from '../domain/rooms';
import type { Apartment, FurnitureInstance, Id } from '../domain/types';
import { cmToScene, sceneToCm } from '../domain/units';
import { startDrag, startRotate } from '../interaction/drag';
import { registerSurface } from '../interaction/surfaces';
import { useUiStore } from '../store/uiStore';
import { findFinish } from '../catalog/finishes';
import { wallSurfaceKey } from '../domain/rooms';
import type { MaterialDefinition } from '../domain/types';
import { useFinishMaterial } from './finishMaterial';
import { roomBehindDoor } from '../geometry/apartmentChecks';
import { openingSpan } from '../geometry/openings';
import { FurnitureModel } from './FurnitureModel';
import { stainedGlassTexture } from './stainedGlass';
import { LIGHTING, environmentFor, exposureFor, keyLight, shadowFrustum } from './lighting';
import { skyAt } from './timeOfDay';
import { CeilingLight } from './CeilingLight';
import { LampLights } from './LampLights';
import { roomsWithReplacedCeilingLight } from '../catalog/lights';
import { WalkControls } from './WalkControls';
import { WalkLights } from './WalkLights';
import { buildWallPanels, buildWallShape, type WallPanel } from './wallPanels';

export const SCENE_SURFACE_ID = 'scene';

/**
 * Нажатие на предмет временно заменяет его кандидатом переноса, поэтому к моменту click
 * луч уже ничего не попадает и onPointerMissed снял бы выбор. Флаг гасит этот ложный промах.
 */
let pressedOnItem = false;
if (typeof window !== 'undefined') window.addEventListener('pointerdown', () => { pressedOnItem = false; }, true);

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

  useEffect(() => {
    plannerDebug.project3d = (xCm, yCm, zCm) => {
      const rect = gl.domElement.getBoundingClientRect();
      const point = new Vector3(cmToScene(xCm), cmToScene(yCm), cmToScene(zCm)).project(camera);
      return { x: rect.left + ((point.x + 1) / 2) * rect.width, y: rect.top + ((1 - point.y) / 2) * rect.height };
    };
    plannerDebug.renderInfo = () => ({ geometries: gl.info.memory.geometries, textures: gl.info.memory.textures,
      programs: gl.info.programs?.length ?? 0, calls: gl.info.render.calls });
    return () => { plannerDebug.project3d = null; plannerDebug.renderInfo = null; };
  }, [camera, gl]);

  useFrame(() => {
    plannerDebug.sceneReadyMs ??= performance.now();
    plannerDebug.camera = { position: [camera.position.x, camera.position.y, camera.position.z] };
  });
  return null;
}

/** Нейтральное окружение для отражений PBR-материалов; файлы не загружаются. */
function Environment({ intensity }: { intensity: number }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const intensityRef = useRef(intensity);
  intensityRef.current = intensity;
  useEffect(() => { scene.environmentIntensity = intensity; }, [scene, intensity]);
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = pmrem.fromScene(room, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = intensityRef.current;
    return () => {
      scene.environment = null;
      target.dispose();
      room.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

const DOOR_LEAF_THICKNESS = 0.04;
const FRAME_BAR = 0.05;

interface WallSideProps {
  panel: WallPanel;
  hidden: boolean;
  finish: MaterialDefinition | undefined;
  selected: boolean;
  onDoor(openingId: Id): void;
  onSurface(wallId: Id): void;
  /** Прогулка: без створок дверей и без выбора поверхностей. */
  walk?: boolean;
}

/** Одна сторона комнаты: стена с настоящими отверстиями, створка двери и остекление окна. */
function WallSide({ panel, hidden, finish, selected, onDoor, onSurface, walk = false }: WallSideProps) {
  const gl = useThree((state) => state.gl);
  const thickness = cmToScene(panel.thicknessCm);
  const geometry = useMemo(
    () => new ExtrudeGeometry(buildWallShape(panel), { depth: thickness, bevelEnabled: false }),
    [panel, thickness],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  const overlay = useMemo(() => new ShapeGeometry(buildWallShape(panel)), [panel]);
  useEffect(() => () => overlay.dispose(), [overlay]);
  const finishMaterial = useFinishMaterial(finish, selected);
  // Внутренняя грань: у сторон minZ и maxX она на дальней по выдавливанию стороне плиты.
  const innerAtBack = panel.side === 'minZ' || panel.side === 'maxX';
  const surfaceClick = (event: ThreeEvent<MouseEvent>) => {
    if (walk || event.delta > 4 || useUiStore.getState().draft) return;
    event.stopPropagation();
    onSurface(panel.wallIds[0]!);
  };
  const raycast = hidden || walk ? noRaycast : Mesh.prototype.raycast;
  const origin = cmToScene(panel.originCm);
  return (
    <group
      visible={!hidden}
      position={panel.alongX ? [0, 0, origin] : [origin, 0, 0]}
      rotation-y={panel.alongX ? 0 : -Math.PI / 2}
    >
      <mesh geometry={geometry} raycast={raycast} receiveShadow castShadow onClick={surfaceClick}>
        <meshStandardMaterial color="#e6e2da" roughness={0.92} />
      </mesh>
      {finishMaterial && (
        <mesh geometry={overlay} material={finishMaterial} raycast={raycast} receiveShadow
          position={[0, 0, innerAtBack ? thickness + 0.0015 : -0.0015]} onClick={surfaceClick}
          data-finish-side={panel.side} />
      )}
      {panel.openings.map((opening) => {
        const w = cmToScene(opening.uMaxCm - opening.uMinCm);
        const h = cmToScene(opening.yMaxCm - opening.yMinCm);
        const u = cmToScene((opening.uMinCm + opening.uMaxCm) / 2);
        const y = cmToScene((opening.yMinCm + opening.yMaxCm) / 2);
        if (opening.kind === 'door') {
          if (walk) return null;
          return (
            <mesh
              key={opening.id}
              position={[u, y, thickness / 2]}
              raycast={raycast}
              castShadow
              onClick={(event) => {
                if (event.delta > 4 || useUiStore.getState().draft) return;
                event.stopPropagation();
                onDoor(opening.id);
              }}
              onPointerOver={() => { gl.domElement.style.cursor = 'pointer'; }}
              onPointerOut={() => { gl.domElement.style.cursor = ''; }}
              data-door-id={opening.id}
            >
              <boxGeometry args={[w, h, DOOR_LEAF_THICKNESS]} />
              <meshStandardMaterial color="#9a7650" roughness={0.6} />
            </mesh>
          );
        }
        return (
          <group key={opening.id} position={[u, y, thickness / 2]}>
            <mesh raycast={raycast}>
              <boxGeometry args={[w, h, 0.01]} />
              {opening.stained
                ? <meshStandardMaterial map={stainedGlassTexture()} transparent roughness={0.2} depthWrite={false} />
                : <meshStandardMaterial color="#bfe3f2" transparent opacity={0.25} roughness={0.05} depthWrite={false} />}
            </mesh>
            {([
              [0, h / 2, w + FRAME_BAR, FRAME_BAR],
              [0, -h / 2, w + FRAME_BAR, FRAME_BAR],
              [-w / 2, 0, FRAME_BAR, h],
              [w / 2, 0, FRAME_BAR, h],
            ] as const).map(([fx, fy, fw, fh], index) => (
              <mesh key={index} position={[fx, fy, 0]} raycast={raycast} castShadow>
                <boxGeometry args={[fw, fh, 0.06]} />
                <meshStandardMaterial color="#f3f1ec" roughness={0.5} />
              </mesh>
            ))}
          </group>
        );
      })}
    </group>
  );
}

const noRaycast = () => {};

function RoomShell({ apartment, roomId, walk = false }: { apartment: Apartment; roomId: Id; walk?: boolean }) {
  const room = getRoom(apartment, roomId);
  const clear = roomClearRect(apartment, room);
  const goThroughDoor = useUiStore((state) => state.goThroughDoor);
  const selection = useUiStore((state) => state.selection);
  const select = useUiStore((state) => state.select);
  const setNotice = useUiStore((state) => state.setNotice);
  // Пол: UV в метрах, поэтому физический повтор текстуры (1 единица UV = 1 м) работает без подгонки под комнату.
  const floorWidth = cmToScene(rectWidth(clear)), floorDepth = cmToScene(rectDepth(clear));
  const floorGeometry = useMemo(() => {
    const geometry = new PlaneGeometry(floorWidth, floorDepth);
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * floorWidth, uv.getY(i) * floorDepth);
    return geometry;
  }, [floorWidth, floorDepth]);
  const floorMaterial = useFinishMaterial(findFinish(apartment.floorFinishes?.[roomId] ?? ''), false);
  const fresh = buildWallPanels(apartment, roomId);
  const key = JSON.stringify(fresh);
  // Геометрия стен пересобирается только при изменении самих стен, а не мебели.
  const panels = useMemo(() => JSON.parse(key) as WallPanel[], [key]);
  useEffect(() => {
    if (walk) return;
    plannerDebug.sceneInfo = {
      roomId,
      finishedSides: panels.filter((panel) => apartment.wallFinishes[wallSurfaceKey(panel.wallIds[0] ?? '', roomId)]).map((panel) => panel.side),
      clearCm: { width: rectWidth(clear), depth: rectDepth(clear) },
      doors: panels.flatMap((panel) => panel.openings.filter((o) => o.kind === 'door').map((o) => ({
        id: o.id, yCm: o.yMaxCm / 2,
        xCm: panel.alongX ? (o.uMinCm + o.uMaxCm) / 2 : panel.originCm - panel.thicknessCm / 2,
        zCm: panel.alongX ? panel.originCm + panel.thicknessCm / 2 : (o.uMinCm + o.uMaxCm) / 2,
      }))),
    };
    return () => { plannerDebug.sceneInfo = null; };
  }, [walk, panels, roomId, apartment.wallFinishes, clear.minX, clear.maxX, clear.minZ, clear.maxZ]);
  const [hiddenKey, setHiddenKey] = useState('');
  const hidden = new Set(hiddenKey.split(',').filter(Boolean));

  useFrame(({ camera }) => {
    if (walk) { if (hiddenKey) setHiddenKey(''); return; }
    const next = panels.filter((panel) => {
      const dx = camera.position.x - cmToScene(panel.centerCm.x);
      const dz = camera.position.z - cmToScene(panel.centerCm.z);
      return dx * panel.normal[0] + dz * panel.normal[1] > 0;
    }).map((panel) => panel.side).join(',');
    if (next !== hiddenKey) setHiddenKey(next);
  });

  const onDoor = (openingId: Id) => {
    const target = roomBehindDoor(apartment, openingId, roomId);
    if (target) goThroughDoor(target.id, openingId);
    else setNotice('Входная дверь ведёт наружу: переход возможен только между комнатами квартиры.');
  };

  return (
    <>
      <mesh
        rotation-x={-Math.PI / 2}
        position={[cmToScene((clear.minX + clear.maxX) / 2), 0, cmToScene((clear.minZ + clear.maxZ) / 2)]}
        receiveShadow
        geometry={floorGeometry}
      >
        {floorMaterial ? <primitive object={floorMaterial} attach="material" /> : <meshStandardMaterial color="#b89a78" roughness={0.75} />}
      </mesh>
      {walk && (
        <mesh rotation-x={Math.PI / 2} position={[cmToScene((clear.minX + clear.maxX) / 2), cmToScene(apartment.ceilingHeightCm), cmToScene((clear.minZ + clear.maxZ) / 2)]}>
          <planeGeometry args={[cmToScene(rectWidth(clear)), cmToScene(rectDepth(clear))]} />
          <meshStandardMaterial color="#efece6" roughness={0.95} />
        </mesh>
      )}
      {panels.map((panel) => (
        <WallSide key={panel.side} panel={panel} hidden={hidden.has(panel.side)} onDoor={onDoor} walk={walk}
          finish={findFinish(apartment.wallFinishes[wallSurfaceKey(panel.wallIds[0] ?? '', roomId)] ?? '')}
          selected={selection?.kind === 'wall-surface' && selection.roomId === roomId && panel.wallIds.includes(selection.wallId)}
          onSurface={(wallId) => select({ kind: 'wall-surface', wallId, roomId })} />
      ))}
    </>
  );
}

/** Камера встаёт напротив двери, через которую вошли (или первой двери комнаты): дверь видна сразу. */
function ArrivalCamera({ apartment, roomId }: { apartment: Apartment; roomId: Id }) {
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as { target: Vector3; update(): void } | null;
  const arrivalDoorId = useUiStore((state) => state.arrivalDoorId);
  const latest = useRef(apartment);
  latest.current = apartment;
  useEffect(() => {
    if (!controls) return;
    const current = latest.current;
    const room = getRoom(current, roomId);
    const clear = roomClearRect(current, room);
    const doors = current.openings.filter((o) => o.kind === 'door'
      && room.boundary.some((ref) => ref.wallId === o.wallId));
    const door = doors.find((o) => o.id === arrivalDoorId) ?? doors[0];
    if (!door) return;
    const span = openingSpan(current, door);
    const doorX = span.alongX ? (span.min + span.max) / 2 : span.fixed;
    const doorZ = span.alongX ? span.fixed : (span.min + span.max) / 2;
    const cx = (clear.minX + clear.maxX) / 2;
    const cz = (clear.minZ + clear.maxZ) / 2;
    const length = Math.hypot(cx - doorX, cz - doorZ) || 1;
    const distance = Math.max(rectWidth(clear), rectDepth(clear)) / 100 * 0.8 + 2.2;
    const height = Math.min(5, current.ceilingHeightCm / 100 * 0.85 + 1.2);
    camera.position.set(
      cmToScene(cx) + ((cx - doorX) / length) * distance, height,
      cmToScene(cz) + ((cz - doorZ) / length) * distance,
    );
    controls.target.set(cmToScene(cx), 0.5, cmToScene(cz));
    controls.update();
  }, [roomId, arrivalDoorId, controls, camera]);
  return null;
}

/** Солнце с камерой тени по размеру комнаты; цель добавляется в сцену, иначе её матрица не обновляется. */
function SunLight({ frustum, target, color, intensity }: {
  frustum: ReturnType<typeof shadowFrustum>; target: [number, number, number]; color: string; intensity: number;
}) {
  const light = useRef<DirectionalLight>(null);
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    const sun = light.current;
    if (!sun) return;
    sun.target.position.set(...target);
    scene.add(sun.target);
    return () => { scene.remove(sun.target); };
  }, [scene, target[0], target[1], target[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <directionalLight
      ref={light}
      position={frustum.position}
      color={color}
      intensity={intensity}
      castShadow
      shadow-mapSize={[LIGHTING.sun.shadowMapSize, LIGHTING.sun.shadowMapSize]}
      shadow-bias={LIGHTING.sun.shadowBias}
      shadow-normalBias={LIGHTING.sun.shadowNormalBias}
    >
      <orthographicCamera attach="shadow-camera" args={[-frustum.half, frustum.half, frustum.half, -frustum.half, frustum.near, frustum.far]} />
    </directionalLight>
  );
}

function SceneContents({ apartment, roomId }: { apartment: Apartment; roomId: Id }) {
  const selection = useUiStore((state) => state.selection);
  const draft = useUiStore((state) => state.draft);
  const select = useUiStore((state) => state.select);
  const controls = useThree((state) => state.controls) as { enabled: boolean; target: Vector3; update(): void } | null;

  const clear = roomClearRect(apartment, getRoom(apartment, roomId));
  const center: [number, number, number] = [
    cmToScene((clear.minX + clear.maxX) / 2),
    0.5,
    cmToScene((clear.minZ + clear.maxZ) / 2),
  ];

  const walk = useUiStore((state) => state.walk);
  const hour = useUiStore((state) => state.timeOfDay);
  const sky = useMemo(() => skyAt(hour), [hour]);
  const key = useMemo(() => keyLight(sky), [sky]);
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    gl.toneMappingExposure = exposureFor(sky);
    plannerDebug.lighting = {
      key: key.kind, keyIntensity: key.intensity, hemisphere: sky.hemisphere.intensity,
      exposure: exposureFor(sky), environment: environmentFor(sky),
    };
  }, [gl, sky, key]);
  useEffect(() => () => { plannerDebug.lighting = null; }, []);

  // В прогулке камера тени охватывает всю квартиру, а не одну комнату.
  const bounds = walk
    ? apartment.rooms.map((room) => roomOuterRect(apartment, room)).reduce((a, b) => ({
      minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX), minZ: Math.min(a.minZ, b.minZ), maxZ: Math.max(a.maxZ, b.maxZ),
    }))
    : clear;
  const shownRooms = walk ? apartment.rooms : [getRoom(apartment, roomId)];
  const sun = useMemo(() => {
    const f = shadowFrustum([cmToScene((bounds.minX + bounds.maxX) / 2), cmToScene((bounds.minZ + bounds.maxZ) / 2)], {
      width: cmToScene(rectWidth(bounds)),
      depth: cmToScene(rectDepth(bounds)),
      height: cmToScene(apartment.ceilingHeightCm),
    }, key.direction);
    return { ...f, target: cmToScene(apartment.ceilingHeightCm) / 2 };
  }, [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ, apartment.ceilingHeightCm, key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Управление камерой выключается синхронно при нажатии на предмет; после любого отпускания
  // возвращаем его по фактическому состоянию переноса, не полагаясь на перерисовку React.
  useEffect(() => {
    if (!controls) return;
    const restore = () => {
      setTimeout(() => { controls.enabled = useUiStore.getState().draft === null; }, 0);
    };
    window.addEventListener('pointerup', restore);
    window.addEventListener('pointercancel', restore);
    window.addEventListener('blur', restore);
    return () => {
      window.removeEventListener('pointerup', restore);
      window.removeEventListener('pointercancel', restore);
      window.removeEventListener('blur', restore);
    };
  }, [controls]);

  const camera = useThree((state) => state.camera);
  useEffect(() => {
    plannerDebug.lookAt = (position, target) => {
      camera.position.set(cmToScene(position[0]), cmToScene(position[1]), cmToScene(position[2]));
      controls?.target.set(cmToScene(target[0]), cmToScene(target[1]), cmToScene(target[2]));
      controls?.update();
    };
    return () => { plannerDebug.lookAt = null; };
  }, [camera, controls]);

  const startMove = (instance: FurnitureInstance) => (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    pressedOnItem = true;
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

  const startRotation = (instance: FurnitureInstance) => (event: ThreeEvent<PointerEvent>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    pressedOnItem = true;
    if (controls) controls.enabled = false;
    startRotate(instance.id, event.nativeEvent, {
      roomId,
      catalogItemId: instance.catalogItemId,
      pose: instance,
      surfaceId: SCENE_SURFACE_ID,
    });
  };

  const movingId = draft?.source.type === 'move' && draft.overSurface ? draft.source.furnitureId : null;
  const replacedCeiling = roomsWithReplacedCeilingLight(apartment.furniture.filter((instance) => instance.id !== movingId));
  const sceneIds = apartment.furniture.filter((instance) => instance.roomId === roomId && instance.id !== movingId)
    .map((instance) => instance.id).join(',');
  useEffect(() => {
    plannerDebug.sceneFurniture = sceneIds ? sceneIds.split(',') : [];
    return () => { plannerDebug.sceneFurniture = []; };
  }, [sceneIds]);
  const draftItem = draft?.overSurface ? findCatalogItem(draft.catalogItemId) : undefined;

  return (
    <>
      <color attach="background" args={['#14161a']} />
      <OuterWorld apartment={apartment} />
      <Environment intensity={environmentFor(sky)} />
      <hemisphereLight args={[sky.hemisphere.sky, sky.hemisphere.ground, sky.hemisphere.intensity]} />
      <SunLight frustum={sun} target={[cmToScene((bounds.minX + bounds.maxX) / 2), sun.target, cmToScene((bounds.minZ + bounds.maxZ) / 2)]} color={key.color} intensity={key.intensity} />

      {shownRooms.map((room) => {
        const c = roomClearRect(apartment, room);
        return <CeilingLight key={room.id} roomId={room.id} center={[cmToScene((c.minX + c.maxX) / 2), cmToScene((c.minZ + c.maxZ) / 2)]}
          ceilingHeightM={cmToScene(apartment.ceilingHeightCm)} emitLight={!walk} hidden={replacedCeiling.has(room.id)} />;
      })}
      {walk && <WalkLights apartment={apartment} skipRooms={replacedCeiling} />}
      <LampLights apartment={apartment} roomIds={shownRooms.map((room) => room.id)} walk={walk} excludeId={movingId} />
      {shownRooms.map((room) => <RoomShell key={room.id} apartment={apartment} roomId={room.id} walk={walk} />)}
      {!walk && <ArrivalCamera apartment={apartment} roomId={roomId} />}

      {apartment.furniture
        .filter((instance) => (walk || instance.roomId === roomId) && instance.id !== movingId)
        .map((instance) => {
          const item = findCatalogItem(instance.catalogItemId);
          if (!item) return null;
          return (
            <ModelGuard key={instance.id} url={item.model.url} label={item.name}>
              <Suspense fallback={null}>
                <FurnitureModel
                  item={item}
                  pose={instance}
                  elevationCm={instance.elevationCm}
                  selected={selection?.kind === 'furniture' && selection.id === instance.id}
                  onPointerDown={walk ? undefined : startMove(instance)}
                  onRotateStart={!walk && selection?.kind === 'furniture' && selection.id === instance.id ? startRotation(instance) : undefined}
                />
              </Suspense>
            </ModelGuard>
          );
        })}

      {draft && draftItem && (
        <ModelGuard url={draftItem.model.url} label={draftItem.name}>
          <Suspense fallback={null}>
            <FurnitureModel item={draftItem} pose={draft.pose} ghost valid={draft.result.valid} />
          </Suspense>
        </ModelGuard>
      )}

      {walk ? <WalkControls apartment={apartment} roomId={roomId} /> : (
        <OrbitControls
          makeDefault
          enabled={draft === null}
          target={center}
          minDistance={1.5}
          maxDistance={14}
          maxPolarAngle={Math.PI / 2 - 0.05}
        />
      )}
      <SurfaceBridge />
      {PATH_TRACE_ENABLED && <PathTraceProbe />}
      {!walk && <QualitySnapshot />}
    </>
  );
}

export function RoomScene({ apartment, roomId }: { apartment: Apartment; roomId: Id }) {
  const webgl = useMemo(hasWebGL, []);
  const select = useUiStore((state) => state.select);
  const clear = roomClearRect(apartment, getRoom(apartment, roomId));
  const cx = cmToScene((clear.minX + clear.maxX) / 2);
  const cz = cmToScene((clear.minZ + clear.maxZ) / 2);
  if (!webgl) return <NoWebGLMessage />;
  return (
    <SceneBoundary>
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ toneMapping: LIGHTING.toneMapping, toneMappingExposure: LIGHTING.toneMappingExposure }}
      camera={{ position: [cx + 3.4, 4.2, cz + 5.4], fov: 45, near: 0.1, far: 700 }}
      onPointerMissed={() => {
        if (pressedOnItem) { pressedOnItem = false; return; }
        select(null);
      }}
    >
      <SceneContents apartment={apartment} roomId={roomId} />
    </Canvas>
    </SceneBoundary>
  );
}
