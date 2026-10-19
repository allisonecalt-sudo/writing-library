// Loading and shaping the data. Read-only: this app never writes to Supabase.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Library, Piece, Work } from './types.js';

/** PostgREST returns at most 1000 rows per request. */
export const PAGE_SIZE = 1000;

type Raw = Partial<{ [K in keyof Piece]: Piece[K] | null }>;

function str(v: string | null | undefined): string {
  return typeof v === 'string' ? v : '';
}

export function normalise(r: Raw): Piece {
  const id = str(r.drive_id);
  return {
    drive_id: id,
    work_id: str(r.work_id) || id,
    is_top: r.is_top === true,
    top_by: r.top_by ?? null,
    title: str(r.title),
    has_title: r.has_title === true,
    first_line: str(r.first_line),
    kind: str(r.kind) || 'poem',
    year: typeof r.year === 'number' ? r.year : null,
    themes: Array.isArray(r.themes) ? r.themes : [],
    mood: r.mood ?? null,
    shelves: Array.isArray(r.shelves) ? r.shelves : [],
    folder: str(r.folder),
    body: str(r.body),
    words: typeof r.words === 'number' ? r.words : 0,
    drive_created: r.drive_created ?? null,
    drive_modified: r.drive_modified ?? null,
    link: str(r.link),
    source: str(r.source),
    note: r.note ?? null,
  };
}

/** Fetch every row, one page of 1000 at a time, until a page comes back short. */
export async function fetchAll(sb: SupabaseClient): Promise<Piece[]> {
  const out: Piece[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await sb
      .from('writing_pieces')
      .select('*')
      .order('drive_id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Raw[];
    for (const r of rows) out.push(normalise(r));
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

function modifiedMs(p: Piece): number {
  return p.drive_modified ? Date.parse(p.drive_modified) || 0 : 0;
}

export function buildLibrary(pieces: Piece[]): Library {
  const byId = new Map<string, Piece>();
  const groups = new Map<string, Piece[]>();
  for (const p of pieces) {
    byId.set(p.drive_id, p);
    const g = groups.get(p.work_id);
    if (g) g.push(p);
    else groups.set(p.work_id, [p]);
  }
  const works: Work[] = [];
  const workOf = new Map<string, Work>();
  for (const [id, group] of groups) {
    const top = group.find((p) => p.is_top) ?? group[0];
    const rest = group.filter((p) => p !== top).sort((a, b) => modifiedMs(b) - modifiedMs(a));
    const work: Work = { id, top, versions: [top, ...rest] };
    works.push(work);
    for (const p of group) workOf.set(p.drive_id, work);
  }
  return { pieces, works, byId, workOf };
}
