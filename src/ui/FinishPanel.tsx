import { useMemo, useState } from 'react';
import { finishCatalog, findFinish } from '../catalog/finishes';
import { setRoomFloor, setSideFinish, sideFinishId, sideWallIds, wallSideOfRoom } from '../commands/finishes';
import { getRoom } from '../domain/rooms';
import type { MaterialDefinition } from '../domain/types';
import { patternCanvas } from '../scene3d/wallpaperPatterns';
import { selectApartment, useProjectStore } from '../store/projectStore';
import { useUiStore } from '../store/uiStore';

const SIDE_LABEL = { minX: 'западная', maxX: 'восточная', minZ: 'северная', maxZ: 'южная' } as const;

const previewCache = new Map<string, string>();

/** Миниатюра образца: цвет краски, рисунок процедурных обоев или файл текстуры. */
function swatchStyle(material: MaterialDefinition): React.CSSProperties {
  if (material.pattern) {
    let url = previewCache.get(material.id);
    if (!url) {
      url = patternCanvas(material.pattern.kind, material.pattern.colors, 96).toDataURL();
      previewCache.set(material.id, url);
    }
    return { backgroundImage: `url(${url})`, backgroundSize: '48px 48px' };
  }
  if (material.textureUrl) return { backgroundImage: `url(${material.textureUrl})`, backgroundSize: '48px 48px' };
  return { background: material.color };
}

/** Панель отделки: выбранная сторона стены получает краску или обои (SPEC §13). */
export function FinishPanel() {
  const apartment = useProjectStore(selectApartment);
  const execute = useProjectStore((state) => state.execute);
  const selection = useUiStore((state) => state.selection);
  const setNotice = useUiStore((state) => state.setNotice);
  const activeRoomId = useUiStore((state) => state.activeRoomId);
  const [kind, setKind] = useState<'paint' | 'wallpaper' | 'floor'>('wallpaper');
  const surface = selection?.kind === 'wall-surface' ? selection : null;

  const groups = useMemo(() => {
    const map = new Map<string, MaterialDefinition[]>();
    for (const material of finishCatalog.filter((item) => item.kind === kind)) {
      const key = material.group ?? 'Прочее';
      map.set(key, [...(map.get(key) ?? []), material]);
    }
    return [...map.entries()];
  }, [kind]);

  if (!apartment) return null;
  const valid = surface && apartment.rooms.some((room) => room.id === surface.roomId)
    && apartment.walls.some((wall) => wall.id === surface.wallId);
  const side = valid ? wallSideOfRoom(apartment, surface.roomId, surface.wallId) : null;
  const currentId = valid ? sideFinishId(apartment, surface.roomId, surface.wallId) : null;
  const current = currentId ? findFinish(currentId) : undefined;

  const floorId = kind === 'floor' && activeRoomId ? apartment.floorFinishes?.[activeRoomId] ?? null : null;
  const applyFloor = (materialId: string | null) => {
    if (!activeRoomId) return;
    const result = execute(setRoomFloor(activeRoomId, materialId));
    if (result && !result.ok) setNotice(result.issues[0]?.message ?? 'Покрытие не применено');
    else setNotice(null);
  };

  const apply = (materialId: string | null) => {
    if (kind === 'floor') { applyFloor(materialId); return; }
    if (!valid) return;
    const result = execute(setSideFinish(surface.roomId, surface.wallId, materialId));
    if (result && !result.ok) setNotice(result.issues[0]?.message ?? 'Отделка не применена');
    else setNotice(null);
  };

  return (
    <aside className="panel" aria-label="Отделка стен">
      <h2 className="panel-title">Отделка стен</h2>
      {kind === 'floor' ? (
        <p className="panel-note" data-testid="floor-current-note">
          Пол комнаты «{activeRoomId ? getRoom(apartment, activeRoomId).name : ''}»
          <br />Сейчас: <strong data-testid="floor-current">{floorId ? findFinish(floorId)?.name ?? '—' : 'по умолчанию'}</strong>
        </p>
      ) : !valid ? (
        <p className="panel-note" data-testid="finish-hint">
          Щёлкните по стене в 3D или на плане, чтобы выбрать сторону. Выбирается одна сторона одной комнаты:
          вторая сторона общей перегородки не меняется.
        </p>
      ) : (
        <p className="panel-note" data-testid="finish-surface">
          Стена комнаты «{getRoom(apartment, surface.roomId).name}»{side ? `, ${SIDE_LABEL[side]} сторона` : ''}
          {' · '}участков: {sideWallIds(apartment, surface.roomId, surface.wallId).length}
          <br />Сейчас: <strong data-testid="finish-current">{current?.name ?? 'без отделки'}</strong>
        </p>
      )}
      <div className="finish-kind" role="group" aria-label="Тип отделки">
        <button type="button" className={`button${kind === 'paint' ? ' is-active' : ''}`} aria-pressed={kind === 'paint'}
          onClick={() => setKind('paint')}>Краска</button>
        <button type="button" className={`button${kind === 'wallpaper' ? ' is-active' : ''}`} aria-pressed={kind === 'wallpaper'}
          onClick={() => setKind('wallpaper')}>Обои</button>
        <button type="button" className={`button${kind === 'floor' ? ' is-active' : ''}`} aria-pressed={kind === 'floor'}
          onClick={() => setKind('floor')}>Пол</button>
        <button type="button" className="button" disabled={kind === 'floor' ? !floorId : !valid || !current} onClick={() => apply(null)}>Снять</button>
      </div>
      {groups.map(([group, items]) => (
        <section key={group} aria-label={group}>
          <h3 className="catalog-group">{group}</h3>
          <ul className="swatch-grid">
            {items.map((material) => (
              <li key={material.id}>
                <button type="button" className={`swatch${(kind === 'floor' ? floorId : currentId) === material.id ? ' is-active' : ''}`}
                  data-finish-id={material.id} disabled={kind === 'floor' ? !activeRoomId : !valid}
                  aria-pressed={(kind === 'floor' ? floorId : currentId) === material.id}
                  title={material.tileSizeCm ? `${material.name} · рисунок ${material.tileSizeCm.width} × ${material.tileSizeCm.height} см` : material.name}
                  onClick={() => apply(material.id)}>
                  <span className="swatch-sample" style={swatchStyle(material)} />
                  <span className="swatch-name">{material.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}
