import { retryModelLoad } from '../scene3d/ModelGuard';
import { useUiStore } from '../store/uiStore';

/** Сбои загрузки моделей: причина текстом и повтор. Остальная работа продолжается (AC-13). */
export function ModelErrors() {
  const errors = useUiStore((state) => state.modelErrors);
  const entries = Object.entries(errors);
  if (entries.length === 0) return null;
  return (
    <div className="model-errors">
      {entries.map(([url, error]) => (
        <div key={url} className="model-error" role="alert" data-testid="model-error" data-model-url={url}>
          <p>
            Не удалось загрузить модель «{error.label}»: {error.reason}. Остальные предметы и план работают.
          </p>
          <button type="button" className="model-error-retry" onClick={() => retryModelLoad(url)}>
            Повторить загрузку
          </button>
        </div>
      ))}
    </div>
  );
}
