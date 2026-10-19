// Each screen is a function from data to an HTML string. All her text goes through esc().
import {
  KIND_ORDER,
  MOOD_ORDER,
  THEME_ORDER,
  displayTitle,
  esc,
  firstLines,
  formatWritten,
  formatDateTime,
  kindLabel,
  metaLine,
  num,
} from './format.js';
import { browseHash, pieceHash, shelfHash } from './route.js';
import {
  HEBREW_GROUP,
  NUMBER_GROUP,
  firstLineOf,
  letterGroup,
  matchesFilters,
  shelfMap,
  sortFirstLines,
  sortForBrowse,
  todaysPoem,
} from './search.js';
import type { Filters, Library, Piece, Req, Work } from './types.js';

const EMPTY = '<p class="empty">Nothing here yet</p>';

export function titleHtml(p: Piece, cls: string): string {
  const t = displayTitle(p);
  return `<div class="${cls}${t.italic ? ' untitled' : ''}" dir="auto">${esc(t.text)}</div>`;
}

export function cardHtml(w: Work): string {
  const p = w.top;
  const badge =
    w.versions.length > 1 ? `<span class="badge">${w.versions.length} versions</span>` : '';
  const preview = firstLines(p.body, 2);
  return `<a class="card" href="${pieceHash(p.drive_id)}">
    ${titleHtml(p, 'card-title')}
    <div class="card-meta"><span>${esc(metaLine(p))}</span>${badge}</div>
    ${preview ? `<div class="card-preview" dir="auto">${esc(preview)}</div>` : ''}
  </a>`;
}

export function cardsHtml(works: Work[]): string {
  return works.length ? `<div class="cards">${works.map(cardHtml).join('')}</div>` : EMPTY;
}

export function searchResultsHtml(found: Work[]): string {
  if (found.length === 0) return '<p class="count">0 found</p>' + EMPTY;
  return `<p class="count">${num(found.length)} found</p>${cardsHtml(found.slice(0, 50))}`;
}

export interface RollNav {
  canBack: boolean;
  canNext: boolean;
}

export interface HomeUi {
  query: string;
  rolled: Piece | null;
  nav: RollNav;
  trashOpen: boolean;
  notesOpen: boolean;
  generalMode: 'claude' | 'mine' | null;
  mineOpen: boolean;
  install: 'button' | 'hint' | 'none';
  seenNote: string;
  noteDraft: string;
  freshReplies: boolean;
}

/** The heading, unless the piece is untitled: then its first line is already the body's start. */
export function headingHtml(p: Piece, cls: string): string {
  return displayTitle(p).italic ? '' : titleHtml(p, cls);
}

function poemCard(poem: Piece, label: string, extra = ''): string {
  return `<div class="today-wrap">
      <a class="card today" href="${pieceHash(poem.drive_id)}">
        <div class="label">${label}</div>
        ${headingHtml(poem, 'card-title')}
        <div class="card-meta"><span>${esc(metaLine(poem))}</span></div>
        <div class="body" dir="auto">${esc(poem.body)}</div>
      </a>${extra}
    </div>`;
}

/** The card plus one quiet line: how many poems she hasn't seen yet (a plain count). */
export function todaySlotHtml(
  lib: Library,
  rolled: Piece | null,
  nav: RollNav,
  seenNote = '',
): string {
  return `${todayCardHtml(lib, rolled, nav)}<p class="caption tight seen-line">${esc(seenNote)}</p>`;
}

/** Today's poem, or the poem she just rolled (with a quiet way back to today's). */
function todayCardHtml(lib: Library, rolled: Piece | null, nav: RollNav): string {
  if (rolled) {
    return poemCard(
      rolled,
      '🎲 Rolled poem',
      `<div class="roll-nav">
        <button type="button" class="quiet-btn" data-act="roll-back" ${nav.canBack ? '' : 'disabled'}>‹ Back</button>
        ${nav.canNext ? '<button type="button" class="quiet-btn" data-act="roll-next">Next ›</button>' : ''}
        <button type="button" class="linklike" data-act="back-today">Today&#39;s poem</button>
      </div>`,
    );
  }
  const poem = todaysPoem(lib);
  return poem
    ? poemCard(poem, "Today's poem")
    : `<div class="card today"><div class="label">Today's poem</div>${EMPTY}</div>`;
}

