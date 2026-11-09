/* ================================ intents ===============================
 * Plain requests turned into the console's own commands, so "teleport the
 * tower to deep space" does what `jump space` does instead of quoting the
 * portal's brochure back at you.
 *
 * Deliberately rules, not a model: a command changes the scene, so it should
 * only run when the request named both the action and its target in words a
 * person would use. Anything that does not parse falls through to the
 * keeper's quoting search, which can never do any harm.
 *
 * Every plan comes back as a command line, and the console prints it before
 * running it — the request teaches the command.
 */

export interface Plan {
  /** The command line to run. */
  line: string;
  /** A word from the keeper before it runs, if the line alone is not enough. */
  say?: string;
}

function norm(s: string) {
  return ' ' + s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[“”]/g, '"').replace(/[^a-z0-9"'#\s-]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
}

const first = <T>(n: string, table: [RegExp, T][]): T | null => {
  for (const [re, v] of table) if (re.test(n)) return v;
  return null;
};

/* ------------------------------- the slots ------------------------------ */

const WORLDS: [RegExp, string][] = [
  [/\b(rain|rainy|raining|wet city|castle|cobble)/, 'rain'],
  [/\b(beach|seaside|sea side|shore|surf|waves)\b/, 'beach'],
  [/\b(sea ?floor|seabed|sea bed|underwater|under ?water|under the sea|ocean floor|bottom of the sea|deep sea|sea|ocean|reef|whales?|fish)\b/, 'seafloor'],
  [/\b(moon|lunar|gas giant)\b/, 'moon'],
  [/\b(forest|woods?|woodland|jungle|trees)\b/, 'forest'],
  [/\b(city|town|urban|streets)\b/, 'city'],
  [/\b(space|outer space|nebula|stars|asteroids?|cosmos|galaxy|orbit)\b/, 'space'],
];

const FLOOR_WORDS: [RegExp, string][] = [
  [/\b(library|shelves|publications page|papers page)\b/, 'publications'],
  [/\b(observatory|telescope|contact page)\b/, 'contact'],
  [/\b(kitchen|cauldron|now page)\b/, 'now'],
  [/\b(quarters|bedroom|bed|sleeping|about page)\b/, 'about'],
  [/\b(laboratory|lab|workbench|projects page)\b/, 'projects'],
  [/\b(sanctum|portal room|gate room|elsewhere)\b/, 'elsewhere'],
  [/\b(bath|bathhouse|cellar|basement|settings)\b/, 'settings'],
  [/\b(home|top|whole tower|outside|ground floor|start)\b/, 'home'],
];

const LEVELS: [RegExp, string][] = [
  [/\b(auto|automatic|automatically|default|you choose|decide)\b/, 'auto'],
  [/\b(low|lower|lowest|less|least|min|minimum|reduce|decrease|cheap|cheaper|faster|lighter|potato)\b/, 'low'],
  [/\b(medium|middle|mid|moderate|balanced)\b/, 'medium'],
  [/\b(high|higher|highest|max|maximum|best|ultra|full|increase|more|prettier|beautiful)\b/, 'high'],
];

function onOff(n: string): 'on' | 'off' | null {
  if (/\b(off|disable|deactivate|stop|remove|hide|without|kill|no more|get rid)\b/.test(n)) return 'off';
  if (/\b(on|enable|activate|start|show|display|add|with|turn on|want)\b/.test(n)) return 'on';
  return null;
}

/* -------------------------------- the plan ------------------------------ */

const PAPERS = /\b(papers?|publications?|articles?|preprints?|bibliography|pubs)\b/;
const MOVE = /\b(go|goto|take|bring|walk|climb|head|visit|show|move|fly|navigate|enter|open|let'?s see|get me)\b/;
const TELEPORT = /\b(teleport|jump|travel|transport|warp|send|move|take|bring|put|switch|change|go|fly|visit|step)\b/;

/** A plain request as a command line, or null if it is not one. */
export function planCommand(raw: string): Plan | null {
  const n = norm(raw);

  /* ---- small talk ---- */
  if (/^ (hi|hey|hello|bonjour|salut|good (morning|afternoon|evening)|greetings)\b/.test(n)) return { line: 'hello' };
  if (/\b(thanks|thank you|merci|cheers)\b/.test(n)) return { line: '', say: 'The keeper tips his hat. Ask away, any time.' };
  if (/\bhow are you\b/.test(n)) return { line: '', say: 'Well enough, for a man who lives in a tower. The kettle is on.' };
  if (/\b(what can you do|what do you know|what commands|how does this work|help me)\b/.test(n)) return { line: 'help' };

  /* ---- his own doctorate, not his doctoral students ---- */
  if (/\b(your|his|ammar'?s) (phd|thesis|doctorate|studies|education)\b|\bwhere did (you|he) (study|graduate)\b/.test(n)) return { line: 'cat cv.txt' };

  /* ---- "the second one", "the 3rd paper" → a result number ---- */
  const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
  const ord = n.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|(\d{1,3})(?:st|nd|rd|th))\b/);
  const nth = ord ? (ord[2] ?? String(ORDINALS.indexOf(ord[1]) + 1)) : null;
  if (nth && /\b(cite|bibtex|citation|reference)\b/.test(n)) return { line: `cite ${nth}` };
  if (nth && /\b(show|open|details?|more|tell me about|full record)\b/.test(n)) return { line: `show ${nth}` };

  /* ---- papers: everything that names them is about them, so no "show me
     papers about space" ever teleports the tower ---- */
  if (PAPERS.test(n) || /\b(cite|bibtex|citation)\b/.test(n)) {
    const num = n.match(/\b(?:number|no|#|paper|result|n)?\s*#?(\d{1,3})\b(?! ?(?:papers|publications))/);
    if (/\b(cite|bibtex|citation|reference)\b/.test(n) && num && Number(num[1]) < 1000) return { line: `cite ${num[1]}` };
    const fmt = n.match(/\b(bib|bibtex|csv|spreadsheet|excel)\b/);
    if (/\b(export|download|save)\b/.test(n) && fmt) {
      const f = /csv|spreadsheet|excel/.test(fmt[1]) ? 'csv' : 'bib';
      const about = n.match(/\b(?:about|on|with|for|mentioning)\s+(.+?)\s*$/);
      return { line: `export ${f}${about ? ' ' + about[1].trim() : ''}` };
    }
    if (/\b(random|any|surprise|pick one)\b/.test(n)) return { line: 'random' };
    if (/\b(how many|count|number of|stats|statistics|per year|by year|over the years)\b/.test(n)) return { line: 'stats' };
    const year = n.match(/\b((?:19|20)\d\d)\b/);
    if (year) return { line: `pubs ${year[1]}` };
    const by = n.match(/\b(?:by|with|co-?authored (?:with|by)|written with|together with)\s+([a-z][a-z' -]+?)\s*$/);
    if (by && !/\b(you|him|ammar|mian)\b/.test(by[1])) {
      const surname = by[1].trim().split(/\s+/).pop()!;
      return { line: `pubs ${surname}` };
    }
    if (/\b(all|every|full|complete|entire|whole)\b/.test(n)) return { line: 'pubs --all' };
    if (/\b(latest|recent|newest|last|new|current)\b/.test(n)) return { line: 'pubs', say: 'Newest first:' };
    return null;   // a topic search — the quoting search ranks those
  }

  /* ---- mail ---- */
  if (/\b(send|write|compose|draft|drop)\b.*\b(mail|email|e-mail|message|note|line)\b|\b(email|mail) (him|ammar|you|the wizard|the keeper)\b/.test(n)) {
    const subj = raw.match(/subject\s*(?:line)?\s*[:=]?\s*["“']?([^"”']+)["”']?/i)
      ?? raw.match(/\babout\s+["“']?(.+?)["”']?\s*\??$/i);
    return { line: `mail${subj ? ' ' + subj[1].trim() : ''}` };
  }
  if (/\b(copy|clipboard)\b.*\b(email|address|mail)\b/.test(n)) return { line: 'copy email' };
  if (/\b(share|copy|send)\b.*\b(link|url|page|this|view)\b|\b(permalink)\b/.test(n)) return { line: 'share' };

  /* ---- collaborators ---- */
  if (/\b(co-?authors?|collaborat\w*|work(s|ed)? with|colleagues?)\b/.test(n)) {
    const who = n.match(/\b(?:with|is)\s+([a-z][a-z' -]+?)\s*$/);
    return { line: who && !/\b(you|him|ammar|mian|most|often)\b/.test(who[1]) ? `coauthors ${who[1].trim()}` : 'coauthors' };
  }

  /* ---- the scene ---- */
  const level = first(n, LEVELS);
  if (/\b(quality|details?|graphics|effort|fidelity)\b/.test(n)) return { line: level ? `quality ${level}` : 'quality' };
  if (/\b(slow|laggy|lagging|lags|stutter\w*|choppy|jerky|struggling|hot|fan)\b/.test(n)) {
    return { line: 'quality low', say: 'Easing off, then.' };
  }
  if (/\b(pixel\w*|resolution|chunky|retro|blocky|sharp(er)?)\b/.test(n)) {
    const v = n.match(/\b([0246])\b/)?.[1]
      ?? (/\b(auto|default)\b/.test(n) ? 'auto' : /\b(sharp|sharper|full|crisp|none|no pixel)/.test(n) ? '0' : /\b(chunky|retro|blocky|more|max)\b/.test(n) ? '6' : null);
    return v ? { line: `pixel ${v}` } : null;
  }
  if (/\breflect\w*\b/.test(n)) { const v = onOff(n); return v ? { line: `reflect ${v}` } : null; }
  if (/\b(fps|frame ?rate|frame counter|frames per second)\b/.test(n)) {
    const v = onOff(n);
    return { line: v ? `fps ${v}` : 'fps' };
  }
  if (/\b(rotat\w*|spin\w*|turntable|turn around)\b/.test(n)) { const v = onOff(n) ?? 'on'; return { line: `rotate ${v}` }; }
  if (/\b(shell|outline|ghost)\b/.test(n)) {
    const m = n.match(/\b(off|ghost|solid|auto)\b/);
    return m ? { line: `shell ${m[1]}` } : null;
  }
  if (/\b(night|dark|darker|evening|moonlight)\b/.test(n) && /\b(make|turn|switch|set|light|lighting|want|show|it)\b/.test(n)) return { line: 'light night' };
  if (/\b(day|daytime|daylight|bright|brighter|morning|sunny|sunlight)\b/.test(n) && /\b(make|turn|switch|set|light|lighting|want|show|it)\b/.test(n)) return { line: 'light day' };
  if (/\b(lights?|lighting)\b/.test(n) && /\b(auto|normal|default|real)\b/.test(n)) return { line: 'light auto' };
  if (/\bbath\b/.test(n) || /\bplug\b/.test(n)) {
    if (/\b(drain|plug|empty)\b/.test(n)) return { line: 'bath drain' };
    if (/\b(run|fill|tap|water|draw)\b/.test(n)) return { line: 'bath run' };
  }
  if (/\b(window|vista)\b/.test(n)) {
    const v = n.match(/\b(meadow|coast)\b/);
    if (v) return { line: `vista ${v[1]}` };
  }

  /* ---- views ---- */
  if (/\b(3d|three ?d|3 d)\b/.test(n) && /\b(view|switch|show|go|see|open|back|want|mode|version)\b/.test(n)) return { line: 'view 3d' };
  if (/\b(text (version|page|only|mode)|plain (text|version|page)|screen reader|accessible)\b/.test(n)) return { line: 'view text' };
  if (/\b(ascii|console version|text console|terminal version)\b/.test(n)) return { line: 'view ascii' };
  if (/^ (clear|clean|wipe|empty)( the)?( screen| console| log)? $/.test(n)) return { line: 'clear' };
  if (/\b(close|exit|quit|leave) (the |this )?(console|terminal)\b/.test(n)) return { line: 'exit' };

  /* ---- elsewhere ---- */
  if (/\b(github|hal|old site|older site)\b/.test(n) && /\b(open|show|take|link|go|visit|see)\b/.test(n)) {
    const t = n.includes('github') ? 'github' : n.includes('hal') ? 'hal' : 'site';
    return { line: `open ${t}` };
  }
  if (/\b(stor\w*|remember\w*|cookies?|track\w*|privacy|my data|local ?storage)\b/.test(n)) return { line: 'remembers' };

  /* ---- worlds before floors: "the city" is a world, "the portal" is a room */
  const world = first(n, WORLDS);
  const homeWorld = /\b(teleport|jump|warp|bring|send|take)\b.*\b(back|home)\b|\b(leave|exit) (this|the) world\b|\bno (world|backdrop)\b/.test(n);
  if (homeWorld && !first(n, FLOOR_WORDS.slice(0, -1))) return { line: 'jump none' };
  if (world && TELEPORT.test(n)) return { line: `jump ${world}` };

  const floor = first(n, FLOOR_WORDS);
  if (floor && MOVE.test(n)) return { line: `goto ${floor}` };

  /* ---- people ---- */
  if (/\b(students?|phds?|doctoral|supervis\w*|interns?|masters?|advisees?)\b/.test(n)) {
    if (/\b(current|currently|now|ongoing|in progress|today)\b/.test(n)) return { line: 'students current' };
    if (/\b(former|past|previous|graduated|defended|alumni|finished)\b/.test(n)) return { line: 'students past' };
    if (/\b(masters?|m2|interns?|internships?)\b/.test(n)) return { line: 'students masters' };
    if (/\b(phds?|doctoral|doctorants?|theses|thesis)\b/.test(n) && !/\byour (phd|thesis)\b/.test(n)) return { line: 'students phd' };
  }
  if (/\b(doing|up to|working on)\b.*\b(now|these days|currently|this year|lately|at the moment)\b|\bwhere are you\b|\b(now|currently)\b.*\b(where|based)\b/.test(n)) {
    return { line: 'now' };
  }

  return null;
}
