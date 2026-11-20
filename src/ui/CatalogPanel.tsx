import type { PointerEvent as ReactPointerEvent } from 'react';
import { techCatalog } from '../catalog/techCatalog';
import type { CatalogItem, Id } from '../domain/types';
import { startDrag } from '../interaction/drag';

/** Каталог: предмет переносится мышью на план или в 3D-комнату. */
export function CatalogPanel({ roomId }: { roomId: Id }) {
  const begin = (item: CatalogItem) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    startDrag({ type: 'new', catalogItemId: item.id }, event, {
      roomId,
      catalogItemId: item.id,
      pose: { xCm: 0, zCm: 0, rotationDeg: 0 },
    });
  };

  return (
    <aside className="panel" aria-label="Каталог мебели">
      <h2 className="panel-title">Каталог</h2>
      <p className="panel-note">Технический набор для проверки. Перетащите предмет на план или в комнату.</p>
      <ul className="catalog-list">
        {techCatalog.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="catalog-card"
              data-catalog-id={item.id}
              onPointerDown={begin(item)}
            >
              <span className="catalog-name">{item.name}</span>
              <span className="catalog-size">
                {item.sizeCm.width} × {item.sizeCm.depth} × {item.sizeCm.height} см
              </span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