export function trashCardHtml(lib: Library, open: boolean): string {
  const rows = [...lib.trashed.entries()]
    .map(([id, reqs]) => ({ p: lib.byId.get(id), at: reqs[reqs.length - 1].created_at ?? '' }))
    .filter((r): r is { p: Piece; at: string } => r.p !== undefined)
    .sort((x, y) => y.at.localeCompare(x.at));
  if (rows.length === 0) return '';
  const list = open
    ? `<div class="trash-list">${rows
        .map(
          ({ p }) => `<div class="trash-row">
            <a class="trash-link" href="${pieceHash(p.drive_id)}">
              ${titleHtml(p, 'trash-title')}
              <div class="line-sub">${esc(metaLine(p))}</div>
            </a>
            <button type="button" class="quiet-btn" data-act="undo" data-id="${esc(p.drive_id)}">Undo</button>
          </div>`,
        )
        .join('')}</div>`
    : '';
  return `<div class="card trash-card">
      <button type="button" class="trash-head" data-act="toggle-trash" aria-expanded="${open}">
        <span>To trash · ${rows.length}</span><span class="chev">${open ? '▴' : '▾'}</span>
      </button>
      ${list}
    </div>
    <p class="caption tight">These go to Drive Trash tonight. Drive keeps them 30 days.</p>`;
}

export function composerHtml(
  forId: string,
  draft: string,
  placeholder: string,
  mode: 'claude' | 'mine' = 'claude',
): string {
  return `<div class="note-box">
      <textarea id="note-text" rows="4" maxlength="4000" dir="auto"
        placeholder="${esc(placeholder)}" aria-label="Note to Claude">${esc(draft)}</textarea>
      <div class="note-actions">
        <button type="button" class="btn-dark" data-act="${mode === 'mine' ? 'mine-send' : 'note-send'}" data-id="${esc(forId)}">${mode === 'mine' ? 'Save' : 'Send'}</button>
        <button type="button" class="quiet-btn" data-act="note-cancel">Cancel</button>
      </div>
    </div>`;
}

const FOURTEEN_DAYS = 14 * 24 * 3600 * 1000;

function noteRow(lib: Library, n: Req): string {
  const piece = n.drive_id === 'general' ? null : lib.byId.get(n.drive_id);
  const title = n.drive_id === 'general' ? 'General' : piece ? piece : null;
  const head =
    title === null
      ? '<div class="note-title">Removed piece</div>'
      : typeof title === 'string'
        ? `<div class="note-title">${title}</div>`
        : titleHtml(title, 'note-title');
  const reply = n.done_at
    ? `<div class="note-reply" dir="auto"><b>Claude</b> · ${esc(n.result ?? 'Done.')}</div>`
    : '<div class="note-reply">Waiting for Claude</div>';
  const inner = `${head}<div class="note-clamp" dir="auto">${esc(n.value ?? '')}</div>${reply}`;
  return piece
    ? `<a class="note-row" href="${pieceHash(piece.drive_id)}">${inner}</a>`
    : `<div class="note-row">${inner}</div>`;
}

export function notesCardHtml(lib: Library, ui: HomeUi): string {
  const all = [...lib.notes.values()].flat();
  const composer = composerHtml('general', ui.noteDraft, 'Tell Claude anything');
  const generalOpen = ui.generalMode === 'claude';
  if (all.length === 0) {
    if (generalOpen) return `<div class="card notes-card pad">${composer}</div>`;
    return '<p class="footer-links"><button type="button" class="linklike" data-act="note-general">💬 Write a note to Claude</button></p>';
  }
  const byNewest = (a: Req, b: Req): number => b.id - a.id;
  const waiting = all.filter((n) => n.done_at === null).sort(byNewest);
  const answered = all
    .filter((n) => n.done_at !== null && Date.now() - Date.parse(n.done_at) <= FOURTEEN_DAYS)
    .sort(byNewest);
  const dot = ui.freshReplies ? ' <span class="dot" role="img" aria-label="New reply"></span>' : '';
  const body = ui.notesOpen
    ? `<div class="notes-body">
        ${
          generalOpen
            ? composer
            : '<button type="button" class="quiet-btn" data-act="note-general">Write a general note</button>'
        }
        ${[...waiting, ...answered].map((n) => noteRow(lib, n)).join('')}
      </div>`
    : '';
  return `<div class="card trash-card notes-card">
      <button type="button" class="trash-head" data-act="toggle-notes" aria-expanded="${ui.notesOpen}">
        <span>💬 Notes to Claude${dot}</span><span class="chev">${ui.notesOpen ? '▴' : '▾'}</span>
      </button>
      <div class="notes-count">${waiting.length} waiting · ${answered.length} answered</div>
      ${body}
    </div>`;
}

