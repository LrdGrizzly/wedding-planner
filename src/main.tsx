import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App';
import { initDrive } from './lib/drive';
import { SYNC_ENABLED } from './lib/flags';
import './index.css';

// Dev-only: fake Google + Drive for testing sync (never part of the production build)
if (import.meta.env.DEV && localStorage.getItem('wp_drive_mock')) await import('./dev/driveMock');

if (SYNC_ENABLED) initDrive();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);

// Offline support: network-first service worker (see public/sw.js)
if ('serviceWorker' in navigator && import.meta.env.PROD && SYNC_ENABLED) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`./sw.js?v=${encodeURIComponent(__APP_VERSION__)}`, { scope: './' }).catch(() => {});
  });
}

declare const __APP_VERSION__: string;
