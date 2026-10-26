// Offline support for the hosted app (service worker). The single-file build replaces this with a stub.
import { registerSW } from 'virtual:pwa-register';
export function registerPwa() {
  if (location.protocol === 'file:' || !('serviceWorker' in navigator)) return;
  registerSW({ immediate: true });
}
