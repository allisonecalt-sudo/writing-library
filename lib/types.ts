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
  /** When she WROTE it: 'YYYY-MM-DD', 'YYYY-MM' or 'YYYY'. Null = unknown. */
  written: string | null;
  /** Drive ids of OTHER pieces this one sits inside whole, or that sit inside it. Not versions. */
  also_in: string[];
  /** True only for Google Docs: the one kind of file she can edit from here. */
  editable: boolean;
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
  action: 'trash' | 'kind' | 'top' | 'note' | 'mine' | 'edit' | 'new' | 'other';
  value: string | null;
  created_at: string | null;
  done_at: string | null;
  result: string | null;
  /** For new writing: the optional title she gave it. */
  title: string | null;
  /** For edits: the drive_modified the edit started from. */
  base_modified: string | null;
}

export interface SeenRow {
  drive_id: string;
  first_seen: string | null;
  last_seen: string | null;
  times: number;
}

export interface SeenRow {
  drive_id: string;
  first_seen: string | null;
  last_seen: string | null;
  times: number;
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
  /** Pending edit requests by drive_id, oldest first. */
  edits: Map<string, Req[]>;
  /** Latest edit per drive_id that the nightly job did NOT write (done, result not "written…"). */
  editFailed: Map<string, Req>;
  /** Her private notes (action mine) by drive_id (or general), oldest first. Claude never acts on them. */
  mine: Map<string, Req[]>;
  /** New writing she wrote in the app (action new), oldest first. Claude files it into Drive. */
  news: Req[];
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
  | { name: 'write' }
  | { name: 'piece'; id: string };
