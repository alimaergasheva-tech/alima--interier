import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Color, DoubleSide, BackSide, InstancedMesh, Matrix4, Object3D, ShaderMaterial, Vector3 } from 'three';
import type { Apartment } from '../domain/types';
import { plannerDebug } from '../debug';
import { useUiStore } from '../store/uiStore';
import { mixColors, skyAt } from './timeOfDay';
import { WORLD, apartmentBoundsM, buildWorld, rng, type Rect2 } from './worldLayout';

// Внешний мир за окнами (задача 20.3, SPEC D-12): процедурное небо с солнцем, луной и звёздами, земля,
// дома и деревья. Файлы не загружаются. Мир виден только через проёмы: стены комнаты непрозрачны.
// Цвета следуют за временем суток (20.1); свет самой комнаты привязывается в 20.4.

const NO_RAYCAST = () => null;

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 pos = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * pos;
  }
`;
const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 groundColor;
  uniform vec3 sunDir; uniform vec3 sunColor; uniform vec3 moonDir;
  uniform float stars; uniform float daylight;
  varying vec3 vDir;
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.5));
    col = mix(col, groundColor, smoothstep(-0.005, -0.02, h));
    // Солнце: диск и ореол.
    float sd = dot(d, normalize(sunDir));
    col += sunColor * (smoothstep(0.99965, 0.9999, sd) * 6.0 + pow(max(sd, 0.0), 48.0) * 0.55 * (0.3 + daylight));
    // Луна: диск с мягким краем и слабым ореолом.
    float md = dot(d, normalize(moonDir));
    float moonVisible = 1.0 - daylight;
    col += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9996, 0.99985, md) * 1.6 + pow(max(md, 0.0), 220.0) * 0.18) * moonVisible;
    // Звёзды: ячейки по направлению, редкие и разной яркости.
    vec3 cell = floor(d * 260.0);
    float s = hash(cell);
    float star = step(0.9965, s) * (0.4 + 0.6 * hash(cell + 7.7));
    col += vec3(star) * stars * smoothstep(0.0, 0.12, h);
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Небо: большая сфера с градиентом, солнцем, луной и звёздами. Цвета задаёт время суток. */
function Sky({ hour }: { hour: number }) {
  const material = useMemo(() => new ShaderMaterial({
    vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT, side: BackSide, depthWrite: false, fog: false,
    uniforms: {
      topColor: { value: new Color() }, horizonColor: { value: new Color() }, groundColor: { value: new Color() },
      sunDir: { value: new Vector3(0, 1, 0) }, sunColor: { value: new Color() }, moonDir: { value: new Vector3(0, -1, 0) },
      stars: { value: 0 }, daylight: { value: 1 },
    },
  }), []);
  useEffect(() => {
    const s = skyAt(hour);
    const u = material.uniforms as Record<string, { value: any }>;
    u.topColor!.value.set(s.sky.top);
    u.horizonColor!.value.set(s.sky.horizon);
    u.groundColor!.value.set(groundColor(s.daylight));
    u.sunDir!.value.set(...s.sunDirection);
    u.sunColor!.value.set(mixColors('#ffffff', s.sun.color, 0.6));
    u.moonDir!.value.set(...s.moonDirection);
    u.stars!.value = s.stars;
    u.daylight!.value = s.daylight;
  }, [hour, material]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh material={material} renderOrder={-10} raycast={NO_RAYCAST} frustumCulled={false} scale={WORLD.skyRadius}>
      <sphereGeometry args={[1, 48, 24]} />
    </mesh>
  );
}

const groundColor = (daylight: number) => mixColors('#0f1612', '#7d9768', daylight);

const HOUSE_COLORS = ['#e8e1d4', '#cfc5b3', '#b9a690', '#d9d4cc', '#c4b2a0', '#9ea3a8'];
const dim = (daylight: number) => mixColors('#222a3c', '#ffffff', 0.15 + 0.85 * daylight);

/** Дома, окна домов и деревья одним набором: четыре вызова отрисовки на весь мир. */
function Buildings({ bounds, daylight }: { bounds: Rect2; daylight: number }) {
  const world = useMemo(() => buildWorld(bounds), [bounds.minX, bounds.maxX, bounds.minZ, bounds.maxZ]); // eslint-disable-line react-hooks/exhaustive-deps
  const bodies = useRef<InstancedMesh>(null);
  const lights = useRef<InstancedMesh>(null);
  const crowns = useRef<InstancedMesh>(null);
  const trunks = useRef<InstancedMesh>(null);

  const windows = useMemo(() => {
    const random = rng(77);
    const list: Matrix4[] = [];
    const object = new Object3D();
    for (const h of world.houses) {
      const rows = Math.max(1, Math.floor(h.height / 3.2)), cols = Math.max(2, Math.floor(h.width / 2.6));
      for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
        if (random() < 0.3) continue;
        object.position.set(h.x, 0, h.z);
        object.rotation.set(0, h.rotY, 0);
        object.translateX(-h.width / 2 + (c + 0.5) * (h.width / cols));
        object.translateY(1.6 + r * 3.2);
        object.translateZ(h.depth / 2 + 0.03);
        object.scale.set(1.0, 1.3, 0.06);
        object.updateMatrix();
        list.push(object.matrix.clone());
      }
    }
    return list;
  }, [world]);

  useLayoutEffect(() => {
    const object = new Object3D();
    const body = bodies.current, glass = lights.current, crown = crowns.current, trunk = trunks.current;
    if (!body || !glass || !crown || !trunk) return;
    world.houses.forEach((h, i) => {
      object.position.set(h.x, h.height / 2 + WORLD.groundY, h.z);
      object.rotation.set(0, h.rotY, 0);
      object.scale.set(h.width, h.height, h.depth);
      object.updateMatrix();
      body.setMatrixAt(i, object.matrix);
      body.setColorAt(i, new Color(HOUSE_COLORS[Math.floor(h.tone * HOUSE_COLORS.length) % HOUSE_COLORS.length]));
    });
    body.instanceMatrix.needsUpdate = true;
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
    windows.forEach((m, i) => glass.setMatrixAt(i, m));
    glass.count = windows.length;
    glass.instanceMatrix.needsUpdate = true;
    world.trees.forEach((t, i) => {
      object.rotation.set(0, 0, 0);
      object.position.set(t.x, t.height * 0.38 + WORLD.groundY + t.height * 0.12, t.z);
      object.scale.set(t.crown, t.height * 0.76, t.crown);
      object.updateMatrix();
      crown.setMatrixAt(i, object.matrix);
      crown.setColorAt(i, new Color().setHSL(0.27 + t.tone * 0.07, 0.38, 0.28 + t.tone * 0.1));
      object.position.set(t.x, t.height * 0.12 + WORLD.groundY, t.z);
      object.scale.set(0.35, t.height * 0.24, 0.35);
      object.updateMatrix();
      trunk.setMatrixAt(i, object.matrix);
    });
    crown.instanceMatrix.needsUpdate = true;
    if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
    trunk.instanceMatrix.needsUpdate = true;
    plannerDebug.world = { houses: world.houses.length, trees: world.trees.length, windows: windows.length };
    return () => { plannerDebug.world = null; };
  }, [world, windows]);

  const tint = dim(daylight);
  const glassColor = mixColors('#ffcf7a', '#4a6a8c', smooth(daylight, 0.15, 0.45));
  return (
    <group>
      <instancedMesh ref={bodies} args={[undefined, undefined, world.houses.length]} raycast={NO_RAYCAST} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color={tint} />
      </instancedMesh>
      <instancedMesh ref={lights} args={[undefined, undefined, Math.max(1, windows.length)]} raycast={NO_RAYCAST} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color={glassColor} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, world.trees.length]} raycast={NO_RAYCAST} frustumCulled={false}>
        <coneGeometry args={[1, 1, 7]} />
        <meshBasicMaterial color={tint} />
      </instancedMesh>
      <instancedMesh ref={trunks} args={[undefined, undefined, world.trees.length]} raycast={NO_RAYCAST} frustumCulled={false}>
        <cylinderGeometry args={[1, 1, 1, 6]} />
        <meshBasicMaterial color={mixColors('#1a1410', '#5a4430', daylight)} />
      </instancedMesh>
    </group>
  );
}

function smooth(value: number, a: number, b: number): number {
  const t = Math.min(1, Math.max(0, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Внешний мир вокруг квартиры: небо, земля, дома и деревья. Время суток берётся из интерфейса. */
export function OuterWorld({ apartment }: { apartment: Apartment }) {
  const hour = useUiStore((state) => state.timeOfDay);
  const bounds = useMemo(() => apartmentBoundsM(apartment), [apartment.rooms, apartment.walls]); // eslint-disable-line react-hooks/exhaustive-deps
  const daylight = skyAt(hour).daylight;
  return (
    <group name="outer-world">
      <Sky hour={hour} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(bounds.minX + bounds.maxX) / 2, WORLD.groundY, (bounds.minZ + bounds.maxZ) / 2]} raycast={NO_RAYCAST}>
        <circleGeometry args={[WORLD.groundRadius, 64]} />
        <meshBasicMaterial color={groundColor(daylight)} side={DoubleSide} />
      </mesh>
      <Buildings bounds={bounds} daylight={daylight} />
    </group>
  );
}
