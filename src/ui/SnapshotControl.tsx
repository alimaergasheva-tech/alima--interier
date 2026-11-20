import { useState } from 'react';
import { DEFAULT_SNAPSHOT_SAMPLES, SNAPSHOT_QUALITY, snapshotProgress } from '../scene3d/snapshot';
import { useUiStore } from '../store/uiStore';

/**
 * Панель «Качественного снимка» поверх 3D-вида (SPEC D-09): выбор качества, запуск, прогресс в выборках и секундах,
 * остановка и закрытие. Состояние только в интерфейсе: проект и история не меняются.
 */
export function SnapshotControl() {
  const snapshot = useUiStore((state) => state.snapshot);
  const walk = useUiStore((state) => state.walk);
  const send = useUiStore((state) => state.sendSnapshotCommand);
  const setSnapshot = useUiStore((state) => state.setSnapshot);
  const [samples, setSamples] = useState(DEFAULT_SNAPSHOT_SAMPLES);
  const busy = snapshot.phase === 'preparing' || snapshot.phase === 'running';
  const open = snapshot.phase !== 'idle';

  return (
    <div className="snapshot-control" data-testid="snapshot-panel" data-phase={snapshot.phase}>
      {!open && (
        <div className="snapshot-start">
          <label className="snapshot-quality">Качество
            <select aria-label="Качество снимка" value={samples} onChange={(event) => setSamples(Number(event.target.value))}>
              {SNAPSHOT_QUALITY.map((q) => <option key={q.id} value={q.samples}>{q.label} · {q.samples}</option>)}
            </select>
          </label>
          <button type="button" className="button" disabled={walk} onClick={() => send('start', samples)}>Качественный снимок</button>
        </div>
      )}
      {open && (
        <div className="snapshot-run" role="status">
          {snapshot.phase === 'preparing' && <p>Подготовка сцены…</p>}
          {snapshot.phase === 'running' && (
            <>
              <p data-testid="snapshot-progress">Выборок {snapshot.samples} из {snapshot.target} · {snapshot.seconds.toFixed(1)} с</p>
              <progress max={1} value={snapshotProgress(snapshot)} aria-label="Ход снимка" />
            </>
          )}
          {snapshot.phase === 'done' && (
            <p data-testid="snapshot-done">
              Готово: {snapshot.samples} выборок за {snapshot.seconds.toFixed(1)} с{snapshot.message ? ` (${snapshot.message.toLowerCase()})` : ''}.
              Любое изменение проекта, времени суток, света или камеры закроет снимок.
            </p>
          )}
          {snapshot.phase === 'error' && <p className="snapshot-error" data-testid="snapshot-error">{snapshot.message}</p>}
          <div className="snapshot-buttons">
            {busy && snapshot.phase === 'running' && <button type="button" className="button" onClick={() => send('stop')}>Остановить</button>}
            <button type="button" className="button" onClick={() => { if (snapshot.phase === 'error') setSnapshot({ phase: 'idle', message: null }); else send('close'); }}>
              {busy ? 'Отмена' : 'Закрыть'}
            </button>
          </div>
        </div>
      )}
      {!open && snapshot.message && <p className="snapshot-note" data-testid="snapshot-note">{snapshot.message}</p>}
    </div>
  );
}
