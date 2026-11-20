import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import { findCatalogItem } from '../catalog/techCatalog';
import { wallSurfaceKey, getRoom, getWall, rectDepth, rectWidth, roomClearRect, roomOuterRect } from '../domain/rooms';
import type { Apartment, CatalogItem, FurnitureInstance, Id } from '../domain/types';
import { formatCm } from '../domain/units';
import type { Pose } from '../geometry/placement';
import { sideWallIds } from '../commands/finishes';
import { openingPositionCm } from '../commands/openings';
import { wallLine } from '../commands/setup';
import { findFinish } from '../catalog/finishes';
import { doorZones, openingSpan, roomWallFace, wallSpan } from '../geometry/openings';
import { startDrag, startRotate } from '../interaction/drag';
import { registerSurface } from '../interaction/surfaces';
import { useUiStore } from '../store/uiStore';
import { fitRect, panBy, projectToScreen, screenToProject, zoomAt, type ViewTransform } from './viewTransform';

export const PLAN_SURFACE_ID = 'plan';
const PADDING_PX = 92; // запас под подписи проёмов справа от вертикальных стен

interface FootprintProps {
  item: CatalogItem;
  pose: Pose;
  view: ViewTransform;
  className: string;
  furnitureId?: Id;
  valid?: boolean;
  onPointerDown?: (event: ReactPointerEvent<SVGGElement>) => void;
  /** Ручка поворота у выбранного предмета. */
  onRotateStart?: (event: ReactPointerEvent<SVGCircleElement>) => void;
}

/** Контур предмета на плане. Поворот SVG противоположен rotation.y сцены. */
function Footprint({ item, pose, view, className, furnitureId, valid, onPointerDown, onRotateStart }: FootprintProps) {
  const center = projectToScreen(view, pose.xCm, pose.zCm);
  const w = item.sizeCm.width * view.scale;
  const d = item.sizeCm.depth * view.scale;
  return (
    <g
      className={className}
      transform={`translate(${center.x} ${center.y}) rotate(${-pose.rotationDeg})`}
      data-furniture-id={furnitureId}
      data-valid={valid}
      onPointerDown={onPointerDown}
    >
      <rect x={-w / 2} y={-d / 2} width={w} height={d} rx={2} />
      {/* Отметка лицевой стороны (локальная ось +Z). */}
      <line className="plan-front" x1={-w / 4} y1={d / 2 - 4} x2={w / 4} y2={d / 2 - 4} />
      {onRotateStart && (
        <>
          <line className="plan-rotate-stem" x1={0} y1={-d / 2} x2={0} y2={-d / 2 - 14} />
          <circle className="plan-rotate-handle" data-testid="rotate-handle" cx={0} cy={-d / 2 - 18} r={6} onPointerDown={onRotateStart} />
        </>
      )}
    </g>
  );
}

