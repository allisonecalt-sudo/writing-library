// Each screen is a function from data to an HTML string. All her text goes through esc().
import {
  KIND_ORDER,
  MOOD_ORDER,
  THEME_ORDER,
  displayTitle,
  esc,
  firstLines,
  formatDate,
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
import type { Filters, Library, Piece, Work } from './types.js';

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

export function homeHtml(lib: Library, query: string): string {
  const poem = todaysPoem(lib);
  const poems = lib.works.filter((w) => w.top.kind === 'poem').length;
  const withVersions = lib.works.filter((w) => w.versions.length > 1).length;
  const today = poem
    ? `<a class="card today" href="${pieceHash(poem.drive_id)}">
        <div class="label">Today's poem</div>
        ${titleHtml(poem, 'card-title')}
        <div class="card-meta"><span>${esc(metaLine(poem))}</span></div>
        <div class="body" dir="auto">${esc(poem.body)}</div>
      </a>`
    : `<div class="card today"><div class="label">Today's poem</div>${EMPTY}</div>`;
  return `<div class="searchbox">
      <input id="search" type="search" placeholder="Search your writing" value="${esc(query)}"
        autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search"
        aria-label="Search your writing" dir="auto" />
    </div>
    <div id="search-results"></div>
    ${today}
    <p class="counts">${num(lib.pieces.length)} pieces · ${num(poems)} poems · ${num(withVersions)} with versions</p>
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

export function pieceHtml(lib: Library, piece: Piece, backHash: string): string {
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
                <span class="pill-sub">${esc(formatDate(v.drive_modified))}${v.is_top ? ' · on top' : ''}</span>
              </a>`;
            })
            .join('')}</div>
        </div>`
      : '';
  const note = piece.note ? `<p class="note" dir="auto">${esc(piece.note)}</p>` : '';
  const action = piece.link
    ? `<a class="btn-primary" href="${esc(piece.link)}" target="_blank" rel="noopener">Open in Drive ↗</a>`
    : '';
  return `<p class="crumb"><a href="${esc(backHash)}" data-act="back">‹ Back</a></p>
    <article class="piece">
      ${titleHtml(piece, 'piece-title')}
      <div class="card-meta"><span>${esc(metaLine(piece, true))}</span></div>
      ${themes ? `<div class="chips tight">${themes}</div>` : ''}
      ${pills}
      ${note}
      <div class="body reading" dir="auto">${esc(piece.body)}</div>
      ${action ? `<div class="actions">${action}</div>` : ''}
    </article>`;
}
