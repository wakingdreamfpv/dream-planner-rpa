import './globals.js';
import './styles/app.css';
import './storage/index.js';
import './legacy/planner.jsx';
import { registerPwa } from './pwa.js';
import { mountAccountPanel } from './cloud/AccountPanel.jsx';
registerPwa();
if (!window.__WD_CREW_MODE && !window.__WD_OBS_MODE && !window.__WD_PLAN_MODE) mountAccountPanel(); // v7.1: a crew phone link shows only the crew form
// Chunk 4: an observer's QR / link shows only the observer sign-off
if (window.__WD_OBS_MODE) {
  Promise.all([import('react'), import('react-dom/client'), import('./observer/Observer.jsx')]).then(([R, D, O]) => {
    D.createRoot(document.getElementById('root')).render(R.createElement(O.ObserverLinkApp, { token: O.observerTokenFromHash() }));
  });
}
// v7.18: a live plan link shows the plan and its comments (no login)
if (window.__WD_PLAN_MODE) {
  Promise.all([import('react'), import('react-dom/client'), import('./collab/Comments.jsx')]).then(([R, D, C]) => {
    D.createRoot(document.getElementById('root')).render(R.createElement(C.PlanLinkApp, { token: C.planTokenFromHash() }));
  });
}
