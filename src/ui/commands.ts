import { PROFILE, CONTACT } from '../data/profile';
import {
  fetchHalPublications, cachedHalPublications, filterHalDocs, toBibTeX, toBibTeXAll,
  toCSV, toPlainCitation, docSlugFor, type HalDoc,
} from '../data/hal';
import students from '../data/students.json';
import projects from '../data/projects.json';
import { FLOORS, navigate } from '../router';
import { FLOOR_NAMES } from '../tower/scene-constants';
import { copyText, downloadText } from './io';
import { WORLD_BLURBS } from '../data/worlds';
import { COLOPHON_TITLE, COLOPHON_BLOCK, COLOPHON_NOTE } from '../data/colophon';

export interface WorldsApi {
  kinds: string[];
  current: () => string | null;
  reflections: (on: boolean) => boolean;
  reflectionsOn: () => boolean;
  teleport: (kind: string | null, onSwap?: () => void) => boolean;
}

/** What the console is allowed to reach. The 3D tower supplies all of it;
 *  the ASCII console runs with `scene` absent and the display commands
 *  simply say so rather than being hidden — a command that exists on one
 *  surface and not the other is more confusing than one that explains
 *  itself. */
export interface ConsoleHost {
  worlds: WorldsApi;
  setShellOverride: (mode: 'off' | 'ghost' | 'solid' | null) => void;
  /** Fired whenever the console opens or closes, so the host can make room
   *  for it — the tower steps aside rather than being covered. */
  onToggle?: () => void;
  scene?: {
    setPixelMode: (scale: number | null) => number | null;
    setLightMode: (mode: 'auto' | 'day' | 'night') => string;
    lightModeAvailable: () => boolean;
    probe: (report: (line: string) => void, enable?: boolean) => string;
    setVista: (v: 'meadow' | 'coast' | 'toggle') => string;
    goBath: () => void;
    runBath: () => void;
    drainBath: () => void;
    vista: () => string;
    VISTAS: readonly string[];
    simSet: (key: string, value: number) => number | null;
    simReset: () => Record<string, number>;
    simList: () => { key: string; value: number; def: number; min: number; max: number; help: string }[];
    scan: (report: (line: string) => void) => string;
    perf: (report: (line: string) => void) => string;
    /** Open the grimoire on the library lectern — the 3D tower only. */
    openColophon?: () => void;
    setQuality: (tier: 'low' | 'medium' | 'high' | null) => string;
    pixelMode: () => number | null;
    showFps: (on: boolean) => boolean;
    fpsShown: () => boolean;
    qualityState: () => {
      tier: string; blurb: string; pinned: string | null;
      fps: number; ms: number; gpu: string;
    };
    gpu: () => {
      ok: boolean; webgl2: boolean; vendor: string; renderer: string;
      software: boolean; masked: boolean; maxTextureSize: number;
      antialias: boolean; cores: number; memory: number;
    };
    setAutoRotate: (on: boolean) => boolean;
    autoRotate: () => boolean;
  } | null;
}

export interface Ctx extends ConsoleHost {
  print: (line: string, cls?: string) => void;
  clear: () => void;
  close: () => void;
  /** Whether the current console viewport needs compact text art. */
  isCompact?: () => boolean;
  /** 'tower' drives the 3D scene; 'ascii' is the text-only console. */
  mode: 'tower' | 'ascii';
  /** ASCII console only — re-draw the tower diagram. */
  draw?: (floor?: number | null) => void;
  /** Last publication result set, so `cite 3` means something. */
  results?: HalDoc[];
}

/* Every floor answers to two names — the route it serves ("publications")
   and the room it is ("library") — and both are visible in the interface:
   the nav rail shows one, the hover hint and the callout's kicker show the
   other. So `goto` accepts either, plus a couple of obvious short forms.
   Only the route names are listed in help; the rest are quiet aliases. */
const GOTO_CANONICAL = ['home', ...FLOORS.map((f) => f.slug)];

const GOTO_TARGETS: Record<string, string | null> = { home: null, tower: null };
for (const f of FLOORS) {
  GOTO_TARGETS[f.slug] = f.slug;
  // "Portal sanctum" → sanctum, "Sleeping quarters" → quarters, "Library" → library
  const room = FLOOR_NAMES[f.index].split(/\s+/).pop()!.toLowerCase();
  GOTO_TARGETS[room] = f.slug;
}
Object.assign(GOTO_TARGETS, {
  lab: GOTO_TARGETS.laboratory,
  sleeping: GOTO_TARGETS.quarters,
  papers: GOTO_TARGETS.publications,
  pubs: GOTO_TARGETS.publications,
});

export const JUMP_TARGETS = ['none', 'seafloor', 'moon', 'forest', 'beach', 'city', 'space', 'rain'];
const SHELL_TARGETS = ['off', 'ghost', 'solid', 'auto'];
const LIGHT_TARGETS = ['auto', 'day', 'night'];
const PIXEL_TARGETS = ['auto', '0', '2', '4', '6'];
const QUALITY_TARGETS = ['auto', 'low', 'medium', 'high'];

const OPEN_TARGETS: Record<string, string> = {
  github: CONTACT.github,
  hal: CONTACT.hal,
  site: CONTACT.website,
  email: `mailto:${CONTACT.email}`,
  text: '/text',
};

/* ------------------------------ helpers -------------------------------- */

function pad(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n);
}

async function loadDocs(ctx: Ctx): Promise<HalDoc[] | null> {
  const cached = cachedHalPublications();
  if (cached) return cached;
  ctx.print('querying HAL…', 'dim');
  try {
    return await fetchHalPublications();
  } catch {
    ctx.print('HAL did not answer. Try again, or see ' + CONTACT.hal, 'err');
    return null;
  }
}

