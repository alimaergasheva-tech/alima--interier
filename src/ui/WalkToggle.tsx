import { useUiStore } from '../store/uiStore';

/** Вход и выход из режима «Прогулка» (SPEC D-17). Состояние только в интерфейсе: проект не меняется. */
export function WalkToggle() {
  const walk = useUiStore((state) => state.walk);
  const setWalk = useUiStore((state) => state.setWalk);
  return (
    <div className="walk-toggle">
      <button type="button" className={`button${walk ? ' is-active' : ''}`} aria-pressed={walk}
        onClick={() => setWalk(!walk)}>{walk ? 'Выйти из прогулки' : 'Прогулка'}</button>
      {walk && (
        <p className="walk-hint" data-testid="walk-hint">
          W A S D или стрелки — идти · зажмите левую кнопку мыши — осмотр · Shift — быстрее · Esc — выход
        </p>
      )}
    </div>
  );
}
