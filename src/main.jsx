import './globals.js';
import './styles/app.css';
import './storage/index.js';
import './legacy/planner.jsx';
import { registerPwa } from './pwa.js';
import { mountAccountPanel } from './cloud/AccountPanel.jsx';
registerPwa();
mountAccountPanel();