function listDocs(ctx: Ctx, docs: HalDoc[], limit = 20) {
  ctx.results = docs;
  docs.slice(0, limit).forEach((d, i) => {
    ctx.print(`  ${String(i + 1).padStart(3)}  ${String(d.year || 'n.d.').padEnd(6)} ${d.title}`, 'hit');
  });
  if (docs.length > limit) ctx.print(`  … ${docs.length - limit} more — narrow with \`pubs <terms>\``, 'dim');
  ctx.print(`${docs.length} record${docs.length === 1 ? '' : 's'}. \`cite <n>\` for BibTeX, \`export bib\` for the set.`, 'dim');
}

function pickResult(ctx: Ctx, arg: string): HalDoc | null {
  if (!ctx.results || !ctx.results.length) {
    ctx.print('no result set — run `pubs` first.', 'err');
    return null;
  }
  const n = Number(arg);
  if (!Number.isInteger(n) || n < 1 || n > ctx.results.length) {
    ctx.print(`pick a number between 1 and ${ctx.results.length}.`, 'err');
    return null;
  }
  return ctx.results[n - 1];
}

async function copyOut(ctx: Ctx, text: string, what: string) {
  ctx.print('');
  for (const line of text.split('\n')) ctx.print(line, 'pre');
  ctx.print('');
  ctx.print((await copyText(text)) ? `${what} copied to the clipboard.` : `${what} printed above — copy it by hand.`, 'ok');
}

/** In the ASCII console there is no side panel to open, so arriving at a
 *  floor has to print what that floor holds. Each one delegates to the
 *  command that already knows how to render it. */
export async function describeFloor(slug: string, ctx: Ctx) {
  const route = FLOORS.find((f) => f.slug === slug);
  if (!route) return;
  ctx.print(`${String(route.index + 1).padStart(2, '0')} · ${route.title.toUpperCase()} — ${route.label}`, 'head');
  switch (slug) {
    case 'about':
      return COMMANDS.cat.run(['cv.txt'], ctx);
    case 'publications':
      return COMMANDS.pubs.run([], ctx);
    case 'projects':
      return COMMANDS.ls.run([], ctx);
    case 'contact':
      return COMMANDS.cat.run(['contact.txt'], ctx);
    case 'now':
      ctx.print('Simmering in the kitchen — students currently under supervision.', 'dim');
      return COMMANDS.cat.run(['students.txt'], ctx);
    case 'settings':
      /* The one storey below ground, and the one that is not about the work.
         In the 3D tower it holds the display controls and the plug; here
         there is nothing to draw, so it holds the honest inventory of what
         this site has written into your browser. */
      ctx.print('The storey below the sanctum, and the only room here that is not', 'dim');
      ctx.print('about the work. It is where the plumbing lives.', 'dim');
      ctx.print('');
      return COMMANDS.remembers.run([], ctx);
    case 'elsewhere':
      ctx.print('The portal here opens onto other worlds. In the 3D tower you can', 'dim');
      ctx.print('step the whole building through it:', 'dim');
      for (const k of JUMP_TARGETS.filter((k) => k !== 'none')) {
        ctx.print(`  ${pad(k, 12)}${WORLD_BLURBS[k] ?? ''}`, 'cmd');
      }
      ctx.print('');
      ctx.print('`view 3d` to go and stand in one.', 'dim');
      return;
  }
}

/* ------------------------------ the wizard ------------------------------ */

/** The tower's keeper, drawn in type. The 3D scene has him wandering the
 *  storeys on a daily routine; this is the same character saying hello. */
const WIZARD = [
  '        /\\',
  '       /  \\',
  '      /    \\          (*)',
  '     /______\\          |',
  '     | .  . |          |',
  '     |  --  |          |',
  '      \\ \\/ /           |',
  '     /`----\'\\          |',
  '    /   ||   \\         |',
  '   |    ||    |        |',
  '    \\___||___/         |',
  '      _||_            _|_',
];

/** Boxed around whatever it's given, so the greeting can change without
 *  anyone having to re-align a hand-drawn frame. */
function speechBubble(lines: string[], indent = 8): string[] {
  const pad_ = ' '.repeat(indent);
  const w = Math.max(...lines.map((l) => l.length));
  return [
    `${pad_}.${'-'.repeat(w + 4)}.`,
    ...lines.map((l) => `${pad_}|  ${l.padEnd(w)}  |`),
    `${pad_}'--.${'-'.repeat(w + 1)}'`,
    `${pad_}  /`,
    `${pad_} v`,
  ];
}

function wrapBubbleLines(lines: string[], width: number): string[] {
  return lines.flatMap((line) => {
    if (!line) return [''];
    const wrapped: string[] = [];
    let current = '';
    for (const word of line.split(' ')) {
      if (!current || current.length + word.length + 1 > width) {
        if (current) wrapped.push(current);
        current = word;
      } else {
        current += ' ' + word;
      }
    }
    if (current) wrapped.push(current);
    return wrapped;
  });
}

function greeting(): string[] {
  const h = new Date().getHours();
  const when = h < 6 ? 'You keep late hours. So do I.'
    : h < 12 ? 'Good morning. The kettle is on upstairs.'
    : h < 18 ? 'Good afternoon. Mind the cauldron.'
    : 'Good evening. The observatory is worth the climb.';
  return [
    'Hello. I keep this tower.',
    when,
    '',
    'Type `help` for the commands, or `goto library`',
    'to start somewhere. Every command takes --help.',
  ];
}

/* ------------------------------ commands ------------------------------- */

type Command = {
  args?: string;
  help: string;
  /** Longer prose for `<command> --help`; the one-line `help` is the summary. */
  detail?: string;
  examples?: string[];
  run: (args: string[], ctx: Ctx) => void | Promise<void>;
  complete?: (ctx: Ctx) => string[];
};

