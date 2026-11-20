import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './debug';
import { useProjectStore } from './store/projectStore';
import { useUiStore } from './store/uiStore';
import { TECH_ROOM_ID, createTechApartment } from './tech/techApartment';
import './ui/theme.css';

// Этап 4: приложение открывается на технической комнате. Стартовый сценарий — этап 7.
useProjectStore.getState().loadApartment(createTechApartment());
useUiStore.getState().setStage('interior');
useUiStore.getState().setActiveRoom(TECH_ROOM_ID);

const root = document.getElementById('root');
if (!root) throw new Error('Не найден корневой элемент #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
