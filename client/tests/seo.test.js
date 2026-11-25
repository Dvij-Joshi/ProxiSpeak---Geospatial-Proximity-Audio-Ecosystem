import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PAGE_META } from '../src/public/seoMeta.js';

const distDir = path.resolve(import.meta.dirname, '../dist');
const publicDir = path.resolve(import.meta.dirname, '../public');

test('all public SEO routes have unique titles (50-60 chars) and descriptions (140-160 chars)', () => {
  const indexRoutes = Object.entries(PAGE_META).filter(([route]) => route !== '/404');
  const titles = new Set();
  const descriptions = new Set();

  for (const [route, meta] of indexRoutes) {
    assert.ok(
      meta.title.length >= 50 && meta.title.length <= 60,
      `Title length for ${route} is ${meta.title.length} (expected 50-60): "${meta.title}"`
    );
    assert.ok(
      meta.description.length >= 140 && meta.description.length <= 160,
      `Description length for ${route} is ${meta.description.length} (expected 140-160): "${meta.description}"`
    );
    assert.ok(!titles.has(meta.title), `Duplicate title for ${route}`);
    assert.ok(!descriptions.has(meta.description), `Duplicate description for ${route}`);
    titles.add(meta.title);
    descriptions.add(meta.description);
  }
});

test('prerendered static HTML files contain one H1, canonical, stylesheet, JSON-LD, WebP images with alt/size, and zero orphans', async () => {
  const routeFiles = {
    '/': 'index.html',
    '/spatial-audio': 'spatial-audio/index.html',
    '/templates': 'templates/index.html',
    '/about': 'about/index.html',
  };

  const inboundLinks = Object.fromEntries(Object.keys(routeFiles).map((r) => [r, 0]));

  for (const [route, file] of Object.entries(routeFiles)) {
    const html = await fs.readFile(path.join(distDir, file), 'utf8');

    const h1Matches = html.match(/<h1[\s>]/g) || [];
    assert.equal(h1Matches.length, 1, `Expected exactly 1 <h1> in ${file}, found ${h1Matches.length}`);

    assert.ok(
      html.includes(`<link rel="canonical" href="${PAGE_META[route].canonical}"`),
      `Missing canonical tag in ${file}`
    );
    assert.ok(html.includes('<meta name="robots" content="index, follow"'), `Missing robots index tag in ${file}`);
    assert.ok(html.includes('PublicSite-'), `Missing linked PublicSite CSS/JS preload in ${file}`);
    assert.ok(html.includes('application/ld+json'), `Missing JSON-LD structured data in ${file}`);

    const imgTags = html.match(/<img\b[^>]*>/g) || [];
    for (const tag of imgTags) {
      assert.ok(/alt="[^"]+"/.test(tag), `Image missing non-empty alt attribute in ${file}: ${tag}`);
      assert.ok(/width="\d+"/.test(tag) && /height="\d+"/.test(tag), `Image missing explicit width/height in ${file}: ${tag}`);
      if (!tag.includes('favicon.svg')) {
        assert.ok(tag.includes('.webp'), `Expected raster image in ${file} to use .webp format: ${tag}`);
      }
    }

    const hrefs = [...html.matchAll(/href="(\/[a-z-]*)"/g)].map((m) => m[1]);
    for (const target of new Set(hrefs)) {
      if (target in inboundLinks && target !== route) {
        inboundLinks[target]++;
      }
    }
  }

  for (const [route, count] of Object.entries(inboundLinks)) {
    assert.ok(count >= 2, `Orphan check failed for ${route}: only ${count} inbound internal links`);
  }

  const notFoundHtml = await fs.readFile(path.join(distDir, '404.html'), 'utf8');
  assert.ok(notFoundHtml.includes('noindex, nofollow'), '404.html must include noindex, nofollow');

  const appHtml = await fs.readFile(path.join(distDir, 'app.html'), 'utf8');
  assert.ok(appHtml.includes('noindex, follow'), 'app.html must include noindex, follow');
});

test('robots.txt, sitemap.xml, and compressed WebP images exist in client/public', async () => {
  const robots = await fs.readFile(path.join(publicDir, 'robots.txt'), 'utf8');
  assert.ok(robots.includes('Allow: /') && robots.includes('Sitemap: https://proxi-speak-geospatial-proximity-au-kappa.vercel.app/sitemap.xml'));

  const sitemap = await fs.readFile(path.join(publicDir, 'sitemap.xml'), 'utf8');
  for (const pathSuffix of ['/', '/spatial-audio', '/templates', '/about']) {
    assert.ok(
      sitemap.includes(`<loc>https://proxi-speak-geospatial-proximity-au-kappa.vercel.app${pathSuffix}</loc>`),
      `Missing ${pathSuffix} in sitemap.xml`
    );
  }

  const images = await fs.readdir(path.join(publicDir, 'images'));
  for (const name of ['og-proxispeak.webp', 'shared-studio-office.webp', 'keynote-auditorium.webp', 'rooftop-social-lounge.webp']) {
    assert.ok(images.includes(name), `Missing WebP image ${name}`);
  }
});
