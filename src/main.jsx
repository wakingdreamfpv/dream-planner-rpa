import './globals.js';
import './styles/app.css';
import './storage/index.js';
import './legacy/planner.jsx';
import { registerPwa } from './pwa.js';
import { mountAccountPanel } from './cloud/AccountPanel.jsx';
registerPwa();
if (!window.__WD_CREW_MODE) mountAccountPanel(); // v7.1: a crew phone link shows only the crew form
