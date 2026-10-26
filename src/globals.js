// The planner was written as a classic browser script using React / ReactDOM globals (UMD).
// Provide the same globals from npm so the code runs unchanged.
import React from 'react';
import * as ReactDOMLegacy from 'react-dom';
import * as ReactDOMClient from 'react-dom/client';
window.React = React;
window.ReactDOM = { ...ReactDOMLegacy, ...ReactDOMClient };
