import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { textPageHtml, noscriptHtml, TEXT_TITLE, TEXT_DESCRIPTION, esc } from './src/ui/textHtml';

/* /text as a real HTML file, and the <noscript> block that points at it.
 *
 * /text used to be the SPA: an empty <div id="app"> plus 250KB of JavaScript
 * whose first act was to build a page of static prose. A crawler that does
 * not execute scripts — and the ones that matter for an academic page often
 * do not — saw nothing at all on the one page written to be read plainly.
 *
 * It is emitted here as a complete document with no script tag of any kind.
 * GitHub Pages serves /text/index.html for /text directly, so the 404 bounce
 * never runs and the SPA is never loaded: the plain version is genuinely
 * plain, and it is the fastest page on the site by a wide margin.
 *
 * The markup comes from src/ui/textHtml.ts, the same module the browser uses,
 * so this cannot drift from the real thing the way the hand-written noscript
 * block had already begun to. */
function prerenderText(): Plugin {
  const head = (title: string, description: string, canonical: string) => `
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="author" content="Ammar Mian">
<link rel="canonical" href="${esc(canonical)}">
<meta name="theme-color" content="#0b0d16">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">`;

  return {
    name: 'prerender-text',
    apply: 'build',
    /* The <noscript> block used to be a hand-written copy of the opening of
       the text page. Generated from the same module now, so a changed title
       or affiliation reaches it without anyone remembering to look. */
    transformIndexHtml(html) {
      return html.replace(
        /<noscript>[\s\S]*?<\/noscript>/,
        `<noscript>\n${noscriptHtml()}\n</noscript>`,
      );
    },
    generateBundle(_options, bundle) {
      // Whatever hash the stylesheet was given this build.
      const css = Object.keys(bundle).find((f) => f.endsWith('.css'));
      const cssHref = css ? '/' + css : '';
      this.emitFile({
        type: 'asset',
        fileName: 'text/index.html',
        source: `<!DOCTYPE html>
<html lang="en">
<head>${head(TEXT_TITLE, TEXT_DESCRIPTION, 'https://ammarmian.fr/text')}
<link rel="stylesheet" href="${esc(cssHref)}">
</head>
<body>
${textPageHtml('')}
</body>
</html>
`,
      });
    },
  };
}

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
  plugins: [publicationsJsonLd(), prerenderText(() => cssHref)],
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
