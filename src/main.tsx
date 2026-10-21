import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import App from './App';
import { initDrive } from './lib/drive';
import './index.css';

initDrive();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);

// Offline support: network-first service worker (see public/sw.js)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`./sw.js?v=${encodeURIComponent(__APP_VERSION__)}`, { scope: './' }).catch(() => {});
  });
}

declare const __APP_VERSION__: string;
