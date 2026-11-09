/* ================================= ask ==================================
 * The keeper answering a question in plain words, about this site and only
 * this site.
 *
 * Everything the tower knows is already in the bundle — the profile, the
 * students, the projects, the HAL snapshot, the storeys and the worlds — so
 * answering is a matter of finding the right few pieces of it and printing
 * them, not of writing new sentences. That keeps it honest: every line the
 * keeper says is a line from the site, and he cannot invent a paper.
 *
 * Two ways of finding them:
 *
 *   · keywords (BM25 over the passages, with a small table of synonyms so
 *     "supervise" finds the students). Free, instant, always on.
 *   · meaning — a 23 MB sentence-embedding model (all-MiniLM-L6-v2) run in
 *     the browser with transformers.js, so "who works with you?" finds the
 *     students too. Only ever loaded after the visitor says so (`ask on`),
 *     because it is a download from huggingface.co. The browser caches it;
 *     the choice is remembered, and `ask off` forgets both.
 *
 * Nothing typed here leaves the browser either way.
 */
import { PROFILE, CONTACT } from '../data/profile';
import { cachedHalPublications, type HalDoc } from '../data/hal';
import students from '../data/students.json';
import projects from '../data/projects.json';
import { FLOORS } from '../router';
import { WORLD_LABELS, WORLD_BLURBS } from '../data/worlds';
import { COLOPHON_BLOCK, COLOPHON_NOTE } from '../data/colophon';
import type { Student } from '../data/studentGroups';
import { planCommand } from './intents';

/* ------------------------------- passages ------------------------------ */

export type Topic =
  | 'about' | 'now' | 'career' | 'contact' | 'student' | 'project'
  | 'publication' | 'floor' | 'world' | 'colophon';

export interface Passage {
  id: string;
  topic: Topic;
  /** What is matched against — the facts, framed in English so a question
   *  phrased in English lands on the French thesis titles too. */
  text: string;
  /** What is printed, as [line, style] pairs. */
  lines: [string, string?][];
  doc?: HalDoc;
}

const p = (id: string, topic: Topic, text: string, lines: [string, string?][], doc?: HalDoc): Passage =>
  ({ id, topic, text, lines, doc });

export function buildPassages(): Passage[] {
  const out: Passage[] = [];

  out.push(p('about', 'about',
    `Who is ${PROFILE.name}? ${PROFILE.role}. Research interests: ${PROFILE.research}. ${PROFILE.affiliation}.`,
    [[`${PROFILE.name} — ${PROFILE.role}`], [PROFILE.affiliation, 'dim'], [PROFILE.summary]]));
  out.push(p('now', 'now',
    `What is he doing now, this year, currently? ${PROFILE.currently}`,
    [[PROFILE.currently]]));

  for (const x of PROFILE.positions) {
    out.push(p(`pos-${x.year}`, 'career', `Position, job, career, ${x.role === 'Doctorant' ? 'PhD, ' : ''}${x.year}: ${x.role} at ${x.org}.`,
      [[`${x.year.padEnd(11)} ${x.role}`], [`${' '.repeat(12)}${x.org}`, 'dim']]));
  }
  for (const x of PROFILE.education) {
    out.push(p(`edu-${x.year}`, 'career', `Education, degree, studied, ${x.role === 'Doctorat' ? 'PhD, ' : ''}${x.year}: ${x.role}, ${x.org}.`,
      [[`${x.year.padEnd(11)} ${x.role}`], [`${' '.repeat(12)}${x.org}`, 'dim']]));
  }

  out.push(p('contact', 'contact',
    `Get in touch: send an email to ${CONTACT.email}. Office address: ${CONTACT.office}.`,
    [[`email    ${CONTACT.email}`], [`office   ${CONTACT.office}`]]));
  out.push(p('profiles', 'contact',
    `Online profiles: code on GitHub ${CONTACT.github}, papers on the HAL open archive.`,
    [[`github   ${CONTACT.github}`], [`hal      ${CONTACT.hal}`]]));

  for (const s of students as Student[]) {
    const what = s.kind === 'PhD' ? 'PhD student, doctoral thesis' : "Master's student, M2 internship";
    const when = s.status === 'current' ? 'currently supervised, in progress' : 'past student, finished';
    out.push(p(`stu-${s.name}-${s.kind}`, 'student',
      `${what} supervised by ${PROFILE.name}: ${s.name}, ${s.period}, ${when}. Topic: ${s.topic}. ${s.note ?? ''}`,
      [[`${s.name.padEnd(22)}${s.kind.padEnd(6)}${s.period}`], [`${' '.repeat(2)}${s.topic}`, 'dim'],
       ...(s.note ? [[`  ${s.note}`, 'dim'] as [string, string]] : [])]));
  }

  for (const x of projects as any[]) {
    out.push(p(`proj-${x.name}`, 'project',
      `Software project, open-source tool, code: ${x.name}. ${x.description}`,
      [[`${x.name} — ${x.description}`], [x.demo ? `demo: ${x.demo}` : x.url, 'dim']]));
  }

  for (const d of cachedHalPublications() ?? []) {
    out.push(p(`pub-${d.id}`, 'publication',
      `Publication, paper (${d.kind}, ${d.year}): ${d.title}. Authors: ${d.authors}. ${d.venue}.`,
      [], d));
  }

  for (const f of FLOORS) {
    out.push(p(`floor-${f.slug}`, 'floor',
      `The tower's storey ${f.title}, the ${f.label} page of this site.`,
      [[`${f.title} — ${f.label}`], [`  goto ${f.slug}`, 'dim']]));
  }
  for (const [k, label] of Object.entries(WORLD_LABELS)) {
    out.push(p(`world-${k}`, 'world',
      `A world through the portal, a backdrop for the tower: ${label}. ${WORLD_BLURBS[k] ?? ''}`,
      [[`${label} — ${WORLD_BLURBS[k] ?? ''}`], [`  view 3d, then jump ${k}`, 'dim']]));
  }

  out.push(p('colophon', 'colophon',
    'How this site was built, made, designed; who made it; technology stack: '
      + COLOPHON_BLOCK.map((r) => `${r.field} ${r.value} ${r.note ?? ''}`).join('. '),
    COLOPHON_BLOCK.map((r) => [`${r.field.padEnd(8)} ${r.value}`] as [string])));
  out.push(p('colophon-note', 'colophon', COLOPHON_NOTE.join(' '),
    COLOPHON_NOTE.map((l) => [l] as [string])));

  return out;
}