/** Her private notes on Home. Claude never acts on these. Newest first, tap goes to the piece. */
export function mineCardHtml(lib: Library, ui: HomeUi): string {
  const all = [...lib.mine.values()].flat().sort((a, b) => b.id - a.id);
  const composer = composerHtml('general', ui.noteDraft, 'A note just for you', 'mine');
  const open = ui.generalMode === 'mine';
  if (all.length === 0) {
    if (open) return `<div class="card notes-card pad">${composer}</div>`;
    return '<p class="footer-links"><button type="button" class="linklike" data-act="mine-general">📝 Write a note for yourself</button></p>';
  }
  const rows = all
    .map((n) => {
      const piece = n.drive_id === 'general' ? null : lib.byId.get(n.drive_id);
      const head = piece ? titleHtml(piece, 'note-title') : '<div class="note-title">General</div>';
      const inner = `${head}<div class="note-clamp" dir="auto">${esc(n.value ?? '')}</div>
        <div class="note-reply">${esc(formatDateTime(n.created_at))}</div>`;
      return piece
        ? `<a class="note-row" href="${pieceHash(piece.drive_id)}">${inner}</a>`
        : `<div class="note-row">${inner}</div>`;
    })
    .join('');
  const body = ui.mineOpen
    ? `<div class="notes-body">${
        open
          ? composer
          : '<button type="button" class="quiet-btn" data-act="mine-general">Write a note for yourself</button>'
      }${rows}</div>`
    : '';
  return `<div class="card trash-card notes-card">
      <button type="button" class="trash-head" data-act="toggle-mine" aria-expanded="${ui.mineOpen}">
        <span>📝 My notes</span><span class="chev">${ui.mineOpen ? '▴' : '▾'}</span>
      </button>
      <div class="notes-count">${all.length} ${all.length === 1 ? 'note' : 'notes'}</div>
      ${body}
    </div>`;
}

/** The install control at the bottom of Home: a button when the browser offers it, else a hint. */
export function installHtml(state: 'button' | 'hint' | 'none'): string {
  if (state === 'button') {
    return '<p class="footer-links"><button type="button" class="quiet-btn" data-act="install">📲 Install app</button></p>';
  }
  if (state === 'hint') {
    return '<p class="caption tight">To install: browser menu ⋮ → Add to Home screen</p>';
  }
  return '';
}

export interface WriteUi {
  title: string;
  body: string;
}

/** The Write tab: a title, a big writing area, and the list of what she has sent for filing. */
export function writeHtml(lib: Library, ui: WriteUi): string {
  const items = [...lib.news]
    .sort((a, b) => b.id - a.id)
    .map((n) => {
      const text = n.value ?? '';
      const label = (n.title ?? '').trim() || firstLines(text, 1) || 'Untitled';
      const italic = (n.title ?? '').trim() ? '' : ' untitled';
      const target = n.drive_id !== 'new' ? lib.byId.get(n.drive_id) : undefined;
      const status = n.done_at
        ? `<div class="note-reply" dir="auto">Filed: ${
            target
              ? `<a class="also-link" href="${pieceHash(target.drive_id)}">${esc(n.result ?? 'Done')}</a>`
              : esc(n.result ?? 'Done')
          }</div>`
        : `<div class="note-reply">Waiting for Claude to file it · <button type="button" class="linklike inline" data-act="unsend" data-id="${n.id}">Unsend</button></div>`;
      return `<div class="card write-item">
          <div class="card-title${italic}" dir="auto">${esc(label)}</div>
          <div class="card-meta"><span>${esc(formatDateTime(n.created_at))}</span></div>
          ${status}
        </div>`;
    })
    .join('');
  return `<h2 class="page-title">Write</h2>
    <div class="write-form">
      <input id="write-title" type="text" dir="auto" placeholder="Title (optional)" value="${esc(ui.title)}"
        autocomplete="off" aria-label="Title" />
      <textarea id="write-body" class="reading" dir="auto" placeholder="Start writing…"
        aria-label="Your writing">\n${esc(ui.body)}</textarea>
      <div class="note-actions">
        <button type="button" class="btn-dark" data-act="write-save">Save</button>
      </div>
    </div>
    <p class="caption tight">Claude files it into Drive in the right place. Then it shows up here like everything else.</p>
    ${items ? `<h3 class="letter-head">Your new writing</h3><div class="cards">${items}</div>` : ''}`;
}

