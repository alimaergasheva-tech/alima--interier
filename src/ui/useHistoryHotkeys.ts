import { useEffect } from 'react';
import { historyActionForKey, isEditableTarget } from '../commands/hotkeys';
import { useProjectStore } from '../store/projectStore';

/** Ctrl+Z и Ctrl+Y (а также Ctrl+Shift+Z) для всего приложения. */
export function useHistoryHotkeys(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target as HTMLElement | null)) return;
      const action = historyActionForKey(event);
      if (!action) return;
      event.preventDefault();
      const store = useProjectStore.getState();
      if (action === 'undo') store.undo();
      else store.redo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
