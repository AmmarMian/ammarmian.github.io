import type { TowerScene } from '../tower/scene';
import type { FloorRoute } from '../router';
import { panelTaken } from './layout';
import { FloorContent, type PanelActions } from './FloorContent';

export type { PanelActions };

// A horizontal run leaves the sheet's edge level with the kicker, bends to
// a true 45° and drops away toward the room, ending in a small ring — like a
// leader line calling out a detail on a technical drawing.
const LEADER_SVG = `
  <svg class="leader" viewBox="0 0 200 200" aria-hidden="true">
    <path d="M200 10 L150 10 L13 147" />
    <circle cx="10" cy="150" r="4" />
  </svg>`;

/** The 3D tower's floating callout: a leader line, a kicker, a title and a
 *  figure caption under the room. What goes inside is FloorContent's. */
export class SidePanel {
  el: HTMLElement;
  private content: FloorContent;
  private caption: HTMLElement;
  private captionSide: 'left' | 'right' = 'left';

  constructor(root: HTMLElement, tower: TowerScene, actions: PanelActions = {}) {
    this.el = document.createElement('aside');
    this.el.className = 'callout';
    this.el.hidden = true;
    root.appendChild(this.el);
    // The room's figure caption lives outside the panel: it belongs under the
    // room, in the part of the screen the panel leaves free.
    this.caption = document.createElement('p');
    this.caption.className = 'fig-caption';
    this.caption.setAttribute('aria-hidden', 'true');
    root.appendChild(this.caption);
    window.addEventListener('resize', () => this.placeCaption());
    this.content = new FloorContent(tower, { ...actions, view: '3d' });
  }

  openDoc(id: string) { return this.content.openDoc(id); }
  openColophon() { this.content.openColophon(); }

  close() {
    this.content.unmount();
    this.el.classList.remove('callout-visible');
    this.caption.classList.remove('fig-caption-visible');
    window.setTimeout(() => { this.el.hidden = true; }, 280);
  }

  open(route: FloorRoute) {
    this.el.hidden = false;
    this.el.className = 'callout callout-' + route.side;
    this.el.innerHTML = `
      <div class="leader-wrap">${LEADER_SVG}</div>
      <div class="callout-inner">
        <header class="callout-head">
          <div class="kicker"><span class="kicker-index">${String(route.index).padStart(2, '0')}</span> &middot; ${escapeHtml(route.title)}</div>
          <h1>${escapeHtml(route.label)}</h1>
        </header>
        <div class="callout-body"></div>
      </div>
    `;
    this.captionSide = route.side;
    this.caption.innerHTML = `<b>Fig. ${String(route.index).padStart(2, '0')}</b>${escapeHtml(route.title)} <i>&mdash; drag to turn it</i>`;
    this.placeCaption();
    requestAnimationFrame(() => {
      this.el.classList.add('callout-visible');
      this.caption.classList.add('fig-caption-visible');
    });
    this.content.mount(route.slug, this.el.querySelector('.callout-body')!);
  }

  /** Centre the caption under the room — the middle of the free strip. */
  private placeCaption() {
    const W = window.innerWidth;
    const taken = Math.min(0.6 * W, panelTaken(W, false));
    const x = this.captionSide === 'left' ? (taken + W) / 2 : (W - taken) / 2;
    this.caption.style.left = `${Math.round(x)}px`;
  }
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