export function homeHtml(lib: Library, ui: HomeUi): string {
  const poems = lib.works.filter((w) => w.top.kind === 'poem').length;
  const withVersions = lib.works.filter((w) => w.versions.length > 1).length;
  return `<div class="searchbox">
      <input id="search" type="search" placeholder="Search your writing" value="${esc(ui.query)}"
        autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search"
        aria-label="Search your writing" dir="auto" />
    </div>
    <div id="search-results"></div>
    <div class="roll-row">
      <button type="button" class="btn-neutral" id="roll" data-act="roll">
        <span class="die" aria-hidden="true">🎲</span> Roll
      </button>
    </div>
    <div id="today-slot">${todaySlotHtml(lib, ui.rolled, ui.nav, ui.seenNote)}</div>
    <p class="counts">${num(lib.visibleCount)} pieces · ${num(poems)} poems · ${num(withVersions)} with versions</p>
    <div id="notes-slot">${notesCardHtml(lib, ui)}</div>
    <div id="mine-slot">${mineCardHtml(lib, ui)}</div>
    <div id="trash-slot">${trashCardHtml(lib, ui.trashOpen)}</div>
    <div id="install-slot">${installHtml(ui.install)}</div>
    <p class="footer-links"><button type="button" class="linklike" data-act="logout">Log out</button></p>`;
}

export function shelvesHtml(lib: Library): string {
  const map = shelfMap(lib);
  if (map.size === 0)
    return '<h2 class="page-title">Shelves</h2><p class="empty">No shelves yet</p>';
  const names = [...map.keys()].sort((a, b) => a.localeCompare(b));
  const cards = names
    .map((n) => {
      const count = map.get(n)?.length ?? 0;
      return `<a class="card shelf-card" href="${shelfHash(n)}">
        <div class="card-title" dir="auto">${esc(n)}</div>
        <div class="card-meta"><span>${num(count)} ${count === 1 ? 'piece' : 'pieces'}</span></div>
      </a>`;
    })
    .join('');
  return `<h2 class="page-title">Shelves</h2><div class="cards">${cards}</div>`;
}

export function shelfHtml(lib: Library, name: string): string {
  const works = sortForBrowse(shelfMap(lib).get(name) ?? []);
  return `<p class="crumb"><a href="#/shelves">‹ Shelves</a></p>
    <h2 class="page-title" dir="auto">${esc(name)}</h2>
    <p class="count">${num(works.length)} ${works.length === 1 ? 'piece' : 'pieces'}</p>
    ${cardsHtml(works)}`;
}

interface Chip {
  value: string;
  label: string;
  count: number;
}

function chipRow(title: string, key: keyof Filters, chips: Chip[], filters: Filters): string {
  const items = chips
    .map((c) => {
      const selected = filters[key] === c.value;
      if (c.count === 0 && !selected) return '';
      const next: Filters = { ...filters };
      if (selected) delete next[key];
      else next[key] = c.value;
      return `<a class="chip${selected ? ' sel' : ''}" href="${browseHash(next)}"
        aria-pressed="${selected}"><span dir="auto">${esc(c.label)}</span> <span class="n">${num(c.count)}</span></a>`;
    })
    .join('');
  return `<div class="chip-row"><div class="row-label">${title}</div><div class="chips">${items}</div></div>`;
}

