// "Seen" tracking for the dice: poems she hasn't looked at or written a note on come first.
import type { Library, Piece, SeenRow } from './types.js';

/** A work counts as seen if ANY of its versions has a seen row; as noted if any has a note. */
function versionIds(lib: Library, p: Piece): string[] {
  return (lib.workOf.get(p.drive_id)?.versions ?? [p]).map((v) => v.drive_id);
}

/** New to her: no seen row and no note (to Claude or for herself) on any version of the work. */
export function isNew(lib: Library, seen: Map<string, SeenRow>, p: Piece): boolean {
  return !versionIds(lib, p).some((id) => seen.has(id) || lib.notes.has(id) || lib.mine.has(id));
}

function topPoems(lib: Library): Piece[] {
  return lib.works.map((w) => w.top).filter((p) => p.kind === 'poem');
}

/** Top poems (not waiting for the trash) she hasn't looked at or discussed yet. */
export function newPoems(lib: Library, seen: Map<string, SeenRow>): Piece[] {
  return topPoems(lib).filter((p) => isNew(lib, seen, p));
}

function lastSeenMs(lib: Library, seen: Map<string, SeenRow>, p: Piece): number {
  let best = 0;
  for (const id of versionIds(lib, p)) {
    const t = Date.parse(seen.get(id)?.last_seen ?? '');
    if (!Number.isNaN(t) && t > best) best = t;
  }
  return best;
}

/** The poems seen longest ago (never-seen ones first), for when every poem has been seen. */
export function oldestSeen(lib: Library, seen: Map<string, SeenRow>, n: number): Piece[] {
  return topPoems(lib)
    .map((p) => ({ p, t: lastSeenMs(lib, seen, p) }))
    .sort((a, b) => a.t - b.t)
    .slice(0, n)
    .map((x) => x.p);
}

/** The quiet line under the dice card. A plain count: no percent, no bar, no streak. */
export function seenNote(lib: Library, seen: Map<string, SeenRow>): string {
  if (topPoems(lib).length === 0) return '';
  const n = newPoems(lib, seen).length;
  if (n === 0) return "You've seen them all. Now the oldest-seen ones.";
  return `${n.toLocaleString('en-US')} ${n === 1 ? 'poem' : 'poems'} you haven't seen yet`;
}
