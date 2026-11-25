import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

// Preserve shared meeting links and the existing designer and organization entry points.
const url = new URL(window.location.href);
const cleanPath = url.pathname.replace(/\/+$/, '') || '/';
const appEntry =
  ['/dashboard', '/designer', '/organizations'].includes(cleanPath) ||
  !!url.searchParams.get('room') ||
  ['designer', 'orgs', 'organizations'].some((key) => url.searchParams.get(key) === 'true');

const rootEl = document.getElementById('root');

if (appEntry) {
  let robots = document.head.querySelector('meta[name="robots"]');
  if (!robots) {
    robots = document.createElement('meta');
    robots.setAttribute('name', 'robots');
    document.head.appendChild(robots);
  }
  robots.setAttribute('content', 'noindex, follow');

  import('./App.jsx').then(({ default: App }) => {
    ReactDOM.createRoot(rootEl).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  });
} else {
  import('./public/PublicSite.jsx').then(({ default: PublicSite }) => {
    const app = (
      <React.StrictMode>
        <PublicSite />
      </React.StrictMode>
    );
    if (rootEl.hasChildNodes()) {
      ReactDOM.hydrateRoot(rootEl, app);
    } else {
      ReactDOM.createRoot(rootEl).render(app);
    }
  });
}
