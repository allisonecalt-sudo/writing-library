// Types for the writing_pieces table (read-only) and what the app builds from it.

/** One row of public.writing_pieces, normalised so nothing is null except year/mood/note. */
export interface Piece {
  drive_id: string;
  work_id: string;
  is_top: boolean;
  top_by: string | null;
  title: string;
  has_title: boolean;
  first_line: string;
  kind: string;
  kind_by: string | null;
  year: number | null;
  themes: string[];
  mood: string | null;
  shelves: string[];
  folder: string;
  body: string;
  words: number;
  drive_created: string | null;
  drive_modified: string | null;
  link: string;
  source: string;
  note: string | null;
}

/** A work = every piece sharing a work_id. `top` is the version shown first. */
export interface Work {
  id: string;
  top: Piece;
  versions: Piece[];
}

/** One row of public.writing_requests: a change she asked for, applied by a nightly job. */
export interface Req {
  id: number;
  drive_id: string;
  action: 'trash' | 'kind' | 'top' | 'note' | 'other';
  value: string | null;
  created_at: string | null;
  done_at: string | null;
  result: string | null;
}

export interface Library {
  /** Every piece (requests applied), including ones waiting to be trashed. */
  pieces: Piece[];
  /** What lists show: one entry per work, pieces waiting for the trash left out. */
  works: Work[];
  byId: Map<string, Piece>;
  /** The FULL work for a piece (all versions, trashed ones too), for the piece view. */
  workOf: Map<string, Work>;
  /** Pending trash requests by drive_id. */
  trashed: Map<string, Req[]>;
  /** Her notes to Claude by drive_id ('general' for general ones), oldest first. */
  notes: Map<string, Req[]>;
  /** Number of pieces not waiting for the trash. */
  visibleCount: number;
}

export interface Filters {
  kind?: string;
  year?: string;
  theme?: string;
  mood?: string;
}

export type Route =
  | { name: 'home' }
  | { name: 'shelves' }
  | { name: 'shelf'; shelf: string }
  | { name: 'browse'; filters: Filters }
  | { name: 'first' }
  | { name: 'piece'; id: string };
