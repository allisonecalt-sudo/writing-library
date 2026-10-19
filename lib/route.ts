// Hash routing, so the Android back button works.
import type { Filters, Route } from './types.js';

const FILTER_KEYS: (keyof Filters)[] = ['kind', 'year', 'theme', 'mood'];

function dec(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter((s) => s.length > 0);
  switch (parts[0]) {
    case 'shelves':
      return { name: 'shelves' };
    case 'shelf':
      return parts[1] ? { name: 'shelf', shelf: dec(parts[1]) } : { name: 'shelves' };
    case 'browse': {
      const params = new URLSearchParams(query);
      const filters: Filters = {};
      for (const k of FILTER_KEYS) {
        const v = params.get(k);
        if (v) filters[k] = v;
      }
      return { name: 'browse', filters };
    }
    case 'first':
      return { name: 'first' };
    case 'p':
      return parts[1] ? { name: 'piece', id: dec(parts[1]) } : { name: 'home' };
    default:
      return { name: 'home' };
  }
}

export function browseHash(filters: Filters): string {
  const params = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = filters[k];
    if (v) params.set(k, v);
  }
  const q = params.toString();
  return q ? `#/browse?${q}` : '#/browse';
}

export function pieceHash(id: string): string {
  return `#/p/${encodeURIComponent(id)}`;
}

export function shelfHash(name: string): string {
  return `#/shelf/${encodeURIComponent(name)}`;
}

/** Which top tab a route belongs to. */
export function tabOf(route: Route): 'home' | 'shelves' | 'browse' | 'first' | null {
  switch (route.name) {
    case 'home':
    case 'shelves':
    case 'browse':
    case 'first':
      return route.name;
    case 'shelf':
      return 'shelves';
    default:
      return null;
  }
}