/** Count of works matching every OTHER selected row, plus this chip. */
function countFor(works: Work[], filters: Filters, key: keyof Filters, value: string): number {
  return works.filter((w) => matchesFilters(w, { ...filters, [key]: value })).length;
}

export function browseHtml(lib: Library, filters: Filters): string {
  const works = lib.works;
  const mk = (key: keyof Filters, value: string, label: string): Chip => ({
    value,
    label,
    count: countFor(works, filters, key, value),
  });
  const kinds = KIND_ORDER.map((k) => mk('kind', k, kindLabel(k)));
  const yearSet = new Set<number>();
  for (const w of works) if (w.top.year !== null) yearSet.add(w.top.year);
  const years = [...yearSet].sort((a, b) => b - a).map((y) => mk('year', String(y), String(y)));
  years.push(mk('year', 'none', 'No year'));
  const themes = THEME_ORDER.map((t) => mk('theme', t, t));
  const moods = MOOD_ORDER.map((m) => mk('mood', m, m));
  const any = Object.keys(filters).length > 0;
  const results = sortForBrowse(works.filter((w) => matchesFilters(w, filters)));
  return `<div class="filters">
      ${chipRow('Kind', 'kind', kinds, filters)}
      ${chipRow('Year', 'year', years, filters)}
      ${chipRow('Theme', 'theme', themes, filters)}
      ${chipRow('Mood', 'mood', moods, filters)}
      ${any ? '<div class="chips"><a class="chip clear" href="#/browse">Clear all</a></div>' : ''}
    </div>
    <p class="count">${num(results.length)} ${results.length === 1 ? 'piece' : 'pieces'}</p>
    ${cardsHtml(results)}
    <p class="caption">Kinds and themes are a first guess. Tell Claude what's off.</p>`;
}

function groupId(g: string): string {
  if (g === HEBREW_GROUP) return 'fl-he';
  if (g === NUMBER_GROUP) return 'fl-num';
  return `fl-${g}`;
}

export function firstLinesHtml(lib: Library): string {
  const sorted = sortFirstLines(lib.works);
  const groups = new Map<string, Work[]>();
  for (const w of sorted) {
    const g = letterGroup(firstLineOf(w.top));
    const list = groups.get(g);
    if (list) list.push(w);
    else groups.set(g, [w]);
  }
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const order = [NUMBER_GROUP, ...letters, HEBREW_GROUP];
  const strip = order
    .map((g) => {
      const has = groups.has(g);
      return `<button type="button" class="letter" data-letter="${groupId(g)}" ${has ? '' : 'disabled'}>${g}</button>`;
    })
    .join('');
  const sections = order
    .filter((g) => groups.has(g))
    .map((g) => {
      const rows = (groups.get(g) ?? [])
        .map((w) => {
          const p = w.top;
          const sub = [p.has_title ? p.title : '', metaLine(p)].filter(Boolean).join(' · ');
          return `<a class="line-row" href="${pieceHash(p.drive_id)}">
            <div class="line-text" dir="auto">${esc(firstLineOf(p))}</div>
            <div class="line-sub" dir="auto">${esc(sub)}</div>
          </a>`;
        })
        .join('');
      return `<section class="letter-group" id="${groupId(g)}"><h3 class="letter-head">${g}</h3>${rows}</section>`;
    })
    .join('');
  return `<div class="letter-strip">${strip}</div>${sections || EMPTY}`;
}

/** One piece's notes, oldest first: her words, then either "Waiting" or Claude's reply. */
export function threadHtml(claudeNotes: Req[], readOnly: boolean, mine: Req[] = []): string {
  const notes = [...claudeNotes, ...mine].sort((a, b) => a.id - b.id);
  if (notes.length === 0) return '';
  const items = notes
    .map((n) => {
      if (n.action === 'mine') {
        return `<div class="msg mine"><div class="msg-head"><b>My note</b> · ${esc(formatDateTime(n.created_at))}
          · <button type="button" class="linklike inline" data-act="unsend" data-id="${n.id}">Delete</button></div>
          <div class="msg-body" dir="auto">${esc(n.value ?? '')}</div></div>`;
      }
      const mine = `<div class="msg"><div class="msg-head"><b>You</b> · ${esc(formatDateTime(n.created_at))}</div>
        <div class="msg-body" dir="auto">${esc(n.value ?? '')}</div></div>`;
      const answer = n.done_at
        ? `<div class="msg claude"><div class="msg-head"><b>Claude</b> · ${esc(formatDateTime(n.done_at))}</div>
            <div class="msg-body" dir="auto">${esc(n.result ?? 'Done.')}</div></div>`
        : `<div class="msg wait">Waiting for Claude${
            readOnly
              ? ''
              : ` · <button type="button" class="linklike inline" data-act="unsend" data-id="${n.id}">Unsend</button>`
          }</div>`;
      return mine + answer;
    })
    .join('');
  return `<div class="thread" aria-label="Notes to Claude">${items}</div>`;
}