/** Every command answers `--help` (and `-h`), assembled from what it already
 *  declares: its signature, what it does, the values it will complete, and a
 *  couple of worked examples. Handled centrally so no command can forget. */
function printUsage(name: string, cmd: Command, ctx: Ctx) {
  ctx.print(`usage: ${name}${cmd.args ? ' ' + cmd.args : ''}`, 'head');
  ctx.print(`  ${cmd.detail ?? cmd.help}`);
  const opts = cmd.complete?.(ctx) ?? [];
  if (opts.length) {
    ctx.print('');
    ctx.print(`  accepts: ${opts.join(', ')}`, 'dim');
  }
  if (cmd.examples?.length) {
    ctx.print('');
    ctx.print('  examples:', 'dim');
    for (const e of cmd.examples) ctx.print(`    ${e}`, 'echo');
  }
}

export const COMMANDS: Record<string, Command> = {
  help: {
    args: '[command]',
    help: 'this list, or one command in detail',
    detail: 'With no argument, lists every command. With one, prints that command\'s usage — the same thing `<command> --help` does.',
    examples: ['help', 'help export', 'export --help'],
    complete: () => Object.keys(COMMANDS),
    run(args, ctx) {
      const one = args[0]?.toLowerCase();
      if (one) {
        const cmd = COMMANDS[one];
        if (!cmd) { ctx.print(`help: no such command '${one}'.`, 'err'); return; }
        printUsage(one, cmd, ctx);
        return;
      }
      ctx.print('Commands:');
      for (const [name, cmd] of Object.entries(COMMANDS)) {
        // Padded, never truncated — the old 22-column cap was clipping
        // `export bib|csv [terms…]` into its own description.
        const sig = `${name}${cmd.args ? ' ' + cmd.args : ''}`;
        ctx.print(`  ${sig.padEnd(24)}${cmd.help}`, 'cmd');
      }
      ctx.print('');
      ctx.print('Any command takes --help for usage and examples.', 'dim');
      ctx.print('Tab completes, ↑/↓ walks history.', 'dim');
    },
  },

  hello: {
    help: 'say hello to the keeper',
    detail: 'The tower\'s wizard greets you, and points at where to start. He says something different depending on the hour, as he does in the tower itself.',
    examples: ['hello'],
    run(_args, ctx) {
      const compact = ctx.isCompact?.() ?? false;
      const lines = compact ? wrapBubbleLines(greeting(), 28) : greeting();
      for (const line of speechBubble(lines, compact ? 0 : 8)) ctx.print(line, 'head');
      for (const line of WIZARD) ctx.print(line, 'pre');
    },
  },

  whoami: {
    help: 'who lives here',
    detail: 'Name, role and affiliation — the one-line answer to who this site belongs to.',
    examples: ['whoami'],
    run(_args, ctx) {
      ctx.print(`${PROFILE.name} — ${PROFILE.role}`);
      ctx.print(PROFILE.affiliation);
    },
  },

  cat: {
    args: '<file>',
    help: 'cv.txt, contact.txt, students.txt',
    detail: 'Print one of the three files this tower keeps: cv.txt (bio, positions, education), contact.txt (email, office, profiles), students.txt (everyone supervised).',
    examples: ['cat cv.txt', 'cat contact.txt'],
    complete: () => ['cv.txt', 'contact.txt', 'students.txt'],
    run(args, ctx) {
      const file = args[0];
      if (file === 'cv.txt') {
        ctx.print(`${PROFILE.role} — ${PROFILE.affiliation}`);
        ctx.print(PROFILE.bio);
        ctx.print('');
        ctx.print('positions:');
        for (const p of PROFILE.positions) ctx.print(`  ${p.year.padEnd(11)} ${p.role} — ${p.org}`);
        ctx.print('education:');
        for (const e of PROFILE.education) ctx.print(`  ${e.year.padEnd(11)} ${e.role} — ${e.org}`);
      } else if (file === 'contact.txt') {
        ctx.print(`email    ${CONTACT.email}`);
        ctx.print(`office   ${CONTACT.office}`);
        ctx.print(`github   ${CONTACT.github}`);
        ctx.print(`hal      ${CONTACT.hal}`);
      } else if (file === 'students.txt') {
        for (const s of students as any[]) {
          ctx.print(`  ${pad(s.name, 22)}${pad(s.kind, 10)}${s.period}${s.status === 'current' ? '  · current' : ''}`);
          ctx.print(`  ${' '.repeat(22)}${s.topic}`, 'dim');
        }
      } else {
        ctx.print(`cat: ${file || 'missing operand'}: no such file — try cv.txt, contact.txt, students.txt`, 'err');
      }
    },
  },

  ls: {
    args: '[publications]',
    help: 'tools and projects',
    detail: 'List the open-source tools and research code. `ls publications` is a shortcut for the pubs command.',
    examples: ['ls', 'ls publications'],
    complete: () => ['publications'],
    async run(args, ctx) {
      if (args[0] === 'publications' || args[0] === 'pubs') return COMMANDS.pubs.run([], ctx);
      for (const p of projects as any[]) ctx.print(`  ${pad(p.name, 12)}${p.description}`);
      const current = (students as any[]).filter((s) => s.status === 'current');
      if (current.length) {
        ctx.print('');
        ctx.print('currently supervising:');
        for (const s of current) ctx.print(`  ${pad(s.name, 22)}${s.topic}`);
      }
    },
  },

  pubs: {
    args: '[terms…]',
    help: 'search the HAL record',
    detail: 'Search the live HAL record. Every term must match somewhere in the title, authors, venue, type or year. The numbered result set is what show, cite and export then work from.',
    examples: ['pubs', 'pubs riemannian', 'pubs sar 2021'],
    async run(args, ctx) {
      const docs = await loadDocs(ctx);
      if (!docs) return;
      const q = args.join(' ');
      const hits = filterHalDocs(docs, q);
      if (!hits.length) { ctx.print(`nothing matches "${q}".`, 'err'); return; }
      if (q) ctx.print(`matches for "${q}":`, 'dim');
      listDocs(ctx, hits);
    },
  },

  show: {
    args: '<n>',
    help: 'full record for a result',
    detail: 'Everything held about one result from the last search — authors, venue, DOI, the HAL page, the PDF if there is one, and a permalink to the record on this site.',
    examples: ['pubs sar', 'show 2'],
    async run(args, ctx) {
      const doc = pickResult(ctx, args[0]);
      if (!doc) return;
      ctx.print(doc.title);
      ctx.print(doc.authors, 'dim');
      ctx.print(`${doc.venue} · ${doc.year || 'n.d.'} · ${doc.kind}`, 'dim');
      if (doc.doi) ctx.print(`doi   ${doc.doi}`);
      ctx.print(`hal   ${doc.uri}`);
      if (doc.pdf) ctx.print(`pdf   ${doc.pdf}`);
      ctx.print(`link  ${location.origin}/publications#doc-${docSlugFor(doc.id)}`);
    },
  },

  cite: {
    args: '<n> [plain]',
    help: 'BibTeX for a result, copied',
    detail: 'Print a BibTeX entry for one result from the last search and copy it to the clipboard. Add `plain` for a prose reference instead, the shape you would paste into an email.',
    examples: ['cite 1', 'cite 3 plain'],
    async run(args, ctx) {
      const doc = pickResult(ctx, args[0]);
      if (!doc) return;
      const plain = args[1] === 'plain';
      await copyOut(ctx, plain ? toPlainCitation(doc) : toBibTeX(doc), plain ? 'Citation' : 'BibTeX');
    },
  },

  export: {
    args: 'bib|csv [terms…]',
    help: 'download the matching records',
    detail: 'Download every record matching the given terms — all of them if you give none — as a .bib file for a reference manager or a .csv for a spreadsheet.',
    examples: ['export bib', 'export csv sar', 'export bib riemannian 2022'],
    complete: () => ['bib', 'csv'],
    async run(args, ctx) {
      const fmt = (args[0] || '').toLowerCase();
      if (fmt !== 'bib' && fmt !== 'csv') { ctx.print('export: try `export bib` or `export csv`.', 'err'); return; }
      const docs = await loadDocs(ctx);
      if (!docs) return;
      const q = args.slice(1).join(' ');
      const hits = filterHalDocs(docs, q);
      if (!hits.length) { ctx.print(`nothing matches "${q}".`, 'err'); return; }
      const stamp = new Date().toISOString().slice(0, 10);
      if (fmt === 'bib') downloadText(`ammar-mian-${stamp}.bib`, toBibTeXAll(hits), 'application/x-bibtex');
      else downloadText(`ammar-mian-${stamp}.csv`, toCSV(hits), 'text/csv');
      ctx.print(`exported ${hits.length} record${hits.length === 1 ? '' : 's'} as .${fmt}.`, 'ok');
    },
  },

  goto: {
    args: '<floor>',
    help: GOTO_CANONICAL.join(', '),
    detail: 'Visit a floor of the tower. In the 3D view the camera flies there and the console closes; in the ASCII view the storey is marked and its contents printed here. Floors answer to their room name as well as their route name — `library` and `publications` are the same place.',
    examples: ['goto publications', 'goto library', 'goto home'],
    complete: () => Object.keys(GOTO_TARGETS),
    run(args, ctx) {
      const target = args[0]?.toLowerCase();
      if (!target || !(target in GOTO_TARGETS)) {
        ctx.print(`goto: unknown floor '${args[0] || ''}' — try: ${GOTO_CANONICAL.join(', ')}`, 'err');
        ctx.print('  (room names work too: sanctum, quarters, kitchen, library, laboratory, observatory)', 'dim');
        return;
      }
      const slug = GOTO_TARGETS[target];
      if (ctx.mode === 'ascii') {
        navigate(slug);
        const route = FLOORS.find((f) => f.slug === slug);
        ctx.draw?.(route ? route.index : null);
        if (route) return describeFloor(route.slug, ctx);
        ctx.print('Back to the whole tower.', 'dim');
        return;
      }
      navigate(slug);
      ctx.close();
    },
  },

  view: {
    args: '<3d|ascii|text>',
    help: 'switch how this site is presented',
    detail: 'Reload into another presentation of the same content: 3d is the tower, ascii is this console with the tower drawn in text, text is a plain semantic page.',
    examples: ['view ascii', 'view text', 'view 3d'],
    complete: () => ['3d', 'ascii', 'text'],
    run(args, ctx) {
      const v = args[0];
      if (v !== '3d' && v !== 'ascii' && v !== 'text') {
        ctx.print('view: try `view 3d`, `view ascii` or `view text`.', 'err');
        return;
      }
      if (v === 'ascii' && ctx.mode === 'ascii') { ctx.print('already here.'); return; }
      if (v === '3d' && ctx.mode === 'tower') { ctx.print('already here.'); return; }
      // A view switch rebuilds the page from scratch — the 3D tower and the
      // ASCII console are different worlds, not different stylesheets.
      const path = v === 'text' ? '/text' : v === 'ascii' ? '/console' : '/';
      window.location.href = path;
    },
  },

  jump: {
    args: '<world>',
    help: `${JUMP_TARGETS.join(', ')} — teleport the backdrop`,
    detail: 'Teleport the tower to a backdrop world. `none` brings it home. The world is written into the URL, so the view you land on is a link you can share.',
    examples: ['jump forest', 'jump space', 'jump none'],
    complete: () => JUMP_TARGETS,
    run(args, ctx) {
      if (ctx.mode === 'ascii') {
        ctx.print('jump: the gate needs the 3D tower — `view 3d` to step through it.', 'err');
        return;
      }
      const target = args[0];
      if (!target || !JUMP_TARGETS.includes(target)) {
        ctx.print(`jump: unknown world '${target || ''}' — try: ${JUMP_TARGETS.join(', ')}`, 'err');
        return;
      }
      const kind = target === 'none' ? null : target;
      if (kind === ctx.worlds.current()) { ctx.print('already there.'); return; }
      ctx.worlds.teleport(kind);
      ctx.print(`stepping through the gate to ${target}…`, 'ok');
    },
  },

  shell: {
    args: '<mode>',
    help: `${SHELL_TARGETS.join(', ')} — force the outer shell`,
    detail: 'Force the tower\'s outer wall on or off instead of letting it decide. off shows the interior bare, ghost draws it as an outline, solid builds it fully, auto hands the choice back.',
    examples: ['shell solid', 'shell auto'],
    complete: () => SHELL_TARGETS,
    run(args, ctx) {
      if (!ctx.scene) { ctx.print('shell: no 3D scene in this view.', 'err'); return; }
      const mode = args[0];
      if (!mode || !SHELL_TARGETS.includes(mode)) {
        ctx.print(`shell: unknown mode '${mode || ''}' — try: ${SHELL_TARGETS.join(', ')}`, 'err');
        return;
      }
      ctx.setShellOverride(mode === 'auto' ? null : (mode as 'off' | 'ghost' | 'solid'));
      ctx.print(mode === 'auto' ? 'shell: back to automatic.' : `shell: forced ${mode}, even up close.`, 'ok');
    },
  },

  pixel: {
    args: '<auto|0|2|4|6>',
    help: 'render resolution — 0 is full, 6 is chunky',
    detail: 'Pin the pixel-art resolution. 0 renders at full device resolution, higher numbers render coarser and cheaper. auto picks by camera distance, which is the default.',
    examples: ['pixel 0', 'pixel 6', 'pixel auto'],
    complete: () => PIXEL_TARGETS,
    run(args, ctx) {
      if (!ctx.scene) { ctx.print('pixel: no 3D scene in this view.', 'err'); return; }
      const v = args[0];
      if (!v || !PIXEL_TARGETS.includes(v)) {
        ctx.print(`pixel: try ${PIXEL_TARGETS.join(', ')}`, 'err');
        return;
      }
      ctx.scene.setPixelMode(v === 'auto' ? null : Number(v));
      ctx.print(v === 'auto' ? 'pixel: back to automatic (by camera distance).' : `pixel: pinned at ${v}.`, 'ok');
    },
  },

  light: {
    args: '<auto|day|night>',
    help: 'pin the day/night wash',
    detail: 'The lighting normally follows your own clock — brightest at 13:00, dimmest at 01:00 — and every world answers to it: the beach\'s sun sets and its moon comes up, the forest turns blue and its flowers start to glow. Some places have no say in the matter: the ruined city is in eternal night, and deep space has no day at all. Pin it to day or night, or hand it back with auto.',
    examples: ['light night', 'light auto'],
    complete: () => LIGHT_TARGETS,
    run(args, ctx) {
      if (!ctx.scene) { ctx.print('light: no 3D scene in this view.', 'err'); return; }
      const v = args[0];
      if (!v || !LIGHT_TARGETS.includes(v)) { ctx.print(`light: try ${LIGHT_TARGETS.join(', ')}`, 'err'); return; }
      ctx.scene.setLightMode(v as 'auto' | 'day' | 'night');
      ctx.print(v === 'auto' ? 'light: following your clock again.' : `light: pinned to ${v}.`, 'ok');
      const here = ctx.worlds.current();
      if (here && !ctx.scene.lightModeAvailable()) {
        ctx.print(`(no effect in ${here} — there is no day out there. It will hold everywhere else.)`, 'dim');
      } else if (here === 'city') {
        ctx.print('(the ruined city is in eternal night; this holds everywhere else.)', 'dim');
      }
    },
  },

  probe: {
    args: '',
    help: 'identify whatever you click on in the scene',
    detail: 'Arms a one-shot pick. The next click in the 3D view reports every mesh under the cursor, nearest first, with its place in the scene graph and how its material is drawn. Meant for chasing down stray geometry and rendering artifacts.',
    examples: ['probe', 'probe off'],
    run(args, ctx) {
      if (!ctx.scene) { ctx.print('probe: no 3D scene in this view.', 'err'); return; }
      ctx.print(ctx.scene.probe((line) => ctx.print(line, 'dim'), args[0] !== 'off'), 'ok');
    },
  },

  sim: {
    args: '[<parameter> <value> | reset]',
    help: 'read and set the simulation\'s parameters',
    detail: 'The tower runs on a handful of numbers — how fast its own time passes, how hard the wind blows, how much light the lamps give, what hour it believes it is. With no arguments this lists them all with their ranges. With a name and a number it sets one; "sim reset" puts them all back. Nothing here is saved, so a reload is always a clean slate.',
    examples: ['sim', 'sim speed 4', 'sim clock 19.5', 'sim wind 0', 'sim reset'],
    complete: (ctx) => (ctx.scene ? ['reset', ...ctx.scene.simList().map((p) => p.key)] : []),
    run(args, ctx) {
      if (!ctx.scene) { ctx.print('sim: no 3D scene in this view.', 'err'); return; }
      if (!args.length) {
        ctx.print('the tower runs on these:', 'ok');
        for (const p of ctx.scene.simList()) {
          const at = p.value === p.def ? '' : '  (default ' + p.def + ')';
          ctx.print(`  ${p.key.padEnd(7)} ${String(p.value).padEnd(7)} ${p.min}..${p.max}${at}`, 'ok');
          ctx.print(`          ${p.help}`, 'dim');
        }
        ctx.print('set one with e.g. "sim clock 19.5", or "sim reset".', 'dim');
        return;
      }
      if (args[0] === 'reset') {
        ctx.scene.simReset();
        ctx.print('sim: all parameters back to their defaults.', 'ok');
        return;
      }
      const [key, raw] = args;
      if (raw === undefined) {
        const p = ctx.scene.simList().find((q) => q.key === key);
        if (!p) { ctx.print(`sim: no parameter "${key}".`, 'err'); return; }
        ctx.print(`${p.key} = ${p.value}   (${p.min}..${p.max}, default ${p.def})`, 'ok');
        ctx.print(p.help, 'dim');
        return;
      }
      const v = Number(raw);
      if (!isFinite(v)) { ctx.print(`sim: "${raw}" is not a number.`, 'err'); return; }
      const applied = ctx.scene.simSet(key, v);
      if (applied === null) { ctx.print(`sim: no parameter "${key}". Try "sim" for the list.`, 'err'); return; }
      ctx.print(`sim: ${key} = ${applied}${applied !== v ? ' (clamped)' : ''}.`, 'ok');
    },
  },

  reflect: {
    args: '<on|off>',
    help: 'wet-surface reflections',
    detail: 'Where a world supports it, every wet surface works out per fragment where each nearby lamp\'s reflected image would fall and burns it in — a real mirror image stretched by the roughness of the stone, not a blurred copy of the scene. It is off by default because it loops over the lamps for every ground fragment. The rainy city is the world built around it.',
    examples: ['reflect on', 'reflect off'],
    complete: () => ['on', 'off'],
    run(args, ctx) {
      const v = args[0];
      if (v !== 'on' && v !== 'off') { ctx.print('reflect: try on, off', 'err'); return; }
      const now = ctx.worlds.reflections(v === 'on');
      ctx.print(`reflect: wet reflections ${now ? 'on' : 'off'}.`, 'ok');
      if (now && ctx.worlds.current() !== 'rain') {
        ctx.print('(nothing here uses them yet — try the rainy city.)', 'dim');
      }
    },
  },

  bath: {
    args: '[run|drain]',
    help: 'go down to the bath cellar',
    detail: 'There is a storey below the sanctum that cannot be seen from outside the tower. With no argument this takes you down to it; "bath run" starts the tap and "bath drain" pulls the plug. The trapdoor in the sanctum floor does the same thing.',
    examples: ['bath', 'bath run'],
    complete: () => ['run', 'drain'],
    run(args, ctx) {
      if (!ctx.scene) { ctx.print('bath: no 3D scene in this view.', 'err'); return; }
      if (args[0] === 'run') { ctx.scene.runBath(); ctx.print('bath: the tap is running.', 'ok'); return; }
      if (args[0] === 'drain') { ctx.scene.drainBath(); ctx.print('bath: the plug is out.', 'ok'); return; }
      ctx.scene.goBath();
      ctx.print('bath: down the trapdoor. It is warmer than the rest of the tower.', 'ok');
    },
  },

  vista: {
    args: '<meadow|coast>',
    help: 'what the bathhouse window looks out on',
    detail: 'The casement in the bathhouse does not open onto whatever world the tower is standing in. It opens onto a meadow with the wind crossing it, or a coast with the sun going down behind the mountains. The brass lever beside the frame does the same thing.',
    examples: ['vista coast', 'vista meadow'],
    complete: (ctx) => (ctx.scene ? [...ctx.scene.VISTAS] : []),
    run(args, ctx) {
      if (!ctx.scene) { ctx.print('vista: no 3D scene in this view.', 'err'); return; }
      const v = args[0];
      if (!v) { ctx.print(`vista: currently the ${ctx.scene.vista()}. Try ${ctx.scene.VISTAS.join(', ')}.`, 'ok'); return; }
      if (!ctx.scene.VISTAS.includes(v)) { ctx.print(`vista: try ${ctx.scene.VISTAS.join(', ')}`, 'err'); return; }
      ctx.print(`vista: the window looks out on the ${ctx.scene.setVista(v as any)}.`, 'ok');
    },
  },

  quality: {
    args: '[auto|low|medium|high]',
    help: 'how hard the scene tries',
    detail: 'The tower runs at one of three settings of effort — high draws everything at full resolution, low uses chunky pixels, a handful of lights and about half the scenery. On auto it guesses from your machine and then watches the frame rate: a setting that cannot hold a playable rate is dropped, and one that is coasting is raised. Naming a setting pins it and switches the automatic side off; auto hands the choice back. The choice is remembered.',
    examples: ['quality', 'quality low', 'quality auto'],
    complete: () => QUALITY_TARGETS,
    run(args, ctx) {
      if (!ctx.scene) { ctx.print('quality: no 3D scene in this view.', 'err'); return; }
      const v = args[0]?.toLowerCase();
      if (!v) {
        const q = ctx.scene.qualityState();
        ctx.print(`quality: ${q.tier} — ${q.blurb}`, 'ok');
        ctx.print(`  ${q.pinned ? 'pinned by you' : 'chosen automatically, and adjusted as the frame rate moves'}`, 'dim');
        if (q.fps) ctx.print(`  running at ${q.fps.toFixed(0)} fps (${q.ms.toFixed(1)} ms a frame)`, 'dim');
        ctx.print(`  drawn by ${q.gpu}`, 'dim');
        return;
      }
      if (!QUALITY_TARGETS.includes(v)) { ctx.print(`quality: try ${QUALITY_TARGETS.join(', ')}`, 'err'); return; }
      const now = ctx.scene.setQuality(v === 'auto' ? null : (v as 'low' | 'medium' | 'high'));
      ctx.print(v === 'auto'
        ? `quality: back to automatic — starting at ${now}.`
        : `quality: pinned at ${now}.`, 'ok');
    },
  },

  colophon: {
    args: '',
    help: 'what this site was built with',
    detail: 'The note at the end of the book: who designed the tower, who wrote the code, and every tool it stands on. In the 3D view this is the grimoire on the lectern in the library — this command opens it there as well as printing it here.',
    examples: ['colophon', 'goto publications'],
    run(_args, ctx) {
      ctx.print(COLOPHON_TITLE.toUpperCase(), 'head');
      ctx.print('');
      for (const row of COLOPHON_BLOCK) {
        ctx.print(`  ${pad(row.field.toLowerCase(), 10)}${row.value}`, 'cmd');
        if (row.note) ctx.print(`  ${pad('', 10)}${row.note}`, 'dim');
      }
      ctx.print('');
      for (const para of COLOPHON_NOTE) { ctx.print(`  ${para}`); ctx.print(''); }
      // In the tower the book itself should open; in the ASCII console there
      // is no book, and the text above is the whole of it.
      ctx.scene?.openColophon?.();
    },
  },

  remembers: {
    args: '',
    help: 'what this site has stored in your browser',
    detail: 'Everything the tower writes down about a visit, named in plain words. All of it lives in this browser and none of it is sent anywhere. To empty it, pull the plug in the bath cellar of the 3D tower — the drain in the floor, or the "Pull the plug" row in that room.',
    examples: ['remembers', 'goto settings'],
    run(_args, ctx) {
      const REMEMBERED: [string, string][] = [
        ['lair-quality', 'the detail level you pinned'],
        ['lair-fps', 'the frame counter being shown'],
        ['lair-backdrop', 'the ground the tower stands on'],
        ['lair-hal-v2', 'a cached copy of the publication list'],
        ['lair-console-history', 'the commands you have typed'],
      ];
      let any = false;
      for (const [key, what] of REMEMBERED) {
        let v: string | null = null;
        try { v = localStorage.getItem(key); } catch {}
        if (v === null) continue;
        any = true;
        ctx.print(`  ${what}`, 'cmd');
      }
      if (!any) { ctx.print('Nothing yet — this browser holds none of it.', 'ok'); return; }
      ctx.print('');
      ctx.print('All of it stays in this browser and is never sent anywhere.', 'dim');
      ctx.print('The plug in the bath cellar of the 3D tower empties the lot.', 'dim');
    },
  },

  fps: {
    args: '[on|off]',
    help: 'show the frame counter',
    detail: 'Puts the frame rate, the frame time and the quality tier in force in the corner of the screen. Worth having on while you try the detail settings — the scene visibly coarsens either way, and this is the only way to see whether that actually bought you anything. With no argument it toggles.',
    examples: ['fps', 'fps on', 'quality low'],
    complete: () => ['on', 'off'],
    run(args, ctx) {
      if (!ctx.scene) { ctx.print('fps: no 3D scene in this view.', 'err'); return; }
      const v = args[0]?.toLowerCase();
      if (v && v !== 'on' && v !== 'off') { ctx.print('fps: try on or off.', 'err'); return; }
      const on = ctx.scene.showFps(v ? v === 'on' : !ctx.scene.fpsShown());
      ctx.print(on ? 'fps: counter shown, bottom left.' : 'fps: counter hidden.', 'ok');
    },
  },

  gpu: {
    args: '',
    help: 'what is actually drawing this',
    detail: 'Which adapter answered, and whether it is a real GPU at all. A machine with no working driver does not fail — it quietly falls back to a software rasteriser and draws every frame on the CPU at a fraction of the speed, with nothing on screen to say so. This is where you find out. Some browsers withhold the adapter\'s name for fingerprinting reasons, in which case only the WebGL version is shown.',
    examples: ['gpu', 'quality', 'perf'],
    run(_args, ctx) {
      if (!ctx.scene) { ctx.print('gpu: no 3D scene in this view.', 'err'); return; }
      const g = ctx.scene.gpu();
      if (!g.ok) {
        ctx.print('gpu: no WebGL context at all — this view cannot draw.', 'err');
        return;
      }
      ctx.print(`  adapter   ${g.renderer || '(withheld by the browser)'}`, 'dim');
      if (g.vendor) ctx.print(`  vendor    ${g.vendor}`, 'dim');
      ctx.print(`  api       ${g.webgl2 ? 'WebGL 2' : 'WebGL 1'}, ${g.antialias ? 'antialiased' : 'no antialiasing'}, textures to ${g.maxTextureSize}px`, 'dim');
      ctx.print(`  machine   ${g.cores || '?'} cores${g.memory ? `, ${g.memory} GB` : ''}`, 'dim');
      if (g.software) { ctx.print('gpu: a software rasteriser — the CPU is drawing every frame. Try `quality low`.', 'err'); return; }
      if (g.masked) { ctx.print('gpu: hardware accelerated, but the browser will not name the adapter.', 'ok'); return; }
      ctx.print('gpu: hardware accelerated.', 'ok');
    },
  },

  perf: {
    args: '',
    help: 'what the last frame cost',
    detail: 'Frame time, draw calls and — the number that usually explains a slow frame — how many lights are burning. Every visible light is another loop in every lit pixel on screen, so `sim lights` is the dial worth turning first. `quality` turns all of them at once, and `gpu` says what is drawing this.',
    examples: ['perf', 'quality low', 'sim lights 6'],
    run(_args, ctx) {
      if (!ctx.scene) { ctx.print('perf: no 3D scene in this view.', 'err'); return; }
      ctx.print(ctx.scene.perf((line) => ctx.print(line, 'dim')), 'ok');
    },
  },

  scan: {
    args: '',
    help: 'list what is currently in the scene',
    detail: 'Prints every object at the root of the 3D scene with whether it is switched on and how much it draws. Answers "is something rendering that should not be" without having to click anything.',
    examples: ['scan'],
    run(_args, ctx) {
      if (!ctx.scene) { ctx.print('scan: no 3D scene in this view.', 'err'); return; }
      ctx.print(ctx.scene.scan((line) => ctx.print(line, 'dim')), 'ok');
    },
  },

  rotate: {
    args: '<on|off>',
    help: 'idle turntable on the whole-tower view',
    detail: 'The slow turn and rise the tower does when left alone. Touching the camera stops it either way; this decides whether it starts again.',
    examples: ['rotate off', 'rotate on'],
    complete: () => ['on', 'off'],
    run(args, ctx) {
      if (!ctx.scene) { ctx.print('rotate: no 3D scene in this view.', 'err'); return; }
      const v = args[0];
      if (v !== 'on' && v !== 'off') { ctx.print('rotate: try `rotate on` or `rotate off`.', 'err'); return; }
      ctx.scene.setAutoRotate(v === 'on');
      ctx.print(`rotate: ${v}.`, 'ok');
    },
  },

  open: {
    args: '<where>',
    help: Object.keys(OPEN_TARGETS).join(', '),
    detail: 'Open one of the places this work lives — GitHub, the HAL record, the older site, or a mail window addressed to me.',
    examples: ['open github', 'open email'],
    complete: () => Object.keys(OPEN_TARGETS),
    run(args, ctx) {
      const t = args[0];
      if (!t || !(t in OPEN_TARGETS)) {
        ctx.print(`open: try ${Object.keys(OPEN_TARGETS).join(', ')}`, 'err');
        return;
      }
      window.open(OPEN_TARGETS[t], t === 'email' || t === 'text' ? '_self' : '_blank', 'noopener');
      ctx.print(`opening ${t}…`, 'ok');
    },
  },

  clear: {
    help: 'clear the screen',
    detail: 'Empty the transcript. Ctrl-L does the same thing without typing.',
    examples: ['clear'],
    run(_a, ctx) { ctx.clear(); },
  },
  exit: {
    help: 'close this console',
    detail: 'Close the console and hand the whole frame back to the tower. Escape does the same.',
    examples: ['exit'],
    run(_a, ctx) { ctx.close(); },
  },
};

