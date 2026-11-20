import { roomClearRect, roomOuterRect } from '../domain/rooms';
import type { Apartment } from '../domain/types';
import { openingSpan } from '../geometry/openings';

/** Уменьшенный план схемы из тех же стен, помещений и проёмов, что в редакторе. */
export function LayoutPreview({ apartment }: { apartment: Apartment }) {
  const rects = apartment.rooms.map((room) => roomOuterRect(apartment, room));
  const minX = Math.min(...rects.map((r) => r.minX));
  const minZ = Math.min(...rects.map((r) => r.minZ));
  const maxX = Math.max(...rects.map((r) => r.maxX));
  const maxZ = Math.max(...rects.map((r) => r.maxZ));
  return <svg className="layout-preview" viewBox={`${minX - 35} ${minZ - 35} ${maxX - minX + 70} ${maxZ - minZ + 70}`}
    role="img" aria-label="План помещений схемы">
    {apartment.rooms.map((room) => {
      const outer = roomOuterRect(apartment, room);
      const clear = roomClearRect(apartment, room);
      return <g key={room.id}>
        <rect className="preview-wall" x={outer.minX} y={outer.minZ}
          width={outer.maxX - outer.minX} height={outer.maxZ - outer.minZ} />
        <rect className={`preview-room preview-${room.type}`} x={clear.minX} y={clear.minZ}
          width={clear.maxX - clear.minX} height={clear.maxZ - clear.minZ} />
      </g>;
    })}
    {apartment.openings.map((opening) => {
      const span = openingSpan(apartment, opening);
      const wall = apartment.walls.find((item) => item.id === opening.wallId)!;
      return <rect key={opening.id} className={`preview-opening preview-opening-${opening.kind}${opening.kind === 'window' && opening.glass === 'stained' ? ' is-stained' : ''}`}
        x={span.alongX ? span.min : span.fixed - wall.thicknessCm / 2}
        y={span.alongX ? span.fixed - wall.thicknessCm / 2 : span.min}
        width={span.alongX ? opening.widthCm : wall.thicknessCm}
        height={span.alongX ? wall.thicknessCm : opening.widthCm} />;
    })}
  </svg>;
}
