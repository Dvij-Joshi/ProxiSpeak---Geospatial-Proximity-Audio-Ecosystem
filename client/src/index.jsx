import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

// Preserve shared meeting links and the existing designer and organization entry points.
const url = new URL(window.location.href);
const appEntry = ['/dashboard','/designer','/organizations'].includes(url.pathname.replace(/\/$/,'')) || !!url.searchParams.get('room') ||
  ['designer','orgs','organizations'].some(key => url.searchParams.get(key) === 'true');
const entry = appEntry ? import('./App.jsx') : import('./public/LandingPage.jsx');
entry.then(({default: Page}) => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode><Page /></React.StrictMode>
  );
});