export function PlanView({ apartment, roomId, defaultScope = 'room', selectableWalls = false, highlightRoomIds = [] }: {
  apartment: Apartment; roomId: Id; defaultScope?: 'room' | 'apartment';
  /** Режим настройки: стены выбираются щелчком, выбранная прямая подсвечивается. */
  selectableWalls?: boolean;
  /** Комнаты, затронутые предпросмотром изменения. */
  highlightRoomIds?: Id[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scope, setScope] = useState<'room' | 'apartment'>(defaultScope);
  const [manualView, setManualView] = useState<ViewTransform | null>(null);
  const panRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const selection = useUiStore((state) => state.selection);
  const draft = useUiStore((state) => state.draft);
  const select = useUiStore((state) => state.select);
  const setActiveRoom = useUiStore((state) => state.setActiveRoom);

  const room = getRoom(apartment, roomId);
  const visibleRooms = scope === 'room' ? [room] : apartment.rooms;
  /** В интерьере щелчок по другой комнате на плане всей квартиры переводит в неё (SPEC §10.1). */
  const canPickRoom = scope === 'apartment' && !selectableWalls;
  const bounds = useMemo(() => {
    const rects = visibleRooms.map((item) => roomOuterRect(apartment, item));
    return {
      minX: Math.min(...rects.map((r) => r.minX)), maxX: Math.max(...rects.map((r) => r.maxX)),
      minZ: Math.min(...rects.map((r) => r.minZ)), maxZ: Math.max(...rects.map((r) => r.maxZ)),
    };
  }, [apartment, roomId, scope]);
  const fitted = useMemo(() => fitRect(bounds, size.width, size.height, PADDING_PX), [bounds, size.width, size.height]);
  const view = manualView ?? fitted;
  const viewRef = useRef(view);
  viewRef.current = view;
  useEffect(() => { setManualView(null); }, [roomId, scope, apartment.id]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(svg);
    const unregister = registerSurface(PLAN_SURFACE_ID, {
      element: svg,
      toProject: (clientX, clientY) => {
        const rect = svg.getBoundingClientRect();
        return screenToProject(viewRef.current, clientX - rect.left, clientY - rect.top);
      },
      toClient: (xCm, zCm) => {
        const rect = svg.getBoundingClientRect();
        const point = projectToScreen(viewRef.current, xCm, zCm);
        return { x: point.x + rect.left, y: point.y + rect.top };
      },
    });
    return () => {
      observer.disconnect();
      unregister();
    };
  }, []);

  const selectedLineIds = useMemo(() => {
    if (!selectableWalls || selection?.kind !== 'wall') return new Set<Id>();
    try { return new Set(wallLine(apartment, selection.id).wallIds); } catch { return new Set<Id>(); }
  }, [apartment, selection, selectableWalls]);
  const highlighted = new Set(highlightRoomIds);
  const visibleRoomIds = new Set(visibleRooms.map((item) => item.id));
  const visibleWallIds = new Set(visibleRooms.flatMap((item) => item.boundary.map((ref) => ref.wallId)));

  const onWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const current = viewRef.current;
    const nextScale = Math.min(fitted.scale * 4, Math.max(fitted.scale * 0.4,
      current.scale * (event.deltaY < 0 ? 1.2 : 1 / 1.2)));
    setManualView(zoomAt(current, nextScale / current.scale, event.clientX - rect.left, event.clientY - rect.top));
  };
  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button === 1 || (event.button === 0 && event.shiftKey && event.target === event.currentTarget)) {
      event.preventDefault();
      panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      event.currentTarget.setPointerCapture(event.pointerId);
    } else if (event.target === event.currentTarget) select(null);
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    setManualView(panBy(viewRef.current, event.clientX - pan.x, event.clientY - pan.y));
    panRef.current = { pointerId: pan.pointerId, x: event.clientX, y: event.clientY };
  };
  const endPan = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
  };

  const startMove = (instance: FurnitureInstance) => (event: ReactPointerEvent<SVGGElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    select({ kind: 'furniture', id: instance.id });
    startDrag({ type: 'move', furnitureId: instance.id }, event, {
      roomId: instance.roomId,
      catalogItemId: instance.catalogItemId,
      pose: instance,
      surfaceId: PLAN_SURFACE_ID,
    });
  };

  const startRotation = (instance: FurnitureInstance) => (event: ReactPointerEvent<SVGCircleElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    startRotate(instance.id, event, {
      roomId: instance.roomId,
      catalogItemId: instance.catalogItemId,
      pose: instance,
      surfaceId: PLAN_SURFACE_ID,
    });
  };

  const movingId = draft?.source.type === 'move' && draft.overSurface ? draft.source.furnitureId : null;
  const draftItem = draft?.overSurface ? findCatalogItem(draft.catalogItemId) : undefined;

  return (
    <div className="plan-container">
    <div className="plan-controls" aria-label="Управление планом">
      <button type="button" className="button" onClick={() => setScope(scope === 'room' ? 'apartment' : 'room')}>
        {scope === 'room' ? 'Вся квартира' : 'Активная комната'}
      </button>
      <button type="button" className="button" onClick={() => setManualView(null)}>Вписать</button>
    </div>
    <svg
      ref={svgRef}
      className="plan"
      data-testid="plan"
      data-scale={view.scale}
      role="img"
      aria-label={`План: ${scope === 'room' ? room.name : 'вся квартира'}`}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
    >
      {size.width > 0 && (
        <>
          {visibleRooms.map((visibleRoom) => {
            const outer = roomOuterRect(apartment, visibleRoom);
            const clear = roomClearRect(apartment, visibleRoom);
            const o = projectToScreen(view, outer.minX, outer.minZ);
            const c = projectToScreen(view, clear.minX, clear.minZ);
            const w = rectWidth(clear) * view.scale;
            const d = rectDepth(clear) * view.scale;
            return <g key={visibleRoom.id} data-room-id={visibleRoom.id}>
              <rect className="plan-wall" x={o.x} y={o.y} width={rectWidth(outer) * view.scale}
                height={rectDepth(outer) * view.scale} />
              <rect className={`plan-floor${highlighted.has(visibleRoom.id) ? ' is-affected' : ''}${canPickRoom && visibleRoom.id !== roomId ? ' is-pickable' : ''}`}
                onClick={canPickRoom && visibleRoom.id !== roomId ? () => setActiveRoom(visibleRoom.id) : undefined}
                data-testid={visibleRoom.id === roomId ? 'plan-floor' : undefined}
                data-floor-finish={apartment.floorFinishes?.[visibleRoom.id]}
                style={floorFill(apartment.floorFinishes?.[visibleRoom.id])}
                x={c.x} y={c.y} width={w} height={d} />
              {/* Название ниже середины комнаты: подписи проёмов стоят на уровне середины стены. */}
              {scope === 'apartment' && <text className="plan-room-name" x={c.x + w / 2} y={c.y + d / 2 + 26}
                textAnchor="middle">{visibleRoom.name}</text>}
              <text className="plan-dim" x={c.x + w / 2} y={o.y - 12} textAnchor="middle">
                {formatCm(rectWidth(clear))}
              </text>
              <text className="plan-dim" transform={`translate(${o.x - 12} ${c.y + d / 2}) rotate(-90)`}
                textAnchor="middle">{formatCm(rectDepth(clear))}</text>
            </g>;
          })}

          {!selectableWalls && visibleRooms.flatMap((visibleRoom) => visibleRoom.boundary.map((ref) => {
            const wall = getWall(apartment, ref.wallId);
            const face = roomWallFace(apartment, visibleRoom, wall);
            if (!face) return null;
            const span = wallSpan(apartment, wall);
            const from = Math.max(span.min, face.clearMin);
            const to = Math.min(span.max, face.clearMax);
            if (to - from <= 0) return null;
            const depth = Math.max(6 / view.scale, 5);
            const alongX = span.alongX;
            const inner = face.surface + (face.normal.x + face.normal.z) * 0;
            const a = alongX
              ? projectToScreen(view, from, face.normal.z > 0 ? inner : inner - depth)
              : projectToScreen(view, face.normal.x > 0 ? inner : inner - depth, from);
            const material = findFinish(apartment.wallFinishes[wallSurfaceKey(wall.id, visibleRoom.id)] ?? '');
            const isSelected = selection?.kind === 'wall-surface' && selection.roomId === visibleRoom.id
              && sideWallIds(apartment, visibleRoom.id, selection.wallId).includes(wall.id);
            return <rect key={`${wall.id}:${visibleRoom.id}`} data-wall-surface={`${wall.id}:${visibleRoom.id}`}
              data-finish={material?.id}
              className={`plan-surface${isSelected ? ' is-selected' : ''}`}
              style={material ? { fill: material.color } : undefined}
              x={a.x} y={a.y}
              width={alongX ? (to - from) * view.scale : depth * view.scale}
              height={alongX ? depth * view.scale : (to - from) * view.scale}
              onPointerDown={(event) => { if (event.button === 0) { event.stopPropagation(); select({ kind: 'wall-surface', wallId: wall.id, roomId: visibleRoom.id }); } }} />;
          }))}

          {selectableWalls && apartment.walls.filter((wall) => visibleWallIds.has(wall.id)).map((wall) => {
            const span = wallSpan(apartment, wall);
            const half = wall.thicknessCm / 2;
            const a = projectToScreen(view, span.alongX ? span.min - half : span.fixed - half,
              span.alongX ? span.fixed - half : span.min - half);
            const length = (span.max - span.min + wall.thicknessCm) * view.scale;
            const thickness = Math.max(wall.thicknessCm * view.scale, 8);
            const pad = (thickness - wall.thicknessCm * view.scale) / 2;
            return <rect key={wall.id} data-wall-id={wall.id}
              className={`plan-wall-hit${selectedLineIds.has(wall.id) ? ' is-selected' : ''}`}
              x={span.alongX ? a.x : a.x - pad} y={span.alongX ? a.y - pad : a.y}
              width={span.alongX ? length : thickness} height={span.alongX ? thickness : length}
              onPointerDown={(event) => { if (event.button === 0) { event.stopPropagation(); select({ kind: 'wall', id: wall.id }); } }} />;
          })}

          {apartment.openings.filter((opening) => visibleWallIds.has(opening.wallId)).map((opening) => {
            const wall = getWall(apartment, opening.wallId);
            const span = openingSpan(apartment, opening);
            const thickness = wall.thicknessCm * view.scale;
            const p = span.alongX
              ? projectToScreen(view, span.min, span.fixed)
              : projectToScreen(view, span.fixed, span.min);
            return <g key={opening.id} data-opening-id={opening.id}
              onPointerDown={selectableWalls ? (event) => { if (event.button === 0) { event.stopPropagation(); select({ kind: 'opening', id: opening.id }); } } : undefined}>
              <rect className={`plan-opening plan-opening-${opening.kind}${opening.kind === 'window' && opening.glass === 'stained' ? ' is-stained' : ''}${selection?.kind === 'opening' && selection.id === opening.id ? ' is-selected' : ''}${selectableWalls ? ' is-selectable' : ''}`}
                x={p.x - (span.alongX ? 0 : thickness / 2)}
                y={p.y - (span.alongX ? thickness / 2 : 0)}
                width={span.alongX ? opening.widthCm * view.scale : thickness}
                height={span.alongX ? thickness : opening.widthCm * view.scale} />
              <text className="plan-opening-label"
                x={p.x + (span.alongX ? opening.widthCm * view.scale / 2 : thickness / 2 + 5)}
                y={p.y + (span.alongX ? thickness / 2 + 16 : opening.widthCm * view.scale / 2)}
                textAnchor={span.alongX ? 'middle' : 'start'}>
                {formatCm(openingPositionCm(apartment, opening))} · {formatCm(opening.widthCm)}
              </text>
            </g>;
          })}
          {visibleRooms.flatMap((visibleRoom) => doorZones(apartment, visibleRoom)
            .filter((zone) => zone.kind === 'swing').map((zone) => <polyline
              key={`${visibleRoom.id}-${zone.doorId}`} className="plan-door-swing"
              points={zone.polygon.map((point) => {
                const p = projectToScreen(view, point.xCm, point.zCm);
                return `${p.x},${p.y}`;
              }).join(' ')} />))}

          {apartment.furniture
            .filter((instance) => visibleRoomIds.has(instance.roomId) && instance.id !== movingId)
            .map((instance) => {
              const item = findCatalogItem(instance.catalogItemId);
              if (!item) return null;
              const selected = selection?.kind === 'furniture' && selection.id === instance.id;
              return (
                <Footprint
                  key={instance.id}
                  item={item}
                  pose={instance}
                  view={view}
                  furnitureId={instance.id}
                  className={`plan-item${selected ? ' is-selected' : ''}`}
                  onPointerDown={startMove(instance)}
                  onRotateStart={selected ? startRotation(instance) : undefined}
                />
              );
            })}

          {draft && draftItem && (
            <Footprint
              item={draftItem}
              pose={draft.pose}
              view={view}
              valid={draft.result.valid}
              className={`plan-item is-draft${draft.result.valid ? '' : ' is-invalid'}`}
            />
          )}
        </>
      )}
    </svg>
    </div>
  );
}

/** Цвет покрытия пола на плане; без покрытия остаётся цвет темы из CSS. */
function floorFill(materialId: string | undefined): CSSProperties | undefined {
  const material = materialId ? findFinish(materialId) : undefined;
  return material ? { fill: material.color } : undefined;
}
