import { Canvas, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Suspense, useEffect, useMemo } from 'react';
import { Box3, Vector3 } from 'three';
import { techCatalog } from '../catalog/techCatalog';
import { finishCatalog } from '../catalog/finishes';
import { patternCanvas } from '../scene3d/wallpaperPatterns';

declare global {
  interface Window {
    __previewItems?: { id: string; url: string }[];
    __previewReady?: string;
  }
}

/** Служебная страница `/?preview=<id>`: одна модель на прозрачном фоне для превью каталога (задача 13.5). */
function Model({ id, url }: { id: string; url: string }) {
  const gltf = useGLTF(url, false);
  const { camera, invalidate } = useThree();
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);

  useEffect(() => {
    const box = new Box3().setFromObject(scene);
    const center = box.getCenter(new Vector3());
    scene.position.set(-center.x, -center.y, -center.z);
    const radius = box.getSize(new Vector3()).length() / 2;
    const direction = new Vector3(1, 0.75, 1.25).normalize();
    camera.position.copy(direction.multiplyScalar(radius * 4.2));
    camera.near = radius / 50;
    camera.far = radius * 20;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    invalidate();
    // Два кадра, чтобы текстуры успели появиться.
    requestAnimationFrame(() => requestAnimationFrame(() => { window.__previewReady = id; }));
  }, [scene, camera, invalidate, id]);

  return <primitive object={scene} />;
}

/** `/?preview=wallpapers`: контактный лист всех обоев с рисунком для визуальной проверки. */
function WallpaperSheet() {
  useEffect(() => { document.body.style.background = '#fff'; }, []);
  const items = finishCatalog.filter((finish) => finish.pattern);
  return (
    <div data-testid="wallpaper-sheet" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 200px)', gap: 12, padding: 12, font: '12px sans-serif' }}>
      {items.map((finish) => (
        <figure key={finish.id} style={{ margin: 0 }}>
          <canvas
            width={200}
            height={200}
            ref={(node) => {
              if (!node || !finish.pattern) return;
              const source = patternCanvas(finish.pattern.kind, finish.pattern.colors, 512);
              node.getContext('2d')?.drawImage(source as CanvasImageSource, 0, 0, 200, 200);
            }}
          />
          <figcaption>{finish.name}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function ModelPreview({ id }: { id: string }) {
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    document.body.style.margin = '0';
    window.__previewItems = techCatalog.map((item) => ({ id: item.id, url: item.model.url }));
  }, []);
  const item = techCatalog.find((candidate) => candidate.id === id);
  return (
    <div style={{ width: 512, height: 512, background: 'transparent' }} data-testid="preview-frame">
      {item && (
        <Canvas gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }} camera={{ fov: 30 }} frameloop="demand">
          <ambientLight intensity={1.1} />
          <directionalLight position={[3, 5, 4]} intensity={2.2} />
          <directionalLight position={[-4, 2, -3]} intensity={0.8} />
          <Suspense fallback={null}>
            <Model id={item.id} url={item.model.url} />
          </Suspense>
        </Canvas>
      )}
    </div>
  );
}

export function PreviewPage({ id }: { id: string }) {
  return id === 'wallpapers' ? <WallpaperSheet /> : <ModelPreview id={id} />;
}
