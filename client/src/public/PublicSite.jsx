import { useEffect, useState } from 'react';
import LandingPage from './LandingPage';
import SpatialAudioPage from './SpatialAudioPage';
import TemplatesPage from './TemplatesPage';
import AboutPage from './AboutPage';
import NotFoundPage from './NotFoundPage';
import { PAGE_META, buildJsonLd } from './seoMeta';

export function normalizePublicPath(pathname) {
  const clean = (pathname || '/').replace(/\/+$/, '') || '/';
  return clean;
}

function syncHeadTags(route) {
  const meta = PAGE_META[route] || PAGE_META['/404'];
  document.title = meta.title;

  const setMeta = (selector, attr, key, content) => {
    let el = document.head.querySelector(selector);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };

  setMeta('meta[name="description"]', 'name', 'description', meta.description);
  setMeta('meta[name="robots"]', 'name', 'robots', meta.robots);
  setMeta('meta[property="og:title"]', 'property', 'og:title', meta.title);
  setMeta('meta[property="og:description"]', 'property', 'og:description', meta.description);
  setMeta('meta[property="og:url"]', 'property', 'og:url', meta.canonical);

  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', meta.canonical);

  let ld = document.getElementById('ps-jsonld');
  if (ld) {
    ld.textContent = JSON.stringify(buildJsonLd(route));
  }
}

export default function PublicSite({ initialPath }) {
  const [route, setRoute] = useState(() =>
    normalizePublicPath(initialPath ?? (typeof window !== 'undefined' ? window.location.pathname : '/'))
  );

  useEffect(() => {
    const onPopState = () => setRoute(normalizePublicPath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    syncHeadTags(route);
  }, [route]);

  const handleNavigate = (e, targetPath) => {
    if (e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return;
    const clean = normalizePublicPath(targetPath);
    if (!PAGE_META[clean]) return;
    e?.preventDefault();
    if (clean !== route) {
      window.history.pushState({}, '', clean);
      setRoute(clean);
      window.scrollTo(0, 0);
    }
  };

  if (route === '/') return <LandingPage onNavigate={handleNavigate} />;
  if (route === '/spatial-audio') return <SpatialAudioPage onNavigate={handleNavigate} />;
  if (route === '/templates') return <TemplatesPage onNavigate={handleNavigate} />;
  if (route === '/about') return <AboutPage onNavigate={handleNavigate} />;
  return <NotFoundPage onNavigate={handleNavigate} />;
}
