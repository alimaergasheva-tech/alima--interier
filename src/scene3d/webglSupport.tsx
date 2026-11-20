import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Есть ли в браузере WebGL (проверка на отдельном холсте, без влияния на сцену). */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function NoWebGLMessage({ reason }: { reason?: string }) {
  return (
    <div className="no-webgl" role="alert" data-testid="no-webgl">
      <strong>3D-вид недоступен</strong>
      <p>Браузер не смог включить WebGL. Включите аппаратное ускорение в настройках Chrome или Edge и обновите страницу. План квартиры, размеры и мебель работают без 3D.</p>
      {reason && <small>{reason}</small>}
    </div>
  );
}

/** Ловит ошибку создания 3D-контекста и показывает понятное сообщение вместо пустого экрана. */
export class SceneBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: unknown) { return { error: error instanceof Error ? error.message : String(error) }; }
  componentDidCatch(error: unknown, info: ErrorInfo) { console.error('[3D] ошибка сцены', error, info.componentStack); }
  render() { return this.state.error !== null ? <NoWebGLMessage reason={this.state.error} /> : this.props.children; }
}
