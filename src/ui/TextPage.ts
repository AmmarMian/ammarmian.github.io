import { BASE } from '../router';
import { textPageHtml, TEXT_TITLE, TEXT_DESCRIPTION } from './textHtml';

function setMeta(name: string, content: string) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) { el = document.createElement('meta'); el.setAttribute('name', name); document.head.appendChild(el); }
  el.setAttribute('content', content);
}

/** A plain, semantic, screen-reader- and crawler-friendly version of the
 *  site's content — everything the 3D tower holds, without needing a camera,
 *  WebGL, or spatial navigation to reach it.
 *
 *  The markup itself lives in textHtml.ts, because the build emits the same
 *  page as a static /text/index.html that needs no JavaScript at all. This
 *  path now only runs if someone reaches /text through the SPA router — the
 *  static file is what an ordinary visit gets. */
export function renderTextPage(root: HTMLElement) {
  document.title = TEXT_TITLE;
  setMeta('description', TEXT_DESCRIPTION);
  root.insertAdjacentHTML('beforeend', textPageHtml(BASE));
}
