import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { Euler } from 'three';
import { findCatalogItem } from '../catalog/techCatalog';
import { plannerDebug } from '../debug';
import { rectDepth, rectWidth, roomClearRect } from '../domain/rooms';
import type { Apartment, Id } from '../domain/types';
import { cmToScene } from '../domain/units';
import { useUiStore } from '../store/uiStore';
import { WALK, buildObstacles, moveWalker, walkDelta } from '../walk/collision';

// Режим «Прогулка» (SPEC D-17, задача 24.1): камера от первого лица на высоте глаз, W A S D и стрелки,
// обзор мышью (зажать левую кнопку и вести), шаг по времени кадра, столкновения из src/walk/collision.

const LOOK_SPEED = 0.004;
const PITCH_LIMIT = 1.2;

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export function WalkControls({ apartment, roomId }: { apartment: Apartment; roomId: Id }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const setWalk = useUiStore((state) => state.setWalk);
  const setWalkRoom = useUiStore((state) => state.setWalkRoom);
  const obstacles = useMemo(() => buildObstacles(apartment, findCatalogItem), [apartment]);
  const obstaclesRef = useRef(obstacles);
  obstaclesRef.current = obstacles;
  const apartmentRef = useRef(apartment);
  apartmentRef.current = apartment;
  const state = useRef({ xCm: 0, zCm: 0, yaw: 0, pitch: 0, keys: new Set<string>(), looking: false, room: '' as string });

  // Старт в центре активной комнаты; взгляд вдоль её длинной стороны.
  useEffect(() => {
    const room = apartmentRef.current.rooms.find((item) => item.id === roomId)!;
    const clear = roomClearRect(apartmentRef.current, room);
    const s = state.current;
    s.xCm = (clear.minX + clear.maxX) / 2;
    s.zCm = (clear.minZ + clear.maxZ) / 2;
    s.yaw = rectWidth(clear) >= rectDepth(clear) ? Math.PI / 2 : 0;
    s.pitch = 0;
    s.room = roomId;
    setWalkRoom(roomId);
    camera.rotation.order = 'YXZ';
    plannerDebug.walkTo = (xCm, zCm, yawDeg) => {
      s.xCm = xCm; s.zCm = zCm; s.yaw = (yawDeg * Math.PI) / 180;
    };
    return () => {
      plannerDebug.walk = null;
      plannerDebug.walkTo = null;
      camera.rotation.order = 'XYZ';
      setWalkRoom(null);
    };
  }, [roomId, camera, setWalkRoom]);

  useEffect(() => {
    const s = state.current;
    const keyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === 'Escape') { setWalk(false); return; }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
        s.keys.add(event.code);
        if (event.code.startsWith('Arrow')) event.preventDefault();
      }
    };
    const keyUp = (event: KeyboardEvent) => { s.keys.delete(event.code); };
    const clear = () => { s.keys.clear(); s.looking = false; };
    const down = (event: PointerEvent) => { if (event.button === 0) s.looking = true; };
    const move = (event: PointerEvent) => {
      if (!s.looking) return;
      s.yaw -= event.movementX * LOOK_SPEED;
      s.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, s.pitch - event.movementY * LOOK_SPEED));
    };
    const up = () => { s.looking = false; };
    const canvas = gl.domElement;
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', clear);
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', clear);
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [gl, setWalk]);

  useFrame((_, delta) => {
    const s = state.current;
    const dt = Math.min(delta, 0.1);
    const k = s.keys;
    const forward = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const strafe = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    if (forward !== 0 || strafe !== 0) {
      const run = k.has('ShiftLeft') || k.has('ShiftRight') ? 2 : 1;
      const step = walkDelta(s.yaw, forward, strafe, WALK.speedCmPerS * run * dt);
      const next = moveWalker({ xCm: s.xCm, zCm: s.zCm }, step, obstaclesRef.current);
      s.xCm = next.xCm; s.zCm = next.zCm;
    }
    camera.position.set(cmToScene(s.xCm), cmToScene(WALK.eyeCm), cmToScene(s.zCm));
    camera.rotation.copy(new Euler(s.pitch, s.yaw, 0, 'YXZ'));
    const under = apartmentRef.current.rooms.find((room) => {
      const c = roomClearRect(apartmentRef.current, room);
      return s.xCm >= c.minX && s.xCm <= c.maxX && s.zCm >= c.minZ && s.zCm <= c.maxZ;
    });
    if (under && under.id !== s.room) { s.room = under.id; setWalkRoom(under.id); }
    plannerDebug.walk = { xCm: s.xCm, zCm: s.zCm, yawDeg: (s.yaw * 180) / Math.PI, roomId: s.room };
  });
  return null;
}