/* ------------------------------- runner -------------------------------- */

export async function runCommand(raw: string, ctx: Ctx) {
  const line = raw.trim();
  if (!line) return;
  const [name, ...args] = line.split(/\s+/);
  const key = name.toLowerCase();
  const cmd = COMMANDS[key];
  if (!cmd) { ctx.print(`command not found: ${name} — type "help"`, 'err'); return; }
  if (args.some((a) => a === '--help' || a === '-h')) { printUsage(key, cmd, ctx); return; }
  await cmd.run(args, ctx);
}

/** Tab completion: the command name on the first word, then whatever that
 *  command declares for its argument. Returns the candidates plus the
 *  longest common prefix, so a unique match completes outright and an
 *  ambiguous one still fills in as far as it can. */
export function complete(line: string, ctx: Ctx): { candidates: string[]; completed: string } {
  const parts = line.split(/\s+/);
  const editingCommand = parts.length <= 1;
  const word = (editingCommand ? parts[0] : parts[parts.length - 1]) || '';
  const pool = editingCommand
    ? Object.keys(COMMANDS)
    // Every command answers --help, so offer it alongside that command's
    // own values rather than leaving it undiscoverable.
    : [...(COMMANDS[parts[0].toLowerCase()]?.complete?.(ctx) ?? []), '--help'];
  const candidates = pool.filter((c) => c.startsWith(word));
  if (!candidates.length) return { candidates: [], completed: line };

  let prefix = candidates[0];
  for (const c of candidates) {
    while (!c.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  const head = editingCommand ? '' : parts.slice(0, -1).join(' ') + ' ';
  const completed = head + prefix + (candidates.length === 1 ? ' ' : '');
  return { candidates, completed };
}

/* ---------------------------- the ASCII tower --------------------------- */

/** Six storeys, bottom to top, matching the 3D model's own order. */
const ASCII_FLOORS = FLOORS
  .slice()
  .sort((a, b) => b.index - a.index)   // top of the drawing is the top floor
  .map((f) => ({ ...f, name: FLOOR_NAMES[f.index] }));

/** A tower you can read in a monospace column. The active storey is marked
 *  with a caret and its walls drawn in double rule, so the diagram carries
 *  the same "you are here" the 3D camera does. */
export function asciiTower(active: number | null): { text: string; rows: (number | null)[] } {
  const lines: string[] = [];
  const rows: (number | null)[] = [];
  const push = (s: string, floor: number | null = null) => { lines.push(s); rows.push(floor); };

  push('        /\\        ');
  push('       /  \\       ');
  push('      /____\\      ');

  for (const f of ASCII_FLOORS) {
    const on = f.index === active;
    const wall = on ? '#' : '|';
    const num = String(f.index + 1).padStart(2, '0');
    push(`     ${on ? '+======+' : '+------+'}     `, f.index);
    push(`     ${wall}  ${on ? '**' : '::'}  ${wall}  ${on ? '<' : ' '} ${num} ${f.label}`, f.index);
    push(`     ${wall}      ${wall}     ${f.name}`, f.index);
  }
  push('     +------+     ');
  push('    /````````\\    ');
  push('   /__________\\   ');
  return { text: lines.join('\n'), rows };
}
