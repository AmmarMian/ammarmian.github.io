/** Clipboard + file-download helpers, shared by the side panel and the
 *  console. Both degrade rather than throw: an insecure context (or a
 *  browser that refuses the async clipboard) falls back to a hidden
 *  textarea and execCommand, which still works nearly everywhere. */

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

export function downloadText(filename: string, text: string, mime = 'text/plain') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next turn of the loop — revoking synchronously can race
  // the browser's own fetch of the blob in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Announce something to assistive tech without moving focus. One shared
 *  polite region, created lazily. */
let liveRegion: HTMLElement | null = null;
export function announce(message: string) {
  if (!liveRegion) {
    liveRegion = document.createElement('div');
    liveRegion.className = 'sr-only';
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    document.body.appendChild(liveRegion);
  }
  // Re-setting identical text doesn't re-announce; clearing first does.
  liveRegion.textContent = '';
  window.setTimeout(() => { if (liveRegion) liveRegion.textContent = message; }, 30);
}

/** Flash a transient confirmation on a button without disturbing layout. */
export function flashLabel(btn: HTMLElement, text: string, ms = 1400) {
  const prev = btn.dataset.flashPrev ?? btn.textContent ?? '';
  btn.dataset.flashPrev = prev;
  btn.textContent = text;
  btn.classList.add('is-flashing');
  window.clearTimeout(Number(btn.dataset.flashTimer));
  btn.dataset.flashTimer = String(window.setTimeout(() => {
    btn.textContent = btn.dataset.flashPrev ?? prev;
    btn.classList.remove('is-flashing');
    delete btn.dataset.flashPrev;
  }, ms));
}
