// Small text helpers shared by the views.
import type { Piece } from './types.js';

export const KIND_LABEL: Record<string, string> = {
  poem: 'Poem',
  draft: 'Draft',
  collection: 'Collection',
  song: 'Song',
  musing: 'Musing',
  diary: 'Diary',
  steps: 'Step work',
  torah: 'Torah',
  letter: 'Letter',
  story: 'Story / skit',
  not_writing: 'Not writing',
};

export const KIND_ORDER = Object.keys(KIND_LABEL);

export const THEME_ORDER = [
  'Becoming',
  'Healing & recovery',
  'Faith & God',
  'Grief & loss',
  'Family',
  'Love & longing',
  'Friendship & community',
  'Israel & war',
  'Light & funny',
  'For someone',
  'Nature & travel',
  'Writing',
  'Darkness & fear',
];

export const MOOD_ORDER = ['serious', 'warm tribute', 'dark & raw', 'light & fun'];

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c] ?? c);
}

export function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function num(n: number): string {
  return n.toLocaleString('en-US');
}

export function firstLines(body: string, n: number): string {
  return body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, n)
    .join('\n');
}

/** Title if she gave one; otherwise the first line, to be shown in italics. */
export function displayTitle(p: Piece): { text: string; italic: boolean } {
  if (p.has_title && p.title.trim()) return { text: p.title, italic: false };
  const first = p.first_line.trim() || firstLines(p.body, 1) || p.title.trim();
  return { text: first || 'Untitled', italic: true };
}

const WRITTEN = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Jan 2026", "Jan 2026" or "2026"; empty when unknown or malformed. */
export function formatWritten(w: string | null): string {
  const m = w ? WRITTEN.exec(w.trim()) : null;
  if (!m) return '';
  const month = m[2] ? MONTHS[Number(m[2]) - 1] : undefined;
  if (m[2] && !month) return m[1];
  if (m[3] && month) return `${Number(m[3])} ${month} ${m[1]}`;
  return month ? `${month} ${m[1]}` : m[1];
}

/** Sortable number for a written date; unknown sorts below every real date. */
export function writtenSortKey(w: string | null): number {
  const m = w ? WRITTEN.exec(w.trim()) : null;
  if (!m) return -1;
  return Number(m[1]) * 10000 + Number(m[2] ?? 0) * 100 + Number(m[3] ?? 0);
}

/** The year to show: her `year`, else the year she wrote it, else nothing. */
export function shownYear(p: Piece): number | null {
  if (p.year !== null) return p.year;
  const m = p.written ? WRITTEN.exec(p.written.trim()) : null;
  return m ? Number(m[1]) : null;
}

export function metaLine(p: Piece, withFolder = false): string {
  const parts: string[] = [];
  const year = shownYear(p);
  if (year !== null) parts.push(String(year));
  parts.push(kindLabel(p.kind));
  if (withFolder && p.folder) parts.push(p.folder);
  return parts.join(' · ');
}

/** Sort key for the title: untitled pieces sort by their first line. */
export function sortTitle(p: Piece): string {
  return displayTitle(p).text.toLowerCase();
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${time}`;
}
