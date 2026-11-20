import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '../../src/store/uiStore';

// Реестр сбоев загрузки моделей (13.6, AC-13): в проект и историю он не входит.

describe('сбои загрузки моделей', () => {
  beforeEach(() => useUiStore.setState({ modelErrors: {}, modelRetry: {}, selection: null }));

  it('сбой запоминается по адресу файла, повторный сбой той же модели не дублируется', () => {
    const { reportModelError } = useUiStore.getState();
    reportModelError('/models/a.gltf', 'Диван', 'нет файла');
    reportModelError('/models/a.gltf', 'Диван', 'нет файла');
    reportModelError('/models/b.gltf', 'Кресло', 'ошибка разбора');
    expect(Object.keys(useUiStore.getState().modelErrors)).toEqual(['/models/a.gltf', '/models/b.gltf']);
    expect(useUiStore.getState().modelErrors['/models/a.gltf']).toEqual({ label: 'Диван', reason: 'нет файла' });
  });

  it('повтор убирает сообщение только этой модели и меняет счётчик попыток', () => {
    const state = useUiStore.getState();
    state.reportModelError('/models/a.gltf', 'Диван', 'нет файла');
    state.reportModelError('/models/b.gltf', 'Кресло', 'ошибка разбора');
    state.retryModel('/models/a.gltf');
    expect(Object.keys(useUiStore.getState().modelErrors)).toEqual(['/models/b.gltf']);
    expect(useUiStore.getState().modelRetry['/models/a.gltf']).toBe(1);
    state.retryModel('/models/a.gltf');
    expect(useUiStore.getState().modelRetry['/models/a.gltf']).toBe(2);
  });

  it('сбой модели не меняет выбор и остальное состояние интерфейса', () => {
    useUiStore.getState().select({ kind: 'furniture', id: 'f1' });
    useUiStore.getState().reportModelError('/models/a.gltf', 'Диван', 'нет файла');
    expect(useUiStore.getState().selection).toEqual({ kind: 'furniture', id: 'f1' });
  });
});
