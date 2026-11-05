// The planner was written as a classic browser script using React / ReactDOM globals (UMD).
// Provide the same globals from npm so the code runs unchanged.
import React from 'react';
import * as ReactDOMLegacy from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
window.React = React;
window.ReactDOM = { ...ReactDOMLegacy, ...ReactDOMClient };

// Chunk 4: a QR / link for an observer (#observer=<token>) shows only the observer sign-off page
window.__WD_OBS_MODE = typeof location !== 'undefined' && /^#observer=[a-f0-9]{40,80}$/i.test(location.hash);

// v7.18: a live plan link (#plan=<token>) shows only the plan and its comments
window.__WD_PLAN_MODE = typeof location !== 'undefined' && /^#plan=[a-f0-9]{40,80}$/i.test(location.hash);
