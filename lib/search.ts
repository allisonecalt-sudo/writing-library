// Search, today's poem, filters, shelves and first-line ordering. All in memory, all pure.
import { displayTitle, sortTitle } from './format.js';
import type { Filters, Library, Piece, Work } from './types.js';

const haystacks = new WeakMap<Piece, string>();

function haystack(p: Piece): string {
  let h = haystacks.get(p);
  if (h === undefined) {
    h = `${p.title}\n${p.first_line}\n${p.body}`.toLowerCase();
    haystacks.set(p, h);
  }
  return h;
}

/** Works where any version matches. Title hits come first. Returns every match. */
export function searchWorks(lib: Library, query: string): Work[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const titleHits: Work[] = [];
  const bodyHits: Work[] = [];
  for (const w of lib.works) {
    let inTitle = false;
    let inAny = false;
    for (const p of w.versions) {
      if (haystack(p).includes(q)) inAny = true;
      if (`${p.title}\n${p.first_line}`.toLowerCase().includes(q)) inTitle = true;
    }
    if (inTitle) titleHits.push(w);
    else if (inAny) bodyHits.push(w);
  }
  return [...titleHits, ...bodyHits];
}

function localDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** One poem a day, picked from the local date. Same all day, changes tomorrow. */
export function todaysPoem(lib: Library, date: Date = new Date()): Piece | null {
  const poems = lib.works
    .map((w) => w.top)
    .filter((p) => p.kind === 'poem')
    .sort((a, b) => (a.drive_id < b.drive_id ? -1 : 1));
  if (poems.length === 0) return null;
  return poems[hashString(localDateKey(date)) % poems.length];
}

export function matchesFilters(w: Work, f: Filters, skip?: keyof Filters): boolean {
  const p = w.top;
  if (f.kind && skip !== 'kind' && p.kind !== f.kind) return false;
  if (f.year && skip !== 'year') {
    if (f.year === 'none' ? p.year !== null : String(p.year) !== f.year) return false;
  }
  if (f.theme && skip !== 'theme' && !p.themes.includes(f.theme)) return false;
  if (f.mood && skip !== 'mood' && p.mood !== f.mood) return false;
  return true;
}

/** Year newest first, then title. Works with no year go last. */
export function sortForBrowse(works: Work[]): Work[] {
  return [...works].sort((a, b) => {
    const ya = a.top.year ?? -Infinity;
    const yb = b.top.year ?? -Infinity;
    if (ya !== yb) return yb - ya;
    return sortTitle(a.top).localeCompare(sortTitle(b.top));
  });
}

/** Shelf name -> works on it (a work is on a shelf if any of its versions is). */
export function shelfMap(lib: Library): Map<string, Work[]> {
  const map = new Map<string, Work[]>();
  for (const w of lib.works) {
    const names = new Set<string>();
    for (const p of w.versions) for (const s of p.shelves) names.add(s);
    for (const n of names) {
      const list = map.get(n);
      if (list) list.push(w);
      else map.set(n, [w]);
    }
  }
  return map;
}

const LEADING_JUNK = /^[^\p{L}\p{N}]+/u;

export function stripLead(s: string): string {
  return s.replace(LEADING_JUNK, '');
}

const HEBREW = /[֐-׿]/;

export const HEBREW_GROUP = 'א–ת';
export const NUMBER_GROUP = '#';

/** The letter group a first line belongs to: A-Z, '#', or the Hebrew group. */
export function letterGroup(s: string): string {
  const t = stripLead(s);
  if (!t) return NUMBER_GROUP;
  const c = t.charAt(0);
  if (HEBREW.test(c)) return HEBREW_GROUP;
  const up = c.normalize('NFD').charAt(0).toUpperCase();
  return /[A-Z]/.test(up) ? up : NUMBER_GROUP;
}

export function firstLineOf(p: Piece): string {
  return p.first_line.trim() || displayTitle(p).text;
}

export function sortFirstLines(works: Work[]): Work[] {
  return [...works].sort((a, b) => {
    const la = stripLead(firstLineOf(a.top)).toLowerCase();
    const lb = stripLead(firstLineOf(b.top)).toLowerCase();
    return la.localeCompare(lb);
  });
}