/* ------------------------------- keywords ------------------------------ */

const STOP = new Set((
  'a an the of to in on at for and or is are was were be been do does did what who whom whose which '
  + 'how when where why can could would should will shall i you he she it we they me him her us them '
  + 'my your his its our their this that these those there here with about from by as any some all '
  + 'tell show give list please much many more most have has had get got also just than then so if '
  + 'le la les un une des de du et ou est sont en au aux pour par sur avec qui que quoi quel quelle '
  + 'ammar mian'
).split(' '));

/** A word and the words that should count as it. Applied to the passages
 *  and the question alike, so each side only needs to use one of them. */
const SYNONYMS: Record<string, string[]> = {
  student: ['students', 'supervise', 'supervises', 'supervised', 'supervision', 'supervising',
    'advisee', 'advisees', 'mentee', 'mentees', 'stagiaire'],
  phd: ['phds', 'thesis', 'theses', 'doctoral', 'doctorate', 'doctorant', 'doctorat', 'these'],
  internship: ['intern', 'interns', 'internships', 'master', 'masters', 'm2', 'stage'],
  publication: ['publications', 'paper', 'papers', 'article', 'articles', 'publish', 'published', 'preprint',
    'journal', 'conference', 'proceedings', 'bibliography'],
  contact: ['email', 'mail', 'e-mail', 'reach', 'touch', 'write', 'message', 'courriel'],
  office: ['where', 'address', 'located', 'location', 'based', 'lives', 'bureau'],
  project: ['projects', 'tool', 'tools', 'software', 'code', 'library', 'repository', 'repo', 'program'],
  research: ['work', 'works', 'working', 'interests', 'interest', 'field', 'study', 'studies', 'topic', 'topics',
    'recherche', 'specialty', 'expertise'],
  career: ['position', 'positions', 'job', 'jobs', 'career', 'employment', 'worked', 'cv', 'resume',
    'education', 'degree', 'studied', 'diploma', 'postdoc'],
  now: ['currently', 'current', 'today', 'year', 'nowadays', 'delegation'],
  world: ['worlds', 'portal', 'backdrop', 'backdrops', 'jump', 'teleport'],
  colophon: ['built', 'build', 'made', 'designed', 'stack', 'technology', 'technologies', 'colophon', 'claude'],
  floor: ['storey', 'storeys', 'floors', 'room', 'rooms', 'page', 'pages', 'tower'],
};
const CANON = new Map<string, string>();
for (const [k, vs] of Object.entries(SYNONYMS)) { CANON.set(k, k); for (const v of vs) CANON.set(v, k); }

