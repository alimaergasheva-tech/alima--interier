import { findCatalogItem } from '../catalog/techCatalog';
import { addFurniture, setFurniturePose } from '../commands/furniture';
import type { FurnitureInstance, Id } from '../domain/types';
import { normalizeDeg, snapCm, validatePlacement, type PlacementResult, type Pose } from '../geometry/placement';
import { selectApartment, useProjectStore } from '../store/projectStore';
import { useUiStore, type DraftSource } from '../store/uiStore';
import { getSurface, projectPointAt } from './surfaces';

// Цикл переноса (SPEC §11.1), общий для каталога, плана и 3D:
// кандидат → общий валидатор → фиксация одним шагом истории либо отказ.

export const GRID_STEP_CM = 5;
export const ROTATE_STEP_DEG = 15;
const MOVE_THRESHOLD_PX = 3;

interface PointerLike {
  clientX: number;
  clientY: number;
  altKey: boolean;
}

interface ActiveDrag {
  source: DraftSource;
  catalogItemId: Id;
  roomId: Id;
  /** Смещение точки захвата относительно опорной точки предмета. */
  grab: { dxCm: number; dzCm: number };
  rotationDeg: number;
  lastPose: Pose;
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  alt: boolean;
  moved: boolean;
}

let active: ActiveDrag | null = null;

export function isDragging(): boolean {
  return active !== null;
}

const OFF_SURFACE: PlacementResult = {
  valid: false,
  code: 'invalid-data',
  message: 'Перенесите предмет на план или в комнату',
  conflictIds: [],
};

function update(): void {
  if (!active) return;
  const apartment = selectApartment(useProjectStore.getState());
  const item = findCatalogItem(active.catalogItemId);
  if (!apartment || !item) {
    cancelDrag();
    return;
  }

  const point = projectPointAt(active.clientX, active.clientY);
  let pose: Pose = { ...active.lastPose, rotationDeg: active.rotationDeg };
  let result = OFF_SURFACE;
  if (point) {
    let xCm = point.xCm - active.grab.dxCm;
    let zCm = point.zCm - active.grab.dzCm;
    if (!active.alt) {
      xCm = snapCm(xCm, GRID_STEP_CM);
      zCm = snapCm(zCm, GRID_STEP_CM);
    }
    pose = { xCm, zCm, rotationDeg: active.rotationDeg };
    active.lastPose = pose;
    result = validatePlacement(apartment, item, active.roomId, pose);
  }

  useUiStore.getState().setDraft({
    source: active.source,
    catalogItemId: active.catalogItemId,
    roomId: active.roomId,
    pose,
    overSurface: point !== null,
    result,
  });
}

function onPointerMove(event: PointerEvent): void {
  if (!active) return;
  active.clientX = event.clientX;
  active.clientY = event.clientY;
  active.alt = event.altKey;
  if (Math.hypot(event.clientX - active.startX, event.clientY - active.startY) > MOVE_THRESHOLD_PX) {
    active.moved = true;
  }
  update();
}

function onPointerUp(): void {
  finishDrag();
}

function onKeyDown(event: KeyboardEvent): void {
  if (!active) return;
  if (event.code === 'Escape') {
    event.preventDefault();
    cancelDrag();
  } else if (event.code === 'KeyR') {
    event.preventDefault();
    const step = event.shiftKey ? -ROTATE_STEP_DEG : ROTATE_STEP_DEG;
    active.rotationDeg = normalizeDeg(active.rotationDeg + step);
    update();
  }
}

function detach(): void {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', cancelDrag);
  window.removeEventListener('blur', cancelDrag);
  window.removeEventListener('keydown', onKeyDown, true);
}

/** Отменяет кандидат: новый предмет не создаётся, существующий остаётся на месте. */
export function cancelDrag(): void {
  if (!active) return;
  active = null;
  detach();
  useUiStore.getState().setDraft(null);
}

function finishDrag(): void {
  if (!active) return;
  const drag = active;
  const ui = useUiStore.getState();
  const draft = ui.draft;
  active = null;
  detach();
  ui.setDraft(null);

  // Нажатие без движения — это выбор предмета, а не перенос.
  if (!draft || (drag.source.type === 'move' && !drag.moved)) return;

  if (!draft.overSurface) {
    ui.setNotice(
      drag.source.type === 'new'
        ? 'Предмет не добавлен: его нужно отпустить на плане или в комнате'
        : 'Положение не изменено: предмет отпущен вне комнаты',
    );
    return;
  }
  if (!draft.result.valid) {
    ui.setNotice(
      `${draft.result.message}. ${drag.source.type === 'new' ? 'Предмет не добавлен' : 'Положение не изменено'}`,
    );
    return;
  }

  const item = findCatalogItem(drag.catalogItemId);
  if (!item) return;
  const project = useProjectStore.getState();
  let targetId: Id;
  let result;
  if (drag.source.type === 'new') {
    const instance: FurnitureInstance = {
      id: `f-${crypto.randomUUID().slice(0, 8)}`,
      catalogItemId: item.id,
      assetVersion: item.version,
      roomId: drag.roomId,
      xCm: draft.pose.xCm,
      zCm: draft.pose.zCm,
      elevationCm: 0,
      rotationDeg: draft.pose.rotationDeg,
      variantId: null,
    };
    targetId = instance.id;
    result = project.execute(addFurniture(instance, item.name));
  } else {
    targetId = drag.source.furnitureId;
    result = project.execute(setFurniturePose(targetId, draft.pose));
  }

  if (result && !result.ok) {
    ui.setNotice(result.issues[0]?.message ?? 'Изменение отклонено');
    return;
  }
  ui.setNotice(null);
  ui.select({ kind: 'furniture', id: targetId });
}

interface StartOptions {
  roomId: Id;
  catalogItemId: Id;
  /** Исходное положение: для существующего предмета — его текущее. */
  pose: Pose;
  /** Область, в которой начат перенос; нужна для смещения точки захвата. */
  surfaceId?: string;
}

export function startDrag(source: DraftSource, pointer: PointerLike, options: StartOptions): void {
  cancelDrag();
  let grab = { dxCm: 0, dzCm: 0 };
  if (source.type === 'move' && options.surfaceId) {
    const point = getSurface(options.surfaceId)?.toProject(pointer.clientX, pointer.clientY);
    if (point) grab = { dxCm: point.xCm - options.pose.xCm, dzCm: point.zCm - options.pose.zCm };
  }
  active = {
    source,
    catalogItemId: options.catalogItemId,
    roomId: options.roomId,
    grab,
    rotationDeg: options.pose.rotationDeg,
    lastPose: options.pose,
    startX: pointer.clientX,
    startY: pointer.clientY,
    clientX: pointer.clientX,
    clientY: pointer.clientY,
    alt: pointer.altKey,
    moved: false,
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', cancelDrag);
  window.addEventListener('blur', cancelDrag);
  window.addEventListener('keydown', onKeyDown, true);
  useUiStore.getState().setNotice(null);
  update();
}
