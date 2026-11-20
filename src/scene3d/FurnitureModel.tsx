import { useGLTF } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { Box3, BoxGeometry, Color, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three';
import { plannerDebug } from '../debug';
import type { CatalogItem } from '../domain/types';
import { cmToScene, modelScaleToScene } from '../domain/units';
import type { Pose } from '../geometry/placement';

interface Props {
  item: CatalogItem;
  pose: Pose;
  elevationCm?: number;
  selected?: boolean;
  /** Временный кандидат: полупрозрачный, красный при недопустимом положении. */
  ghost?: boolean;
  valid?: boolean;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
}

const INVALID_COLOR = new Color('#ff3b30');
const BLACK = new Color('#000000');

interface Prepared {
  object: Object3D;
  /** Сдвиг в единицах файла: центр основания модели переносится в начало координат. */
  offset: [number, number, number];
  materials: MeshStandardMaterial[];
}

/**
 * Копия модели для одного экземпляра. Геометрия и текстуры общие (кеш загрузчика),
 * материалы свои, чтобы подсветка одного предмета не меняла остальные.
 */
function prepare(source: Object3D): Prepared {
  const object = source.clone(true);
  const materials: MeshStandardMaterial[] = [];
  object.traverse((node) => {
    if (node instanceof Mesh) {
      node.castShadow = true;
      node.receiveShadow = true;
      const material = (node.material as MeshStandardMaterial).clone();
      node.material = material;
      materials.push(material);
    }
  });
  const box = new Box3().setFromObject(object);
  const center = box.getCenter(new Vector3());
  return { object, offset: [-center.x, -box.min.y, -center.z], materials };
}

export function FurnitureModel({ item, pose, elevationCm = 0, selected, ghost, valid = true, onPointerDown }: Props) {
  const gltf = useGLTF(item.model.url, false);
  const scale = modelScaleToScene(item.model.unit);
  const prepared = useMemo(() => prepare(gltf.scene), [gltf.scene]);

  // Контроль импорта (задача 4.3): фактический размер модели в сцене, см.
  useEffect(() => {
    const size = new Box3().setFromObject(gltf.scene).getSize(new Vector3());
    const measured = {
      width: size.x * scale * 100,
      depth: size.z * scale * 100,
      height: size.y * scale * 100,
    };
    plannerDebug.measured[item.id] = measured;
    const off = Math.max(
      Math.abs(measured.width - item.sizeCm.width),
      Math.abs(measured.depth - item.sizeCm.depth),
      Math.abs(measured.height - item.sizeCm.height),
    );
    if (off > 1) console.warn(`Модель ${item.id}: габариты расходятся с карточкой на ${off.toFixed(1)} см`);
  }, [gltf.scene, item, scale]);

  useEffect(() => {
    for (const material of prepared.materials) {
      material.transparent = Boolean(ghost);
      material.opacity = ghost ? 0.6 : 1;
      material.depthWrite = !ghost;
      material.emissive.copy(ghost && !valid ? INVALID_COLOR : BLACK);
      material.emissiveIntensity = ghost && !valid ? 0.7 : 1;
      material.needsUpdate = true;
    }
  }, [prepared, ghost, valid]);

  useEffect(() => () => prepared.materials.forEach((material) => material.dispose()), [prepared]);

  const w = cmToScene(item.sizeCm.width);
  const d = cmToScene(item.sizeCm.depth);
  const h = cmToScene(item.sizeCm.height);
  const outline = useMemo(() => new BoxGeometry(w, h, d), [w, h, d]);
  useEffect(() => () => outline.dispose(), [outline]);

  return (
    <group
      position={[cmToScene(pose.xCm), cmToScene(elevationCm), cmToScene(pose.zCm)]}
      rotation-y={(pose.rotationDeg * Math.PI) / 180}
    >
      <group scale={scale} onPointerDown={onPointerDown}>
        <primitive object={prepared.object} position={prepared.offset} />
      </group>
      {(selected || ghost) && (
        <lineSegments position={[0, h / 2, 0]} raycast={() => null}>
          <edgesGeometry args={[outline]} />
          <lineBasicMaterial color={ghost && !valid ? '#ff7b72' : '#7fb4ff'} />
        </lineSegments>
      )}
      {ghost && (
        <mesh position={[0, 0.004, 0]} rotation-x={-Math.PI / 2} raycast={() => null}>
          <planeGeometry args={[w, d]} />
          <meshBasicMaterial color={valid ? '#7fb4ff' : '#ff3b30'} transparent opacity={0.35} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}