export function tokens(s: string): string[] {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map((t) => CANON.get(t) ?? (t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t));
}

class Bm25 {
  private docs: Map<string, number>[];
  private lens: number[];
  private avg: number;
  private df = new Map<string, number>();
  constructor(texts: string[]) {
    this.docs = texts.map((t) => {
      const m = new Map<string, number>();
      for (const w of tokens(t)) m.set(w, (m.get(w) ?? 0) + 1);
      return m;
    });
    this.lens = this.docs.map((m) => [...m.values()].reduce((a, b) => a + b, 0));
    this.avg = this.lens.reduce((a, b) => a + b, 0) / Math.max(1, this.lens.length);
    for (const m of this.docs) for (const w of m.keys()) this.df.set(w, (this.df.get(w) ?? 0) + 1);
  }
  score(q: string): number[] {
    const qs = [...new Set(tokens(q))];
    const N = this.docs.length, k1 = 1.2, b = 0.75;
    return this.docs.map((m, i) => {
      let s = 0;
      for (const w of qs) {
        const f = m.get(w);
        if (!f) continue;
        const n = this.df.get(w)!;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * this.lens[i] / this.avg));
      }
      return s;
    });
  }
}

/* -------------------------------- meaning ------------------------------ */

export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
export const MODEL_SIZE = '23 MB';
/** Model plus the ONNX runtime it runs on, as actually transferred. */
export const DOWNLOAD_SIZE = 'about 28 MB';
/** Where transformers.js keeps downloaded models (Cache Storage). */
export const MODEL_CACHE = 'transformers-cache';
export const PREF_KEY = 'lair-ask';

type Embed = (texts: string[]) => Promise<Float32Array[]>;

let embedPromise: Promise<Embed> | null = null;

/** The model, loaded once. `onProgress` gets 0–1 while files download. */
export function loadEmbedder(onProgress?: (frac: number) => void, device: 'wasm' | 'cpu' = 'wasm'): Promise<Embed> {
  if (embedPromise) return embedPromise;
  embedPromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');
    env.allowLocalModels = false;
    const seen = new Map<string, [number, number]>();
    const extractor = await pipeline('feature-extraction', MODEL_ID, {
      dtype: 'q8',
      device,
      progress_callback: (e: any) => {
        if (e?.status !== 'progress' || !e.file || !e.total) return;
        seen.set(e.file, [e.loaded, e.total]);
        let l = 0, t = 0;
        for (const [a, b] of seen.values()) { l += a; t += b; }
        onProgress?.(t ? l / t : 0);
      },
    });
    return async (texts: string[]) => {
      const out = await extractor(texts, { pooling: 'mean', normalize: true });
      const [n, dim] = out.dims as number[];
      const data = out.data as Float32Array;
      return Array.from({ length: n }, (_, i) => data.slice(i * dim, (i + 1) * dim));
    };
  })();
  embedPromise.catch(() => { embedPromise = null; });
  return embedPromise;
}

/** The kind of thing a question names outright, if it names one. */
const TOPIC_OF: Record<string, Topic> = {
  student: 'student', internship: 'student', publication: 'publication', project: 'project',
  contact: 'contact', office: 'contact', career: 'career', world: 'world', colophon: 'colophon',
  floor: 'floor', now: 'now', research: 'about',
};
function askedTopics(q: string): Set<Topic> {
  return new Set(tokens(q).map((t) => TOPIC_OF[t]).filter(Boolean));
}

function addressed(q: string) {
  return q
    .replace(/\b(your|his)\b/gi, `${PROFILE.name}'s`)
    .replace(/\b(the )?(wizard|keeper|sorcerer|professor|owner)\b/gi, PROFILE.name)
    .replace(/\b(you(rself)?|him|he)\b/gi, PROFILE.name);
}

function dot(a: Float32Array, b: Float32Array) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/* -------------------------------- search ------------------------------- */

export interface Hit { passage: Passage; score: number }

export class Knowledge {
  readonly passages: Passage[];
  private bm25: Bm25;
  private vectors: Float32Array[] | null = null;

  constructor(passages = buildPassages()) {
    this.passages = passages;
    this.bm25 = new Bm25(passages.map((x) => x.text));
  }

  get understands() { return this.vectors !== null; }

  /** Embed every passage once; after this, search uses meaning as well. */
  async learn(embed: Embed) {
    if (this.vectors) return;
    const vs: Float32Array[] = [];
    for (let i = 0; i < this.passages.length; i += 16) {
      vs.push(...await embed(this.passages.slice(i, i + 16).map((x) => x.text)));
    }
    this.vectors = vs;
  }

