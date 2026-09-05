import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';

/* Every publication, as schema.org ScholarlyArticle, written into index.html
   at build time.
 *
 * index.html already carries Person and WebSite; this is the third one that
 * actually matters for an academic page, and it could not exist before —
 * the records only arrived after a fetch, so nothing that does not run
 * JavaScript ever saw them. Now they are in the bundle at build time, they
 * can be in the markup too, which is what Google Scholar and every other
 * crawler reads. */
function publicationsJsonLd(): Plugin {
  return {
    name: 'publications-jsonld',
    transformIndexHtml(html) {
      let docs: any[] = [];
      try {
        docs = JSON.parse(readFileSync('src/data/hal-snapshot.json', 'utf8'));
      } catch {
        return html;   // no snapshot is the fetch script's problem, not this one's
      }
      const ld = {
        '@context': 'https://schema.org',
        '@graph': docs.map((d) => ({
          '@type': 'ScholarlyArticle',
          headline: d.title,
          name: d.title,
          author: (d.authorList ?? []).map((n: string) => ({ '@type': 'Person', name: n })),
          datePublished: d.year ? String(d.year) : undefined,
          isPartOf: d.venue ? { '@type': 'Periodical', name: d.venue } : undefined,
          identifier: d.doi || undefined,
          sameAs: d.uri && d.uri !== '#' ? d.uri : undefined,
          url: d.pdf || (d.uri !== '#' ? d.uri : undefined),
        })),
      };
      return {
        html,
        tags: [{
          tag: 'script',
          attrs: { type: 'application/ld+json' },
          // JSON.stringify drops the undefined fields above on its own.
          children: JSON.stringify(ld),
          injectTo: 'head',
        }],
      };
    },
  };
}

// Served from https://ammarmian.fr/ (the user/org root site).
export default defineConfig({
  base: '/',
  plugins: [publicationsJsonLd()],
  build: {
    rollupOptions: {
      output: {
        /* three.js is two thirds of this site and it changes about twice a
           year; the tower's own code changes every time anything is touched.
           Kept in its own chunk they get their own cache lifetimes, so a
           redeploy costs a returning visitor the scene chunk and nothing else
           — rather than re-fetching the whole of three.js because a callout's
           wording moved. Both are still reached only through the dynamic
           import in main.ts, so /text and /console fetch neither. */
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/animejs')) return 'anime';
        },
      },
    },
  },
});
