import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Color, type Material, type Mesh, type Object3D, type Texture } from 'three';
import { GradientEquirectTexture, WebGLPathTracer } from 'three-gpu-pathtracer';
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/worker';

// ЭКСПЕРИМЕНТ задачи 16.3: браузерный path tracing той же сцены и камеры (SPEC D-09).
// Включается адресом `/?pathtrace` и добавляет плавающую панель «Качественный снимок (проба)».
// Это не готовый режим: помощники редактора (контур выбора, ручка поворота, сетка) попадают в кадр,
// небо — простой градиент, снимок не привязан к состоянию проекта. Цель — измерить время и пределы.

declare global {
  interface Window {
    __pathTraceResult?: Record<string, unknown>;
  }
}

export const PATH_TRACE_ENABLED = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('pathtrace');

const SAMPLE_STEPS = [16, 64, 256];

export function PathTraceProbe() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null;
  const setFrameloop = useThree((state) => state.setFrameloop);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const panel = document.createElement('div');
    panel.setAttribute('data-testid', 'pathtrace-panel');
    panel.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:50;background:#fff;border:1px solid #bbb;border-radius:8px;padding:8px 10px;font:13px sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.2);max-width:300px';
    const status = document.createElement('div');
    status.textContent = 'Качественный снимок (проба): выберите число выборок';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:6px;margin-top:6px;flex-wrap:wrap';
    panel.append(status, row);
    document.body.append(panel);

    let tracer: WebGLPathTracer | null = null;
    let raf = 0;
    let running = false;
    let previousEnvironment: Texture | null = null;
    let sky: GradientEquirectTexture | null = null;
    let runId = 0;
    let bvhWorker: GenerateMeshBVHWorker | null = null;
    let hidden: Object3D[] = [];

    const finish = (note: string) => {
      running = false;
      cancelAnimationFrame(raf);
      tracer?.dispose?.();
      tracer = null;
      bvhWorker?.dispose();
      bvhWorker = null;
      for (const object of hidden) object.visible = true;
      hidden = [];
      sky?.dispose();
      sky = null;
      scene.environment = previousEnvironment;
      if (controls) controls.enabled = true;
      setFrameloop('always');
      invalidate();
      status.textContent = note;
    };

    const start = async (maxSamples: number) => {
      if (running) return;
      running = true;
      const id = ++runId;
      status.textContent = 'Подготовка сцены (BVH)…';
      const t0 = performance.now();
      try {
        setFrameloop('never');
        if (controls) controls.enabled = false;
        previousEnvironment = scene.environment;
        sky = new GradientEquirectTexture();
        sky.topColor = new Color('#cfe3f5');
        sky.bottomColor = new Color('#f3efe6');
        sky.update();
        scene.environment = sky;
        // Трассировщик читает material.color: шейдерное небо, линии контура и подобное без цвета в кадр не берём.
        scene.traverse((object) => {
          const material = (object as Mesh).material as Material | Material[] | undefined;
          if (!material || !object.visible) return;
          const list = Array.isArray(material) ? material : [material];
          const lacksColor = list.some((m) => m.type === 'ShaderMaterial' || m.type === 'RawShaderMaterial'
            || m.type === 'LineBasicMaterial' || m.type === 'LineDashedMaterial' || m.type === 'PointsMaterial');
          if (lacksColor || object.name === 'lamp-glow') { object.visible = false; hidden.push(object); }
        });
        tracer = new WebGLPathTracer(gl);
        tracer.bounces = 5;
        tracer.tiles.set(2, 2);
        // Версия 0.0.28 строит BVH только через воркер; без него setSceneAsync выдаёт ошибку (проба 20.11.2026).
        bvhWorker = new GenerateMeshBVHWorker();
        tracer.setBVHWorker(bvhWorker);
        await tracer.setSceneAsync(scene, camera);
        if (!running || id !== runId) return;
        const bvhMs = Math.round(performance.now() - t0);
        const t1 = performance.now();
        const tick = () => {
          if (!running || !tracer) return;
          tracer.renderSample();
          const samples = Math.floor(tracer.samples);
          const seconds = (performance.now() - t1) / 1000;
          status.textContent = `Выборок ${samples} из ${maxSamples}, ${seconds.toFixed(1)} с`;
          if (samples >= maxSamples) {
            const result = {
              maxSamples, samples, bvhMs, renderMs: Math.round(performance.now() - t1),
              canvas: `${gl.domElement.width}×${gl.domElement.height}`, userAgent: navigator.userAgent,
            };
            window.__pathTraceResult = result;
            console.info('[pathtrace]', JSON.stringify(result));
            // Кадр остаётся на экране: останавливаем цикл, но не возвращаем обычную отрисовку.
            running = false;
            status.textContent = `Готово: ${samples} выборок за ${(result.renderMs / 1000).toFixed(1)} с (BVH ${(bvhMs / 1000).toFixed(1)} с). Кнопка «Закрыть» вернёт редактор.`;
            return;
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (error) {
        console.error('[pathtrace] ошибка', error);
        window.__pathTraceResult = { error: String(error), stack: error instanceof Error ? error.stack?.split('\n').slice(0, 6).join(' | ') : undefined, hiddenObjects: hidden.length };
        finish(`Ошибка: ${String(error)}. Редактор восстановлен.`);
      }
    };

    for (const n of SAMPLE_STEPS) {
      const button = document.createElement('button');
      button.textContent = `${n} выборок`;
      button.onclick = () => void start(n);
      row.append(button);
    }
    const cancel = document.createElement('button');
    cancel.textContent = 'Закрыть / отмена';
    cancel.onclick = () => { runId += 1; finish('Остановлено, редактор восстановлен.'); };
    row.append(cancel);

    return () => {
      runId += 1;
      if (running || tracer) finish('');
      panel.remove();
    };
  }, [gl, scene, camera, controls, setFrameloop, invalidate]);

  return null;
}
