import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const rootDir = path.resolve(import.meta.dirname, '..');
const distDir = path.join(rootDir, 'dist');
const ssrDir = path.join(rootDir, '.ssr');

const template = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');

// Identify hashed critical font files and public stylesheet/chunks
const assets = await fs.readdir(path.join(distDir, 'assets'));
const criticalFonts = assets.filter(
  (file) =>
    file.endsWith('.woff2') &&
    (file.startsWith('barlow-condensed-latin-800-normal-') || file.startsWith('dm-sans-latin-400-normal-'))
);
const publicCss = assets.find((file) => file.startsWith('PublicSite-') && file.endsWith('.css'));
const publicJs = assets.find((file) => file.startsWith('PublicSite-') && file.endsWith('.js'));

const preloadTags = [
  ...criticalFonts.map((f) => `<link rel="preload" href="/assets/${f}" as="font" type="font/woff2" crossorigin />`),
  publicJs ? `<link rel="modulepreload" crossorigin href="/assets/${publicJs}" />` : '',
  publicCss ? `<link rel="stylesheet" crossorigin href="/assets/${publicCss}" />` : '',
]
  .filter(Boolean)
  .join('\n    ');

const appFontPreloads = criticalFonts
  .map((f) => `<link rel="preload" href="/assets/${f}" as="font" type="font/woff2" crossorigin />`)
  .join('\n    ');

const { renderPublicRoute } = await import(pathToFileURL(path.join(ssrDir, 'prerender.js')).href);

function buildHtml({ title, description, canonical, robots, ogImage, jsonLd, bodyHtml }) {
  let out = template;
  out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
  out = out.replace(
    /<meta name="description"[^>]*>/,
    `<meta name="description" content="${description.replace(/"/g, '&quot;')}" />`
  );

  const seoHead = [
    `<meta name="robots" content="${robots}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="ProxiSpeak" />`,
    `<meta property="og:title" content="${title.replace(/"/g, '&quot;')}" />`,
    `<meta property="og:description" content="${description.replace(/"/g, '&quot;')}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:image" content="${ogImage}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${title.replace(/"/g, '&quot;')}" />`,
    `<meta name="twitter:description" content="${description.replace(/"/g, '&quot;')}" />`,
    `<meta name="twitter:image" content="${ogImage}" />`,
    preloadTags,
    `<script id="ps-jsonld" type="application/ld+json">${jsonLd}</script>`,
  ]
    .filter(Boolean)
    .join('\n    ');

  out = out.replace('</head>', `    ${seoHead}\n  </head>`);
  out = out.replace('<div id="root"></div>', `<div id="root">${bodyHtml}</div>`);
  return out;
}

const routes = [
  { route: '/', outFile: 'index.html' },
  { route: '/spatial-audio', outFile: 'spatial-audio/index.html' },
  { route: '/templates', outFile: 'templates/index.html' },
  { route: '/about', outFile: 'about/index.html' },
  { route: '/404', outFile: '404.html' },
];

for (const { route, outFile } of routes) {
  const { html, meta, ogImage, jsonLd } = renderPublicRoute(route);
  const fullHtml = buildHtml({
    title: meta.title,
    description: meta.description,
    canonical: meta.canonical,
    robots: meta.robots,
    ogImage,
    jsonLd,
    bodyHtml: html,
  });
  const targetPath = path.join(distDir, outFile);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, fullHtml, 'utf8');
  console.log('[SSG] Prerendered', outFile);
}

// Create clean noindex app shell for /dashboard, /designer, /organizations
const appHtml = template
  .replace(/<title>[\s\S]*?<\/title>/, '<title>ProxiSpeak Workspace App</title>')
  .replace('</head>', `    <meta name="robots" content="noindex, follow" />\n    ${appFontPreloads}\n  </head>`);
await fs.writeFile(path.join(distDir, 'app.html'), appHtml, 'utf8');
console.log('[SSG] Generated app.html (noindex workspace shell)');

// Clean up temporary SSR bundle
await fs.rm(ssrDir, { recursive: true, force: true });
