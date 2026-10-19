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

export interface Library {
  pieces: Piece[];
  works: Work[];
  byId: Map<string, Piece>;
  workOf: Map<string, Work>;
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