  async search(q: string, embed?: Embed | null): Promise<Hit[]> {
    const kw = this.bm25.score(q);
    const kwMax = Math.max(0, ...kw);

    if (!this.vectors || !embed) {
      if (kwMax <= 0) return [];
      return this.passages
        .map((passage, i) => ({ passage, score: kw[i] / kwMax * (passage.topic === 'floor' ? 0.8 : 1) }))
        .filter((h) => h.score >= 0.55)
        .sort((a, b) => b.score - a.score);
    }

    /* Meaning first, with the keywords as a second opinion that also rescues
       proper names and title words — a model this small has no idea who
       "Lerda" is. Questions are put to the keeper as "you"; the passages
       are written about him by name, so the question is too. */
    const [qv] = await embed([addressed(q)]);
    const asked = askedTopics(q);
    const scored = this.passages.map((passage, i) => ({
      passage,
      score: dot(qv, this.vectors![i])
        + (kwMax > 0 ? 0.35 * kw[i] / kwMax : 0)
        + (asked.has(passage.topic) ? 0.12 : 0)
        // A storey only points at a page; the page's contents answer better.
        - (passage.topic === 'floor' ? 0.1 : 0),
    })).sort((a, b) => b.score - a.score);
    const first = scored[0];
    if (!first || first.score < 0.35) return [];
    /* A question whose answer is a list ("your students", "papers on
       sonar") should get the list, not the one row that happened to edge
       ahead — so the top hit's own kind gets a wider window. */
    return scored.filter((h) => h.score >= Math.max(0.3,
      first.score - (h.passage.topic === first.passage.topic ? 0.25 : 0.15)));
  }
}

/* ------------------------------- the command ---------------------------- */

type Printer = {
  print: (line: string, cls?: string) => HTMLElement | void;
  results?: HalDoc[];
};

const INTRO: Record<Topic, string> = {
  about: 'From the sleeping quarters:',
  now: 'This year:',
  career: 'From the CV:',
  contact: 'From the observatory:',
  student: 'From the kitchen, where the students simmer:',
  project: 'From the laboratory bench:',
  publication: 'Off the library shelves:',
  floor: 'Storeys of the tower:',
  world: 'Through the portal:',
  colophon: 'From the colophon:',
};

const NEXT: Record<Topic, string> = {
  about: 'cat cv.txt', now: 'cat cv.txt', career: 'cat cv.txt',
  contact: 'cat contact.txt',
  student: 'cat students.txt',
  project: 'ls',
  publication: 'cite <n> for BibTeX · pubs <terms> to search',
  floor: 'goto <floor>',
  world: 'view 3d, then jump <world>',
  colophon: 'colophon',
};

let knowledge: Knowledge | null = null;
let hinted = false;

function wanted(): boolean {
  try { return localStorage.getItem(PREF_KEY) === 'on'; } catch { return false; }
}

/** The model if the visitor has said yes to it, loading it (from the
 *  browser's cache, after the first time) on the way. Null otherwise, or if
 *  it would not load — the keywords still answer. */
async function understanding(ctx: Printer, announce: boolean): Promise<Embed | null> {
  if (!wanted()) return null;
  const k = (knowledge ??= new Knowledge());
  try {
    const label = 'the keeper fetches his spectacles…';
    const row = (announce || !k.understands) ? ctx.print(label, 'dim') : undefined;
    // One line, updated in place: the download runs on while you type.
    const embed = await loadEmbedder((f) => {
      if (row) row.textContent = `${label} ${Math.round(f * 100)}%`;
    });
    if (row) row.textContent = `${label} reading the shelves`;
    await k.learn(embed);
    if (row) row.textContent = `${label} done`;
    return embed;
  } catch (err) {
    ctx.print(`the model would not load (${err instanceof Error ? err.message : String(err)}) — answering on keywords.`, 'err');
    return null;
  }
}

