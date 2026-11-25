import { renderToString } from 'react-dom/server';
import PublicSite from './PublicSite';
import { PAGE_META, OG_IMAGE, buildJsonLd } from './seoMeta';

export function renderPublicRoute(route) {
  const html = renderToString(<PublicSite initialPath={route} />);
  const meta = PAGE_META[route] || PAGE_META['/404'];
  const jsonLd = JSON.stringify(buildJsonLd(route));
  return { html, meta, ogImage: OG_IMAGE, jsonLd };
}
