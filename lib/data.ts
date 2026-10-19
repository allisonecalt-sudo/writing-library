// Loading and shaping the data. Read-only: this app never writes to Supabase.
import type { SupabaseClient } from '@supabase/supabase-js';
import { KIND_LABEL, firstLines, writtenSortKey } from './format.js';
import type { Library, Piece, Req, Work } from './types.js';

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
    kind_by: r.kind_by ?? null,
    written: r.written ?? null,
    also_in: Array.isArray(r.also_in) ? r.also_in : [],
    editable: r.editable === true,
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

type Table = 'writing_pieces' | 'writing_requests';

/** Fetch every row of a table, one page of 1000 at a time, until a page comes back short. */
async function fetchPages<T>(
  sb: SupabaseClient,
  table: Table,
  order: string,
  map: (r: Record<string, unknown>) => T,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await sb
      .from(table)
      .select('*')
      .order(order)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, unknown>[];
    for (const r of rows) out.push(map(r));
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

export function fetchAll(sb: SupabaseClient): Promise<Piece[]> {
  return fetchPages(sb, 'writing_pieces', 'drive_id', (r) => normalise(r as Raw));
}

export function normaliseReq(r: Record<string, unknown>): Req {
  const s = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  const known = ['trash', 'kind', 'top', 'note', 'mine', 'edit'] as const;
  const action = known.find((k) => k === r.action) ?? 'other';
  return {
    id: Number(r.id),
    drive_id: s(r.drive_id) ?? '',
    action,
    value: s(r.value),
    created_at: s(r.created_at),
    done_at: s(r.done_at),
    result: s(r.result),
    base_modified: s(r.base_modified),
  };
}

export function fetchRequests(sb: SupabaseClient): Promise<Req[]> {
  return fetchPages(sb, 'writing_requests', 'id', normaliseReq);
}

function modifiedMs(p: Piece): number {
  return p.drive_modified ? Date.parse(p.drive_modified) || 0 : 0;
}

/** Top first, then by the date she WROTE them (newest first, unknown last). */
function topFirst(top: Piece, group: Piece[]): Piece[] {
  const rest = group
    .filter((p) => p !== top)
    .sort(
      (a, b) =>
        writtenSortKey(b.written) - writtenSortKey(a.written) || modifiedMs(b) - modifiedMs(a),
    );
  return [top, ...rest];
}

/**
 * Build the in-memory library, applying her requests on top of the table:
 * latest kind request per piece wins over `kind`, latest top request per work wins over
 * `is_top`, and pieces with a pending trash request are left out of the lists.
 */
export function buildLibrary(raw: Piece[], requests: Req[] = []): Library {
  const rawById = new Map<string, Piece>();
  for (const p of raw) rawById.set(p.drive_id, p);

  const trashed = new Map<string, Req[]>();
  const notes = new Map<string, Req[]>();
  const edits = new Map<string, Req[]>();
  const mine = new Map<string, Req[]>();
  const lastEdit = new Map<string, Req>();
  const kindReq = new Map<string, Req>();
  const topReq = new Map<string, Req>();
  for (const r of [...requests].sort((a, b) => a.id - b.id)) {
    if (r.action === 'mine') {
      // private notes to herself: a thread, nothing else
      const thread = mine.get(r.drive_id);
      if (thread) thread.push(r);
      else mine.set(r.drive_id, [r]);
      continue;
    }
    if (r.action === 'note') {
      // notes never change kind / top / trash state; they only form threads
      const thread = notes.get(r.drive_id);
      if (thread) thread.push(r);
      else notes.set(r.drive_id, [r]);
      continue;
    }
    const p = rawById.get(r.drive_id);
    if (!p) continue;
    if (r.action === 'edit') {
      // an edit is only a body override; it never touches kind / top / trash
      lastEdit.set(r.drive_id, r);
      if (r.done_at === null) {
        const list = edits.get(r.drive_id);
        if (list) list.push(r);
        else edits.set(r.drive_id, [r]);
      }
      continue;
    }
    if (r.action === 'trash' && r.done_at === null) {
      const list = trashed.get(r.drive_id);
      if (list) list.push(r);
      else trashed.set(r.drive_id, [r]);
    } else if (r.action === 'kind' && r.value && KIND_LABEL[r.value]) {
      kindReq.set(r.drive_id, r);
    } else if (r.action === 'top') {
      topReq.set(p.work_id, r);
    }
  }

  const pieces = raw.map((p) => {
    const k = kindReq.get(p.drive_id);
    const t = topReq.get(p.work_id);
    const pendingEdits = edits.get(p.drive_id);
    const e = pendingEdits ? pendingEdits[pendingEdits.length - 1] : undefined;
    const isTop = t ? t.drive_id === p.drive_id : p.is_top;
    if (!k && !e && isTop === p.is_top) return p;
    return {
      ...p,
      is_top: isTop,
      ...(k ? { kind: k.value ?? p.kind, kind_by: 'her' } : {}),
      ...(e ? { body: e.value ?? p.body, first_line: firstLines(e.value ?? p.body, 1) } : {}),
    };
  });

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
  let visibleCount = 0;
  for (const [id, group] of groups) {
    const top = group.find((p) => p.is_top) ?? group[0];
    const full: Work = { id, top, versions: topFirst(top, group) };
    for (const p of group) workOf.set(p.drive_id, full);
    const live = full.versions.filter((p) => !trashed.has(p.drive_id));
    visibleCount += live.length;
    if (live.length === 0) continue;
    // If the top is waiting for the trash, the newest remaining version stands in for it.
    // if the top is waiting for the trash, the newest (by Drive date) remaining version stands in
    const standIn =
      live[0] === top ? top : [...live].sort((a, b) => modifiedMs(b) - modifiedMs(a))[0];
    works.push({ id, top: standIn, versions: [standIn, ...live.filter((p) => p !== standIn)] });
  }
  const editFailed = new Map<string, Req>();
  for (const [id, r] of lastEdit) {
    if (r.done_at !== null && !(r.result ?? '').trim().toLowerCase().startsWith('written')) {
      editFailed.set(id, r);
    }
  }
  return { pieces, works, byId, workOf, trashed, notes, mine, edits, editFailed, visibleCount };
}
