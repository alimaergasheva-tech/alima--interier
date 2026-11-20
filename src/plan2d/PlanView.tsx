import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { findCatalogItem } from '../catalog/techCatalog';
import { getRoom, rectDepth, rectWidth, roomClearRect, roomOuterRect } from '../domain/rooms';
import type { Apartment, CatalogItem, FurnitureInstance, Id } from '../domain/types';
import { formatCm } from '../domain/units';
import type { Pose } from '../geometry/placement';
import { startDrag } from '../interaction/drag';
import { registerSurface } from '../interaction/surfaces';
import { useUiStore } from '../store/uiStore';
import { fitRect, projectToScreen, screenToProject, type ViewTransform } from './viewTransform';

export const PLAN_SURFACE_ID = 'plan';
const PADDING_PX = 56;

interface FootprintProps {
  item: CatalogItem;
  pose: Pose;
  view: ViewTransform;
  className: string;
  furnitureId?: Id;
  valid?: boolean;
  onPointerDown?: (event: ReactPointerEvent<SVGGElement>) => void;
}

/** Контур предмета на плане. Поворот SVG противоположен rotation.y сцены. */
function Footprint({ item, pose, view, className, furnitureId, valid, onPointerDown }: FootprintProps) {
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
    </g>
  );
}

export function PlanView({ apartment, roomId }: { apartment: Apartment; roomId: Id }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const selection = useUiStore((state) => state.selection);
  const draft = useUiStore((state) => state.draft);
  const select = useUiStore((state) => state.select);

  const room = getRoom(apartment, roomId);
  const outer = roomOuterRect(apartment, room);
  const clear = roomClearRect(apartment, room);
  const view = useMemo(
    () => fitRect(outer, size.width, size.height, PADDING_PX),
    [outer.minX, outer.maxX, outer.minZ, outer.maxZ, size.width, size.height],
  );
  const viewRef = useRef(view);
  viewRef.current = view;

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

  const outerTopLeft = projectToScreen(view, outer.minX, outer.minZ);
  const clearTopLeft = projectToScreen(view, clear.minX, clear.minZ);
  const clearW = rectWidth(clear) * view.scale;
  const clearD = rectDepth(clear) * view.scale;

  const startMove = (instance: FurnitureInstance) => (event: ReactPointerEvent<SVGGElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    select({ kind: 'furniture', id: instance.id });
    startDrag({ type: 'move', furnitureId: instance.id }, event, {
      roomId,
      catalogItemId: instance.catalogItemId,
      pose: instance,
      surfaceId: PLAN_SURFACE_ID,
    });
  };

  const movingId = draft?.source.type === 'move' && draft.overSurface ? draft.source.furnitureId : null;
  const draftItem = draft?.overSurface ? findCatalogItem(draft.catalogItemId) : undefined;

  return (
    <svg
      ref={svgRef}
      className="plan"
      data-testid="plan"
      data-scale={view.scale}
      role="img"
      aria-label={`План: ${room.name}`}
      onPointerDown={() => select(null)}
    >
      {size.width > 0 && (
        <>
          <rect
            className="plan-wall"
            x={outerTopLeft.x}
            y={outerTopLeft.y}
            width={rectWidth(outer) * view.scale}
            height={rectDepth(outer) * view.scale}
          />
          <rect
            className="plan-floor"
            data-testid="plan-floor"
            x={clearTopLeft.x}
            y={clearTopLeft.y}
            width={clearW}
            height={clearD}
          />

          <text className="plan-dim" x={clearTopLeft.x + clearW / 2} y={outerTopLeft.y - 12} textAnchor="middle">
            {formatCm(rectWidth(clear))}
          </text>
          <text
            className="plan-dim"
            transform={`translate(${outerTopLeft.x - 12} ${clearTopLeft.y + clearD / 2}) rotate(-90)`}
            textAnchor="middle"
          >
            {formatCm(rectDepth(clear))}
          </text>

          {apartment.furniture
            .filter((instance) => instance.roomId === roomId && instance.id !== movingId)
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
  );
}
