import { useState } from 'react';
import type { Change } from '../commands/history';
import {
  hingeEdgeLabel, openingPositionCm, openingTitle, swingTarget, updateOpening, type OpeningPatch,
} from '../commands/openings';
import {
  CEILING_RANGE_CM, previewChange, roomSizeAlongLine, roomsOfWallLine, setCeilingHeight, setupValidator, shiftForRoomSize,
  shiftWall, wallLine,
} from '../commands/setup';
import {
  NET_AREA_LABEL, OUTER_AREA_LABEL, outerContourAreaCm2, roomsOfWall, totalNetAreaCm2,
} from '../domain/rooms';
import type { Apartment, Id } from '../domain/types';
import { parseCm } from '../domain/parse';
import { formatCm, formatM2 } from '../domain/units';
import { PlanView } from '../plan2d/PlanView';
import { useProjectStore } from '../store/projectStore';
import { useUiStore } from '../store/uiStore';

const signed = (cm2: number) => `${cm2 > 0 ? '+' : cm2 < 0 ? '−' : ''}${formatM2(Math.abs(cm2))}`;

interface Props {
  apartment: Apartment;
  roomId: Id;
  title: string;
  onOtherLayouts(): void;
  onOpenInterior(): void;
}

/** Экран настройки общей квартиры: выбор стены, предпросмотр, применение (SPEC §9). */
export function SetupScreen({ apartment, roomId, title, onOtherLayouts, onOpenInterior }: Props) {
  const selection = useUiStore((state) => state.selection);
  const execute = useProjectStore((state) => state.execute);
  const wallId = selection?.kind === 'wall' && apartment.walls.some((wall) => wall.id === selection.id)
    ? selection.id : null;
  const [sizeInput, setSizeInput] = useState({ wallId: '', roomId: '', text: '' });
  const emptyOpening = { id: '', position: '', width: '', height: '', sill: '' };
  const [openText, setOpenText] = useState(emptyOpening);
  const [ceilingText, setCeilingText] = useState('');
  const [message, setMessage] = useState('');

  const opening = selection?.kind === 'opening' ? apartment.openings.find((item) => item.id === selection.id) ?? null : null;
  const texts = opening && openText.id === opening.id ? openText : emptyOpening;
  const patch: OpeningPatch = {};
  const position = parseCm(texts.position), width = parseCm(texts.width), height = parseCm(texts.height), sill = parseCm(texts.sill);
  if (position !== null) patch.positionCm = position;
  if (width !== null) patch.widthCm = width;
  if (height !== null) patch.heightCm = height;
  if (sill !== null && opening?.kind === 'window') patch.sillCm = sill;
  const line = wallId ? wallLine(apartment, wallId) : null;
  const lineRooms = wallId ? roomsOfWallLine(apartment, wallId) : [];
  const chosenRoom = wallId
    ? lineRooms.find((room) => room.id === sizeInput.roomId) ?? lineRooms[0] ?? null : null;
  const sizeText = wallId && sizeInput.wallId === wallId ? sizeInput.text : '';
  const newSize = parseCm(sizeText);
  const ceilingValue = parseCm(ceilingText);
  const dimension = line?.moveAxis === 'x' ? 'Ширина' : 'Длина';

  let change: Change | null = null;
  let changeKind: 'wall' | 'opening' | 'ceiling' | null = null;
  if (wallId && chosenRoom && newSize !== null) {
    change = shiftWall(wallId, shiftForRoomSize(apartment, wallId, chosenRoom.id, newSize));
    changeKind = 'wall';
  } else if (opening && Object.keys(patch).length > 0) {
    change = updateOpening(opening.id, patch);
    changeKind = 'opening';
  } else if (ceilingValue !== null) {
    change = setCeilingHeight(ceilingValue);
    changeKind = 'ceiling';
  }
  const preview = change ? previewChange(apartment, change, setupValidator) : null;
  const valid = !!preview && preview.proposal.issues.length === 0;
  const shown = preview && valid ? preview.proposal.candidate : apartment;
  const noChange = !!preview && valid && preview.proposal.candidate === apartment;

  const apply = () => {
    if (!change || !preview || !valid || noChange) return;
    const result = execute(change, setupValidator);
    if (result?.ok) {
      setSizeInput({ wallId: '', roomId: '', text: '' });
      setCeilingText('');
      setOpenText(emptyOpening);
      setMessage(changeKind === 'ceiling' ? 'Высота потолка изменена.' : changeKind === 'opening' ? 'Проём изменён.' : 'Стена сдвинута.');
    } else if (result) setMessage(result.issues[0]!.message);
  };
  const applyNow = (next: OpeningPatch) => {
    if (!opening) return;
    const result = execute(updateOpening(opening.id, next), setupValidator);
    if (result?.ok) setMessage('Проём изменён.');
    else if (result) setMessage(result.issues[0]!.message);
  };
  const setField = (field: 'position' | 'width' | 'height' | 'sill') => (event: React.ChangeEvent<HTMLInputElement>) => {
    setMessage('');
    setOpenText({ ...texts, id: opening!.id, [field]: event.target.value });
  };
  const onEnter = (event: React.KeyboardEvent) => { if (event.key === 'Enter') { event.preventDefault(); apply(); } };

  const netBefore = totalNetAreaCm2(apartment);
  const outerBefore = outerContourAreaCm2(apartment);

  return <main className="setup-screen">
    <div className="setup-header"><div><p className="start-progress">Настройка квартиры <span>3 / 3</span></p>
      <h1>{title}</h1>
      <p>{NET_AREA_LABEL}: {formatM2(netBefore)} · {OUTER_AREA_LABEL}: {formatM2(outerBefore)}</p>
    </div><div className="setup-actions"><button type="button" className="button" onClick={onOtherLayouts}>Другие схемы</button>
      <button type="button" className="primary-button" onClick={onOpenInterior}>Открыть интерьер</button></div></div>
    <div className="setup-body">
      <div className="setup-plan"><PlanView key={apartment.id} apartment={shown} roomId={roomId} defaultScope="apartment"
        selectableWalls highlightRoomIds={valid && changeKind === 'wall' ? preview!.rooms.map((room) => room.roomId) : []} /></div>
      <aside className="setup-panel" aria-label="Настройка размеров">
        {opening ? <section data-testid="opening-panel">
          <h2>{openingTitle(apartment, opening)}</h2>
          <div className="setup-grid">
            <label htmlFor="op-pos">От угла комнаты, см</label>
            <input id="op-pos" type="text" inputMode="decimal" value={texts.position} onChange={setField('position')} onKeyDown={onEnter}
              placeholder={String(Math.round(openingPositionCm(apartment, opening)))} />
            <label htmlFor="op-width">Ширина, см</label>
            <input id="op-width" type="text" inputMode="decimal" value={texts.width} onChange={setField('width')} onKeyDown={onEnter}
              placeholder={String(Math.round(opening.widthCm))} />
            <label htmlFor="op-height">Высота, см</label>
            <input id="op-height" type="text" inputMode="decimal" value={texts.height} onChange={setField('height')} onKeyDown={onEnter}
              placeholder={String(Math.round(opening.heightCm))} />
            {opening.kind === 'window' && <><label htmlFor="op-sill">Подоконник, см</label>
              <input id="op-sill" type="text" inputMode="decimal" value={texts.sill} onChange={setField('sill')} onKeyDown={onEnter}
                placeholder={String(Math.round(opening.sillCm))} /></>}
          </div>
          {opening.kind === 'door' && <>
            <p>Створка открывается</p>
            <div className="setup-toggle" role="group" aria-label="Направление открывания">{(['left', 'right'] as const).map((swing) => {
              const target = swingTarget(apartment, opening, swing);
              return <button key={swing} type="button" className={`button${opening.swing === swing ? ' is-active' : ''}`}
                aria-pressed={opening.swing === swing} onClick={() => applyNow({ swing })}>{target ? `в «${target.name}»` : 'наружу'}</button>;
            })}</div>
            <p>Петли</p>
            <div className="setup-toggle" role="group" aria-label="Сторона петель">{(['start', 'end'] as const).map((hinge) =>
              <button key={hinge} type="button" className={`button${opening.hinge === hinge ? ' is-active' : ''}`}
                aria-pressed={opening.hinge === hinge} onClick={() => applyNow({ hinge })}>{hingeEdgeLabel(apartment, opening, hinge)}</button>)}</div>
          </>}
          <p>Проём двигается вдоль своей стены. Перенос на другую стену в первой версии не поддерживается.</p>
        </section> : <section>
          <h2>Стена</h2>
          {!wallId || !line || !chosenRoom ? <p data-testid="wall-hint">Выберите стену, окно или дверь на плане. Сдвигается вся прямая стена; противоположная стена остаётся на месте.</p> : <>
            <p data-testid="wall-info">{line.wallIds.some((id) => roomsOfWall(apartment, id).length > 1)
              ? 'Общая стена' : 'Внешняя стена'} · стен в прямой: {line.wallIds.length}</p>
            <div className="setup-rooms" role="group" aria-label="Какую комнату менять">
              {lineRooms.map((room) => <button key={room.id} type="button"
                className={`button${room.id === chosenRoom.id ? ' is-active' : ''}`} aria-pressed={room.id === chosenRoom.id}
                onClick={() => setSizeInput({ wallId, roomId: room.id, text: '' })}>{room.name}</button>)}
            </div>
            <label className="setup-field">{dimension} комнаты «{chosenRoom.name}»
              <input type="text" inputMode="decimal" aria-label={`${dimension} комнаты, см`} value={sizeText}
                placeholder={String(Math.round(roomSizeAlongLine(apartment, wallId, chosenRoom.id)))}
                onChange={(event) => { setMessage(''); setSizeInput({ wallId, roomId: chosenRoom.id, text: event.target.value }); }}
                onKeyDown={onEnter} /> см</label>
          </>}
        </section>}
        <section>
          <h2>Потолок</h2>
          <label className="setup-field">Высота потолка
            <input type="text" inputMode="decimal" aria-label="Высота потолка, см" value={ceilingText}
              placeholder={String(Math.round(apartment.ceilingHeightCm))}
              onChange={(event) => { setMessage(''); setCeilingText(event.target.value); }} onKeyDown={onEnter} /> см</label>
          <p>Допустимо {CEILING_RANGE_CM.min}–{CEILING_RANGE_CM.max} см. Одна высота на всю квартиру.</p>
        </section>
        <section aria-live="polite" data-testid="setup-preview">
          <h2>Предпросмотр</h2>
          {!preview && <p>Введите новое значение, чтобы увидеть последствия.</p>}
          {preview && !valid && <ul className="setup-diff">{preview.proposal.issues.map((issue, index) =>
            <li key={index} className="setup-issue" data-testid="setup-issue">{issue.message}</li>)}</ul>}
          {noChange && <p>Значение не меняется.</p>}
          {preview && valid && !noChange && <>
            {changeKind === 'wall' && <ul className="setup-diff">{preview.rooms.map((room) => <li key={room.roomId}>
              «{room.name}»: {formatCm(room.before.widthCm)} × {formatCm(room.before.depthCm)} → {formatCm(room.after.widthCm)} × {formatCm(room.after.depthCm)}
            </li>)}</ul>}
            {changeKind === 'opening' && opening && <ul className="setup-diff">{openingDiff(apartment, shown, opening.id).map((line) => <li key={line}>{line}</li>)}</ul>}
            {changeKind === 'ceiling' && <p>Потолок: {formatCm(apartment.ceilingHeightCm)} → {formatCm(preview.proposal.candidate.ceilingHeightCm)}</p>}
            {changeKind === 'wall' && <>
            <p>{NET_AREA_LABEL}: {formatM2(totalNetAreaCm2(shown))} ({signed(totalNetAreaCm2(shown) - netBefore)})</p>
            <p>{OUTER_AREA_LABEL}: {formatM2(outerContourAreaCm2(shown))} ({signed(outerContourAreaCm2(shown) - outerBefore)})</p>
            <p>Мебель не масштабируется; проёмы на примыкающих стенах остаются на месте плана.</p>
            </>}
          </>}
          <div className="setup-buttons">
            <button type="button" className="primary-button" disabled={!preview || !valid || noChange} onClick={apply}>Применить</button>
            <button type="button" className="button" disabled={!preview}
              onClick={() => { setSizeInput({ wallId: '', roomId: '', text: '' }); setCeilingText(''); setOpenText(emptyOpening); }}>Сбросить</button>
          </div>
          {message && <p className={['Стена сдвинута.', 'Высота потолка изменена.', 'Проём изменён.'].includes(message) ? 'setup-ok' : 'setup-issue'} role="status">{message}</p>}
        </section>
      </aside>
    </div>
    <p className="setup-note">План построен по фактическим размерам схемы. Размеры, указанные в сантиметрах, — расстояния между внутренними поверхностями стен.</p>
  </main>;
}

function openingDiff(before: Apartment, after: Apartment, id: Id): string[] {
  const a = before.openings.find((item) => item.id === id)!;
  const b = after.openings.find((item) => item.id === id)!;
  const lines: string[] = [];
  const pa = openingPositionCm(before, a), pb = openingPositionCm(after, b);
  if (pa !== pb) lines.push(`От угла: ${formatCm(pa)} → ${formatCm(pb)}`);
  if (a.widthCm !== b.widthCm) lines.push(`Ширина: ${formatCm(a.widthCm)} → ${formatCm(b.widthCm)}`);
  if (a.heightCm !== b.heightCm) lines.push(`Высота: ${formatCm(a.heightCm)} → ${formatCm(b.heightCm)}`);
  if (a.kind === 'window' && b.kind === 'window' && a.sillCm !== b.sillCm) lines.push(`Подоконник: ${formatCm(a.sillCm)} → ${formatCm(b.sillCm)}`);
  return lines;
}
