import { findCatalogItem } from './catalog/techCatalog';
import { canRedo, canUndo } from './commands/history';
import { PlanView } from './plan2d/PlanView';
import { RoomScene } from './scene3d/RoomScene';
import { selectApartment, useProjectStore } from './store/projectStore';
import { useUiStore } from './store/uiStore';
import { CatalogPanel } from './ui/CatalogPanel';
import { useEditorHotkeys } from './ui/useEditorHotkeys';
import { useHistoryHotkeys } from './ui/useHistoryHotkeys';

/** Строка состояния: допустимость кандидата и причина отказа текстом (не только цветом). */
function StatusLine() {
  const draft = useUiStore((state) => state.draft);
  const notice = useUiStore((state) => state.notice);
  const selection = useUiStore((state) => state.selection);
  const apartment = useProjectStore(selectApartment);

  let text = 'Перетащите предмет из каталога. Вид вращается мышью, колесо приближает.';
  let tone: 'neutral' | 'error' | 'ok' = 'neutral';
  if (draft) {
    const item = findCatalogItem(draft.catalogItemId);
    if (!draft.overSurface) {
      text = draft.result.message;
    } else if (draft.result.valid) {
      text = `${item?.name}: ${item?.sizeCm.width} × ${item?.sizeCm.depth} см — можно поставить. R — поворот, Esc — отмена`;
      tone = 'ok';
    } else {
      text = draft.result.message;
      tone = 'error';
    }
  } else if (notice) {
    text = notice;
    tone = 'error';
  } else if (selection?.kind === 'furniture') {
    const instance = apartment?.furniture.find((item) => item.id === selection.id);
    const item = instance && findCatalogItem(instance.catalogItemId);
    if (instance && item) {
      text = `${item.name}: X ${Math.round(instance.xCm)} см, Z ${Math.round(instance.zCm)} см, угол ${Math.round(instance.rotationDeg)}°. R и Shift+R — поворот, Delete — удалить`;
    }
  }
  return (
    <p className={`status status-${tone}`} role="status" data-testid="status">
      {text}
    </p>
  );
}

export function App() {
  useHistoryHotkeys();
  useEditorHotkeys();
  const apartment = useProjectStore(selectApartment);
  const history = useProjectStore((state) => state.history);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const roomId = useUiStore((state) => state.activeRoomId);

  return (
    <div className="app-shell">
      <header className="app-bar">
        <h1 className="app-title">Планировщик интерьера</h1>
        <span className="app-stage">Техническая сцена</span>
        <div className="app-bar-actions">
          <button type="button" className="button" onClick={undo} disabled={!history || !canUndo(history)}>
            Отменить
          </button>
          <button type="button" className="button" onClick={redo} disabled={!history || !canRedo(history)}>
            Повторить
          </button>
        </div>
      </header>
      {apartment && roomId ? (
        <main className="workspace">
          <CatalogPanel roomId={roomId} />
          <section className="view view-scene" aria-label="3D-вид комнаты">
            <RoomScene apartment={apartment} roomId={roomId} />
          </section>
          <section className="view view-plan" aria-label="План комнаты">
            <PlanView apartment={apartment} roomId={roomId} />
          </section>
          <StatusLine />
        </main>
      ) : (
        <main className="workspace-empty">Квартира не загружена</main>
      )}
    </div>
  );
}
