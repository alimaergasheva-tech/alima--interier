import { TimeOfDayControl } from './ui/TimeOfDayControl';
import { RoomLightSwitch } from './ui/RoomLightSwitch';
import { WalkToggle } from './ui/WalkToggle';
import { SnapshotControl } from './ui/SnapshotControl';
import { AREA_RANGE_M2, parseAreaM2 } from './domain/parse';
import { useState } from 'react';
import { findCatalogItem } from './catalog/techCatalog';
import { canRedo, canUndo } from './commands/history';
import { PlanView } from './plan2d/PlanView';
import { LayoutPreview } from './layouts/LayoutPreview';
import { layoutTemplates, rankTemplates, templateAreaCm2 } from './layouts/templates';
import { formatM2 } from './domain/units';
import { RoomScene } from './scene3d/RoomScene';
import { selectApartment, useProjectStore } from './store/projectStore';
import { useUiStore } from './store/uiStore';
import { SetupScreen } from './ui/SetupScreen';
import { CatalogPanel } from './ui/CatalogPanel';
import { ModelErrors } from './ui/ModelErrors';
import { FinishPanel } from './ui/FinishPanel';
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
  const loadApartment = useProjectStore((state) => state.loadApartment);
  const history = useProjectStore((state) => state.history);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const storedRoomId = useUiStore((state) => state.activeRoomId);
  // Между заменой квартиры и сменой комнаты активная комната может ещё не существовать.
  const roomId = storedRoomId && apartment?.rooms.some((room) => room.id === storedRoomId) ? storedRoomId : null;
  const stage = useUiStore((state) => state.stage);
  const setStage = useUiStore((state) => state.setStage);
  const setActiveRoom = useUiStore((state) => state.setActiveRoom);
  const select = useUiStore((state) => state.select);
  const selectionKind = useUiStore((state) => state.selection?.kind);
  const [sideTab, setSideTab] = useState<'furniture' | 'finish'>('furniture');
  // Выбор стены открывает отделку, выбор предмета — каталог.
  const shownTab = selectionKind === 'wall-surface' ? 'finish' : selectionKind === 'furniture' ? 'furniture' : sideTab;
  const [livingRooms, setLivingRooms] = useState<1 | 2 | 3 | 4>(1);
  const [areaInput, setAreaInput] = useState('');
  const [areaError, setAreaError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const area = parseAreaM2(areaInput);
  const ranked = area !== null ? rankTemplates(livingRooms, area) : [];
  const selected = ranked.find((template) => template.id === selectedId) ?? ranked[0];
  const replacingEditedApartment = loadedId !== null && selected?.id !== loadedId &&
    (history?.past.length ?? 0) > 0;

  if (stage === 'params') return <main className="start-screen">
    <div className="start-inner">
      <p className="start-progress">Параметры квартиры <span>1 / 3</span></p>
      <h1>Начните с вашей квартиры</h1>
      <p className="start-intro">Выберите число жилых комнат и укажите примерную площадь. Затем покажем три подходящие схемы без мебели.</p>
      <div className="start-form">
        <fieldset className="room-choice">
          <legend>Жилые комнаты</legend>
          <div className="room-choice-options">{([1, 2, 3, 4] as const).map((count) => <button key={count}
            type="button" className={`room-choice-button${livingRooms === count ? ' is-active' : ''}`}
            aria-pressed={livingRooms === count} onClick={() => { setLivingRooms(count); setSelectedId(null); }}>
            <strong>{count}</strong><span>{count === 1 ? 'комната' : 'комнаты'}</span>
          </button>)}</div>
        </fieldset>
        <label className="area-label" htmlFor="approx-area">Примерная площадь квартиры</label>
        <div className="area-field"><input id="approx-area" type="text" inputMode="decimal"
          value={areaInput} aria-invalid={!!areaError} aria-describedby={areaError ? 'area-error' : 'area-hint'}
          onChange={(event) => { setAreaInput(event.target.value); setAreaError(''); }} /><span>м²</span></div>
        <p id={areaError ? 'area-error' : 'area-hint'} className={areaError ? 'form-error' : 'form-hint'}>
          {areaError || 'Площадь нужна для подбора. Размеры схемы можно будет уточнить.'}
        </p>
        <button type="button" className="primary-button" onClick={() => {
          if (area === null) {
            setAreaError(`Введите площадь в м² от ${AREA_RANGE_M2.min} до ${AREA_RANGE_M2.max}, например 45 или 45,5.`);
            return;
          }
          setStage('template');
        }}>Показать схемы</button>
      </div>
    </div>
  </main>;

  if (stage === 'template') return <main className="start-screen template-screen">
    <div className="start-inner">
      <p className="start-progress">Выбор схемы <span>2 / 3</span></p>
      <div className="start-heading"><div><h1>Похожие планировки</h1>
        <p className="start-intro">{livingRooms} {livingRooms === 1 ? 'жилая комната' : 'жилые комнаты'}, ориентир {areaInput} м². Схемы приблизительные: площадь и размеры могут отличаться от вашей квартиры.</p>
      </div><button type="button" className="button" onClick={() => setStage('params')}>Изменить параметры</button></div>
      <div className="template-grid">{ranked.map((template, index) => <button type="button" key={template.id}
        className={`template-card${selected?.id === template.id ? ' is-active' : ''}`}
        aria-pressed={selected?.id === template.id} onClick={() => setSelectedId(template.id)}>
        <div className="template-visual"><LayoutPreview apartment={template.apartment} /></div>
        <div className="template-card-main"><h2>{template.title}</h2>
          {index === 0 && <span className="template-match">Ближе по площади</span>}</div>
        <p>{template.composition}</p>
        <strong className="template-area">{formatM2(templateAreaCm2(template))} <small>фактическая площадь помещений</small></strong>
      </button>)}</div>
      <div className="wizard-actions"><button type="button" className="button" onClick={() => setStage('params')}>Назад</button>
        <button type="button" className="primary-button" onClick={() => {
          if (!selected) return;
          if (loadedId !== selected.id) {
            loadApartment(structuredClone(selected.apartment));
            setLoadedId(selected.id);
            setActiveRoom(selected.apartment.rooms.find((room) => room.type !== 'hallway')!.id);
          }
          setStage('setup');
        }}>{replacingEditedApartment ? 'Заменить квартиру и перейти к настройке' : 'Перейти к настройке'}</button>
      </div>
      {replacingEditedApartment && <p className="replacement-note">При замене схемы текущие изменения квартиры будут удалены.</p>}
    </div>
  </main>;

  if (stage === 'setup' && apartment && roomId) return <SetupScreen apartment={apartment} roomId={roomId}
    title={layoutTemplates.find((template) => template.id === loadedId)?.title ?? 'Квартира'}
    onOtherLayouts={() => setStage('template')} onOpenInterior={() => setStage('interior')} />;

  return (
    <div className="app-shell">
      <header className="app-bar">
        <h1 className="app-title">Планировщик интерьера</h1>
        <span className="app-stage">{apartment?.id === 'tech-apartment' ? 'Техническая сцена' : 'Интерьер'}</span>
        {apartment && roomId && apartment.rooms.length > 1 && <label className="room-select">Комната
          <select value={roomId} aria-label="Активная комната" onChange={(event) => setActiveRoom(event.target.value)}>
            {apartment.rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
          </select></label>}
        <div className="app-bar-actions">
          {apartment?.id !== 'tech-apartment' && <button type="button" className="button" onClick={() => setStage('setup')}>Настройка квартиры</button>}
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
          <div className="side-column">
            <div className="side-tabs" role="tablist" aria-label="Панель">
              <button type="button" role="tab" className={`button${shownTab === 'furniture' ? ' is-active' : ''}`} aria-selected={shownTab === 'furniture'}
                onClick={() => { setSideTab('furniture'); if (selectionKind === 'wall-surface') select(null); }}>Мебель</button>
              <button type="button" role="tab" className={`button${shownTab === 'finish' ? ' is-active' : ''}`} aria-selected={shownTab === 'finish'}
                onClick={() => { setSideTab('finish'); if (selectionKind === 'furniture') select(null); }}>Отделка</button>
            </div>
            <ModelErrors />
            {shownTab === 'finish' ? <FinishPanel /> : <CatalogPanel roomId={roomId} />}
          </div>
          <section className="view view-scene" aria-label="3D-вид комнаты">
            <RoomScene apartment={apartment} roomId={roomId} />
            <TimeOfDayControl />
            <RoomLightSwitch roomId={roomId} />
            <WalkToggle />
            <SnapshotControl />
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
