import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Color, type Material, type Mesh, type Object3D, type Texture } from 'three';
import { GradientEquirectTexture, WebGLPathTracer } from 'three-gpu-pathtracer';
import { GenerateMeshBVHWorker } from 'three-mesh-bvh/worker';
import { useProjectStore } from '../store/projectStore';
import { useUiStore } from '../store/uiStore';
import { LIGHTING, environmentFor } from './lighting';
import { hiddenInSnapshot, snapshotExposure, snapshotStaleReason, type SnapshotBasis } from './snapshot';
import { skyAt } from './timeOfDay';

/**
 * «Качественный снимок» (SPEC D-09, этап 17): path tracing той же сцены и камеры в браузере.
 * Снимок строится из текущего проекта, времени суток и света комнаты; прогресс идёт в выборках и секундах;
 * закрытие и ошибка возвращают редактор как был. Любое изменение проекта, комнаты, времени, света или камеры
 * закрывает снимок: устаревший результат не показывается (задача 17.4). Экспорта файла нет.
 */
export function QualitySnapshot() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as { enabled: boolean } | null;
  const setFrameloop = useThree((state) => state.setFrameloop);
  const invalidate = useThree((state) => state.invalidate);
  const command = useUiStore((state) => state.snapshotCommand);
  // Команды, отданные до монтирования (например, до выхода из прогулки), повторно не исполняются.
  const handled = useRef(useUiStore.getState().snapshotCommand?.id ?? 0);
  const run = useRef<{ close(message: string | null): void; stop(): void } | null>(null);

  const readBasis = (): SnapshotBasis => {
    const ui = useUiStore.getState();
    const q = camera.quaternion;
    return {
      apartment: useProjectStore.getState().history?.present ?? null,
      roomId: ui.activeRoomId ?? '',
      hour: ui.timeOfDay,
      lights: ui.roomLights,
      canvasWidth: gl.domElement.width,
      canvasHeight: gl.domElement.height,
      camera: [camera.position.x, camera.position.y, camera.position.z, q.x, q.y, q.z, q.w],
    };
  };

  const start = (target: number) => {
    if (run.current) return;
    const store = useUiStore.getState();
    const basis = readBasis();
    const sky = skyAt(basis.hour);
    const t0 = performance.now();
    let tracer: WebGLPathTracer | null = null;
    let worker: GenerateMeshBVHWorker | null = null;
    let skyTexture: GradientEquirectTexture | null = null;
    const previousEnvironment: Texture | null = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    const previousExposure = gl.toneMappingExposure;
    const hidden: Object3D[] = [];
    let raf = 0;
    let alive = true;
    let tracing = false;
    let lastUi = 0;

    const release = () => {
      alive = false;
      cancelAnimationFrame(raf);
      unsubscribe();
      tracer?.dispose?.();
      tracer = null;
      worker?.dispose();
      worker = null;
      skyTexture?.dispose();
      skyTexture = null;
      for (const object of hidden) object.visible = true;
      scene.environment = previousEnvironment;
      scene.environmentIntensity = previousIntensity;
      gl.toneMappingExposure = previousExposure;
      if (controls) controls.enabled = true;
      setFrameloop('always');
      invalidate();
      run.current = null;
    };
    const close = (message: string | null) => {
      if (!alive) return;
      release();
      useUiStore.getState().setSnapshot({ phase: 'idle', samples: 0, seconds: 0, message });
    };
    const fail = (error: unknown) => {
      console.error('[snapshot] ошибка', error);
      if (!alive) return;
      release();
      useUiStore.getState().setSnapshot({ phase: 'error', message: `${String(error)}. Редактор восстановлен.` });
    };
    const checkStale = () => {
      const reason = snapshotStaleReason(basis, readBasis());
      if (reason) close(`Снимок закрыт: ${reason}.`);
      return reason !== null;
    };
    // Проект, время суток, свет и комната меняются через хранилища: следим за ними, пока снимок открыт.
    const unsubscribeUi = useUiStore.subscribe(() => { if (alive) checkStale(); });
    const unsubscribeProject = useProjectStore.subscribe(() => { if (alive) checkStale(); });
    const unsubscribe = () => { unsubscribeUi(); unsubscribeProject(); };

    run.current = {
      close,
      // «Остановить»: оставляет накопленный кадр на экране, снимок считается готовым с тем числом выборок, что есть.
      stop: () => {
        if (!alive || !tracing) return;
        tracing = false;
        cancelAnimationFrame(raf);
        const samples = Math.floor(tracer?.samples ?? 0);
        useUiStore.getState().setSnapshot({ phase: 'done', samples, seconds: (performance.now() - t0) / 1000, message: 'Остановлено' });
      },
    };
    store.setSnapshot({ phase: 'preparing', samples: 0, target, seconds: 0, message: null });

    void (async () => {
      try {
        setFrameloop('never');
        if (controls) controls.enabled = false;
        scene.traverse((object) => {
          const material = (object as Mesh).material as Material | Material[] | undefined;
          if (!object.visible) return;
          const types = material ? (Array.isArray(material) ? material : [material]).map((m) => m.type) : [];
          if (hiddenInSnapshot(object.name, types)) { object.visible = false; hidden.push(object); }
        });
        // Небо трассировки — градиент по цветам неба выбранного времени суток; свет солнца, луны и ламп берётся из сцены.
        skyTexture = new GradientEquirectTexture();
        skyTexture.topColor = new Color(sky.sky.top);
        skyTexture.bottomColor = new Color(sky.hemisphere.ground);
        skyTexture.update();
        scene.environment = skyTexture;
        scene.environmentIntensity = environmentFor(sky);
        gl.toneMappingExposure = snapshotExposure(LIGHTING.toneMappingExposure, sky.daylight, basis.lights[basis.roomId] === true);
        tracer = new WebGLPathTracer(gl);
        tracer.bounces = 5;
        tracer.tiles.set(2, 2);
        // Версия 0.0.28 строит BVH только через воркер (проба 16.3).
        worker = new GenerateMeshBVHWorker();
        tracer.setBVHWorker(worker);
        await tracer.setSceneAsync(scene, camera);
        if (!alive) return;
        const t1 = performance.now();
        tracing = true;
        useUiStore.getState().setSnapshot({ phase: 'running' });
        const tick = () => {
          if (!alive || !tracing || !tracer) return;
          if (checkStale()) return;
          tracer.renderSample();
          const samples = Math.floor(tracer.samples);
          const seconds = (performance.now() - t1) / 1000;
          const now = performance.now();
          if (samples >= target) {
            tracing = false;
            useUiStore.getState().setSnapshot({ phase: 'done', samples, seconds, message: null });
            return;
          }
          if (now - lastUi > 250) { lastUi = now; useUiStore.getState().setSnapshot({ samples, seconds }); }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch (error) {
        fail(error);
      }
    })();
  };

  useEffect(() => {
    if (!command || command.id === handled.current) return;
    handled.current = command.id;
    if (command.kind === 'start') start(command.samples ?? 64);
    else if (command.kind === 'stop') run.current?.stop();
    else run.current?.close(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command]);

  // Выход из сцены (смена этапа) освобождает ресурсы.
  useEffect(() => () => { run.current?.close(null); }, []);
  return null;
}