export interface PieceUi {
  kindOpen: boolean;
  includesOpen: boolean;
  noteMode: 'claude' | 'mine' | null;
  noteDraft: string;
  editing: boolean;
  editDraft: string;
  /** ids of unwritten-edit lines she has dismissed on this device */
  dismissed: Set<number>;
}

const INCLUDES_SHOWN = 12;

/** "Also in:" / "Includes:" links to the pieces this one is linked with. Skips ids we don't have. */
export function alsoInHtml(lib: Library, piece: Piece, expanded: boolean): string {
  const linked = piece.also_in
    .map((id) => lib.byId.get(id))
    .filter((p): p is Piece => p !== undefined && !lib.trashed.has(p.drive_id));
  if (linked.length === 0) return '';
  const includes = piece.kind === 'collection';
  const shown = includes && !expanded ? linked.slice(0, INCLUDES_SHOWN) : linked;
  const more = linked.length - shown.length;
  const links = shown
    .map((p) => {
      const t = displayTitle(p);
      return `<a class="also-link" href="${pieceHash(p.drive_id)}"><span class="${t.italic ? 'untitled' : ''}" dir="auto">${esc(t.text)}</span> <span class="tiny">${esc(kindLabel(p.kind))}</span></a>`;
    })
    .join('<span class="sep"> · </span>');
  const moreBtn =
    more > 0
      ? ` <button type="button" class="linklike inline" data-act="includes-more">+ ${more} more</button>`
      : '';
  return `<p class="also-in"><span class="row-label">${includes ? 'Includes:' : 'Also in:'}</span> ${links}${moreBtn}</p>`;
}