function render(hits: Hit[], ctx: Printer) {
  // Grouped by kind, in the order the kinds first appear: the best answer
  // leads, and at most one other kind of thing follows it.
  const groups = new Map<Topic, Passage[]>();
  for (const h of hits) {
    const t = h.passage.topic;
    if (!groups.has(t) && groups.size >= 2) continue;
    const g = groups.get(t) ?? [];
    if (g.length < (t === 'publication' ? 8 : 6)) g.push(h.passage);
    groups.set(t, g);
  }
  for (const [topic, ps] of groups) {
    ctx.print(INTRO[topic], 'head');
    if (topic === 'publication') {
      const docs = ps.map((x) => x.doc!);
      ctx.results = docs;
      docs.forEach((d, i) => ctx.print(`  ${String(i + 1).padStart(3)}  ${String(d.year || 'n.d.').padEnd(6)} ${d.title}`, 'hit'));
    } else {
      for (const x of ps) for (const [line, cls] of x.lines) ctx.print(`  ${line}`, cls ?? '');
    }
    ctx.print('');
  }
  const lead = [...groups.keys()][0];
  if (lead) ctx.print(`→ ${NEXT[lead]}`, 'dim');
}

/** A question that only names a kind of thing — "students?", "your
 *  projects", "list all publications" — gets the whole of it, from the
 *  command that already prints it, rather than the few rows that happened
 *  to score highest. */
const FILLER = new Set(['wizard', 'keeper', 'sorcerer', 'list', 'name', 'names', 'everyone', 'everything', 'every', 'see', 'whole', 'full', 'complete', 'each']);
const TOPIC_COMMAND: Record<string, string> = {
  student: 'students', phd: 'students phd', internship: 'students masters',
  publication: 'pubs', project: 'ls', contact: 'cat contact.txt', office: 'cat contact.txt',
  career: 'cat cv.txt', research: 'cat cv.txt', colophon: 'colophon', now: 'now',
};
export function wordTopic(q: string): string | null {
  const ts = [...new Set(tokens(q).filter((t) => !FILLER.has(t)))];
  return ts.length === 1 ? TOPIC_COMMAND[ts[0]] ?? null : null;
}

export async function askCommand(args: string[], ctx: Printer, run?: (line: string) => Promise<void>) {
  const sub = args.length === 1 ? args[0].toLowerCase() : '';

  if (sub === 'on') {
    try { localStorage.setItem(PREF_KEY, 'on'); } catch {}
    ctx.print(`Fetching the keeper's spectacles: a ${MODEL_SIZE} sentence model (${MODEL_ID})`, 'dim');
    ctx.print('from huggingface.co, plus about 5 MB of runtime. It runs in this browser — what', 'dim');
    ctx.print('you ask never leaves it — and the browser keeps it, so this happens once.', 'dim');
    if (await understanding(ctx, true)) ctx.print('He follows your meaning now, not just your words.', 'ok');
    return;
  }
  if (sub === 'off') {
    try { localStorage.removeItem(PREF_KEY); } catch {}
    try { await caches.delete(MODEL_CACHE); } catch {}
    ctx.print('Spectacles off, and the model deleted from this browser. Keywords only.', 'ok');
    return;
  }

  const q = args.join(' ').trim();
  if (!q) {
    const on = wanted();
    ctx.print(on ? 'The keeper reads meaning: the sentence model is on.' : 'The keeper reads keywords only.', 'head');
    ctx.print('Ask about the work, the students, the papers, the projects, how to get', 'dim');
    ctx.print('in touch, or the tower itself — or tell him what to do: "take me to the', 'dim');
    ctx.print('moon", "make it night", "papers from 2021". No need to type `ask` first.', 'dim');
    ctx.print('Every answer is quoted from this site, never made up.', 'dim');
    ctx.print('');
    ctx.print(on
      ? '`ask off` puts the model away and deletes it from this browser.'
      : `\`ask on\` lets him follow phrasing too: a one-time download of ${DOWNLOAD_SIZE}, run locally.`, 'dim');
    return;
  }

  /* A request for something the console can do: do it, and show the
     command that did it, so the next time it can be typed directly. */
  const plan = run ? (planCommand(q) ?? (wordTopic(q) ? { line: wordTopic(q)! } : null)) : null;
  if (plan) {
    if (plan.say) ctx.print(plan.say, 'dim');
    if (plan.line) {
      ctx.print(`→ ${plan.line}`, 'dim');
      await run!(plan.line);
    }
    return;
  }

  const embed = await understanding(ctx, false);
  const k = (knowledge ??= new Knowledge());
  const hits = await k.search(q, embed);
  if (!hits.length) {
    ctx.print("The keeper strokes his beard. Nothing in the tower answers that —", 'dim');
    ctx.print('he only knows this site. `help` lists what he can do.', 'dim');
  } else {
    render(hits, ctx);
  }
  if (!embed && !hinted && !wanted()) {
    hinted = true;
    ctx.print(`(matched on keywords — \`ask on\` lets him follow phrasing, a one-time download of ${DOWNLOAD_SIZE}, run in this browser)`, 'dim');
  }
}
