import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import {
  notifyPwaUpdateAvailable,
  setPwaUpdateFn,
} from './pwa/updateStore';
import { initSettings } from './settings/settingsStore';
import './index.css';

initSettings();

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    notifyPwaUpdateAvailable();
  },
});
setPwaUpdateFn(updateSW);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
