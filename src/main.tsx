import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { PreviewPage } from './preview/PreviewPage';
import './debug';
import { useProjectStore } from './store/projectStore';
import { useUiStore } from './store/uiStore';
import { TECH_ROOM_ID, createTechApartment } from './tech/techApartment';
import './ui/theme.css';

// Техническая сцена остаётся доступной для воспроизводимых проверок этапов 4–6.
if (new URLSearchParams(window.location.search).has('tech')) {
  useProjectStore.getState().loadApartment(createTechApartment());
  useUiStore.getState().setStage('interior');
  useUiStore.getState().setActiveRoom(TECH_ROOM_ID);
}

const root = document.getElementById('root');
if (!root) throw new Error('Не найден корневой элемент #root');

const previewId = new URLSearchParams(window.location.search).get('preview');
createRoot(root).render(
  <StrictMode>{previewId !== null ? <PreviewPage id={previewId} /> : <App />}</StrictMode>,
);