export function pieceHtml(lib: Library, piece: Piece, backHash: string, ui: PieceUi): string {
  const pending = lib.trashed.has(piece.drive_id);
  const work = lib.workOf.get(piece.drive_id);
  const versions = work?.versions ?? [piece];
  const themes = piece.themes
    .map(
      (t) =>
        `<a class="chip small" href="${browseHash({ theme: t })}"><span dir="auto">${esc(t)}</span></a>`,
    )
    .join('');
  const pills =
    versions.length > 1
      ? `<div class="versions" aria-label="Versions">
          <div class="row-label">Versions</div>
          <div class="pills">${versions
            .map((v) => {
              const t = displayTitle(v).text;
              const label = t.length > 60 ? `${t.slice(0, 60)}…` : t;
              const cur = v.drive_id === piece.drive_id;
              return `<a class="pill${cur ? ' sel' : ''}" href="${pieceHash(v.drive_id)}"
                ${cur ? 'aria-current="true"' : ''}>
                <span class="pill-title${displayTitle(v).italic ? ' untitled' : ''}" dir="auto">${esc(label)}</span>
                <span class="pill-sub">${esc([formatWritten(v.written), v.is_top ? 'on top' : '', lib.trashed.has(v.drive_id) ? 'to trash' : ''].filter(Boolean).join(' · '))}</span>
              </a>`;
            })
            .join('')}</div>
        </div>`
      : '';
  const note = piece.note ? `<p class="note" dir="auto">${esc(piece.note)}</p>` : '';
  const action = piece.link
    ? `<a class="btn-primary" href="${esc(piece.link)}" target="_blank" rel="noopener">Open in Drive ↗</a>`
    : '';
  const banner = pending
    ? `<div class="banner" role="status"><span>Going to Drive Trash tonight</span>
        <button type="button" class="linklike inline" data-act="undo" data-id="${esc(piece.drive_id)}">Undo</button></div>`
    : '';
  const picker = ui.kindOpen
    ? `<div class="chips picker">${KIND_ORDER.map(
        (k) =>
          `<button type="button" class="chip${k === piece.kind ? ' sel' : ''}" data-act="pick-kind" data-kind="${k}">${esc(kindLabel(k))}</button>`,
      ).join('')}</div>`
    : '';
  const pendingEdit = lib.edits.has(piece.drive_id);
  const canEdit = piece.editable && !pending;
  const editBanner = pendingEdit
    ? `<div class="banner" role="status"><span>Your edit goes into Drive tonight</span>
        <button type="button" class="linklike inline" data-act="undo-edit" data-id="${esc(piece.drive_id)}">Undo</button></div>`
    : '';
  const failed = lib.editFailed.get(piece.drive_id);
  const failedLine =
    failed && !pendingEdit && !ui.dismissed.has(failed.id)
      ? `<div class="edit-failed"><span dir="auto">Your edit wasn't written: ${esc(failed.result ?? '')}</span>
          <details><summary>show my edit</summary><div class="body" dir="auto">${esc(failed.value ?? '')}</div></details>
          <button type="button" class="linklike inline" data-act="dismiss-edit" data-id="${failed.id}">Dismiss</button></div>`
      : '';
  const bodyBlock =
    ui.editing && canEdit
      ? `<div class="edit-box">
          <textarea id="edit-text" class="reading" dir="auto" aria-label="Edit text">
${esc(ui.editDraft)}</textarea>
          <div class="note-actions">
            <button type="button" class="btn-dark" data-act="edit-save" data-id="${esc(piece.drive_id)}">Save</button>
            <button type="button" class="quiet-btn" data-act="edit-cancel">Cancel</button>
          </div>
        </div>`
      : `<div class="body reading" dir="auto">${esc(piece.body)}</div>`;
  const thread = threadHtml(
    lib.notes.get(piece.drive_id) ?? [],
    pending,
    lib.mine.get(piece.drive_id) ?? [],
  );
  const audit = pending
    ? ''
    : `<div class="audit">
        <div class="audit-row">
          <button type="button" class="quiet-btn" data-act="trash" data-id="${esc(piece.drive_id)}">🗑 Trash</button>
          <button type="button" class="quiet-btn" data-act="kind-open" aria-expanded="${ui.kindOpen}">Kind: ${esc(kindLabel(piece.kind))} ✏️</button>
          ${canEdit ? `<button type="button" class="quiet-btn" data-act="edit-open" aria-expanded="${ui.editing}">✏️ Edit</button>` : ''}
          <button type="button" class="quiet-btn" data-act="note-open" aria-expanded="${ui.noteMode === 'claude'}">💬 Note to Claude</button>
          <button type="button" class="quiet-btn" data-act="mine-open" aria-expanded="${ui.noteMode === 'mine'}">📝 My note</button>
          ${piece.kind_by === 'her' ? '<span class="tiny">your pick</span>' : ''}
          ${piece.is_top ? '' : `<button type="button" class="quiet-btn" data-act="top" data-id="${esc(piece.drive_id)}">Put on top</button>`}
        </div>
        ${picker}
        ${ui.noteMode === 'claude' ? composerHtml(piece.drive_id, ui.noteDraft, 'Tell Claude anything about this piece') : ''}
        ${ui.noteMode === 'mine' ? composerHtml(piece.drive_id, ui.noteDraft, 'A note just for you', 'mine') : ''}
      </div>`;
  return `<p class="crumb"><a href="${esc(backHash)}" data-act="back">‹ Back</a></p>
    <article class="piece">
      ${headingHtml(piece, 'piece-title')}
      <div class="card-meta"><span>${esc(metaLine(piece, true))}</span></div>
      ${themes ? `<div class="chips tight">${themes}</div>` : ''}
      ${banner}
      ${editBanner}
      ${failedLine}
      ${pills}
      ${alsoInHtml(lib, piece, ui.includesOpen)}
      ${note}
      ${bodyBlock}
      ${audit}
      ${thread}
      ${action ? `<div class="actions">${action}</div>` : ''}
    </article>`;
}
