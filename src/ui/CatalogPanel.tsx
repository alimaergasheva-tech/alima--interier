import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { techCatalog } from '../catalog/techCatalog';
import type { CatalogItem, Id, RoomType } from '../domain/types';
import { startDrag } from '../interaction/drag';
import { selectApartment, useProjectStore } from '../store/projectStore';

const MOUNT_LABEL: Record<CatalogItem['mount'], string> = {
  floor: '', wall: 'на стену', ceiling: 'на потолок', tabletop: 'на стол',
};

const ROOM_TYPE_LABEL: Record<RoomType, string> = {
  living: 'Гостиная', 'kitchen-living': 'Кухня-гостиная', bedroom: 'Спальня', kitchen: 'Кухня', bathroom: 'Ванная',
  toilet: 'Туалет', 'combined-bathroom': 'Санузел', hallway: 'Прихожая', wardrobe: 'Гардеробная', balcony: 'Балкон',
};

/** Превью предмета; пока файла нет, место остаётся пустым и карточка работает как раньше. */
function CatalogPreview({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return <img className="catalog-preview" src={src} alt="" width={64} height={64} loading="lazy" draggable={false} onError={() => setFailed(true)} />;
}

/** Каталог: предмет переносится мышью на план или в 3D-комнату. Список фильтруется по типу активной комнаты. */
export function CatalogPanel({ roomId }: { roomId: Id }) {
  const roomType = useProjectStore(selectApartment)?.rooms.find((room) => room.id === roomId)?.type;
  const [showAll, setShowAll] = useState(false);
  const [category, setCategory] = useState('');

  const begin = (item: CatalogItem) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    startDrag({ type: 'new', catalogItemId: item.id }, event, {
      roomId,
      catalogItemId: item.id,
      pose: { xCm: 0, zCm: 0, rotationDeg: 0 },
    });
  };

  const forRoom = techCatalog.filter((item) => showAll || !roomType || item.roomTypes.includes(roomType));
  const categories = [...new Set(forRoom.map((item) => item.category))];
  const visible = forRoom.filter((item) => !category || item.category === category);
  const groups = [...new Set(visible.map((item) => item.category))];

  return (
    <aside className="panel" aria-label="Каталог мебели">
      <h2 className="panel-title">Каталог</h2>
      <p className="panel-note">
        {showAll ? 'Все предметы' : `Для комнаты «${roomType ? ROOM_TYPE_LABEL[roomType] : '—'}»`}: {visible.length} из {techCatalog.length}.
        Перетащите предмет на план или в комнату.
      </p>
      <div className="catalog-filters">
        <label className="catalog-filter">Раздел
          <select value={category} aria-label="Раздел каталога" onChange={(event) => setCategory(event.target.value)}>
            <option value="">Все разделы</option>
            {categories.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="catalog-filter catalog-check">
          <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
          Показать для всех комнат
        </label>
      </div>
      {visible.length === 0 && <p className="panel-note" data-testid="catalog-empty">Для этой комнаты в каталоге ничего нет.</p>}
      {groups.map((group) => (
        <section key={group} aria-label={group}>
          <h3 className="catalog-group">{group}</h3>
          <ul className="catalog-list">
            {visible.filter((item) => item.category === group).map((item) => (
              <li key={item.id}>
                <button type="button" className="catalog-card" data-catalog-id={item.id} onPointerDown={begin(item)}>
                  <CatalogPreview src={item.previewUrl} />
                  <span className="catalog-name">{item.name}</span>
                  <span className="catalog-size">
                    {item.sizeCm.width} × {item.sizeCm.depth} × {item.sizeCm.height} см
                    {MOUNT_LABEL[item.mount] && ` · ${MOUNT_LABEL[item.mount]}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}
