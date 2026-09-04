const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/** Keeps Tab inside an open dialog and hands focus back to whatever opened
 *  it on close. The overlays already carry role="dialog" aria-modal="true";
 *  without trapping, that promise is a lie — Tab walks straight out behind
 *  the overlay into the tower's controls. */
export function createFocusTrap(overlay: HTMLElement, opts: { initial?: () => HTMLElement | null } = {}) {
  let opener: HTMLElement | null = null;

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const items = focusable(overlay);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && (active === first || !overlay.contains(active))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault(); first.focus();
    }
  }

  return {
    activate() {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      overlay.addEventListener('keydown', onKeydown);
      requestAnimationFrame(() => {
        const target = opts.initial?.() ?? focusable(overlay)[0] ?? null;
        target?.focus();
      });
    },
    release() {
      overlay.removeEventListener('keydown', onKeydown);
      // Only restore if focus is still somewhere inside the dialog we're
      // closing — otherwise the visitor has already clicked elsewhere and
      // yanking focus back would be the rude thing to do.
      const active = document.activeElement;
      if (opener && (!active || active === document.body || overlay.contains(active))) opener.focus();
      opener = null;
    },
  };
}
