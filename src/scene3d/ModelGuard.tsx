import { useGLTF } from '@react-three/drei';
import { Component, type ReactNode } from 'react';
import { useUiStore } from '../store/uiStore';

interface GuardProps {
  /** Адрес файла модели: по нему сбои группируются и повторяются. */
  url: string;
  /** Название предмета для сообщения пользователю. */
  label: string;
  children: ReactNode;
}

/**
 * Ловит ошибку загрузки одной модели (SPEC §12, AC-13): остальные предметы, 2D-план и история
 * продолжают работать, а причина и повтор показываются в интерфейсе.
 */
class ModelBoundary extends Component<GuardProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    const text = error instanceof Error ? error.message : String(error);
    useUiStore.getState().reportModelError(this.props.url, this.props.label, text.slice(0, 160));
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/** Граница для одной модели. Счётчик повторов меняет ключ и заново запускает загрузку. */
export function ModelGuard({ url, label, children }: GuardProps) {
  const attempt = useUiStore((state) => state.modelRetry[url] ?? 0);
  return (
    <ModelBoundary key={attempt} url={url} label={label}>
      {children}
    </ModelBoundary>
  );
}

/** Повтор загрузки: сбрасывает кеш неудачной модели и пересоздаёт границы вокруг её экземпляров. */
export function retryModelLoad(url: string): void {
  useGLTF.clear(url);
  useUiStore.getState().retryModel(url);
}
