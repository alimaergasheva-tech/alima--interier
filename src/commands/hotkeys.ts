// Горячие клавиши истории. Используется код физической клавиши, поэтому
// сочетания работают и в русской раскладке.

export interface KeyLike {
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export type HistoryAction = 'undo' | 'redo';

export function historyActionForKey(event: KeyLike): HistoryAction | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  if (event.code === 'KeyZ') return event.shiftKey ? 'redo' : 'undo';
  if (event.code === 'KeyY' && !event.shiftKey) return 'redo';
  return null;
}

export interface TargetLike {
  tagName?: string;
  isContentEditable?: boolean;
}

/** Пока пользователь вводит число или текст, клавиши редактора не срабатывают (AC-16). */
export function isEditableTarget(target: TargetLike | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName?.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
