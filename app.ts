// My Writing: a private reading app. Drive is the master. The app reads the library and can
// only leave requests (trash / kind / top) notes to Claude and text edits in writing_requests; a nightly job applies them.
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildLibrary, fetchAll, fetchRequests, fetchSeen, normaliseReq } from './lib/data.js';
import { KIND_LABEL } from './lib/format.js';
import { parseHash, tabOf } from './lib/route.js';
import { searchWorks, todaysPoem } from './lib/search.js';
import { newPoems, oldestSeen, seenNote } from './lib/seen.js';
import type { Library, Piece, Req, Route, SeenRow } from './lib/types.js';
import {
  browseHtml,
  firstLinesHtml,
  homeHtml,
  pieceHtml,
  searchResultsHtml,
  shelfHtml,
  shelvesHtml,
  todaySlotHtml,
  type RollNav,
  trashCardHtml,
  installHtml,
  writeHtml,
} from './lib/views.js';

/** Chrome's install prompt event (not in the standard DOM typings). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

declare global {
  interface Window {
    supabase: { createClient: (url: string, key: string) => SupabaseClient };
    __WL_STAY_MS?: number;
  }
}

// Same Supabase project as the budget app. The anon key is public by design;
// the writing tables are only readable by her logged-in user (RLS).
const SB_URL = 'https://hpiyvnfhoqnnnotrmwaz.supabase.co';
const SB_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwaXl2bmZob3Fubm5vdHJtd2F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NzIwNDEsImV4cCI6MjA4ODA0ODA0MX0.AsGhYitkSnyVMwpJII05UseS_gICaXiCy7d8iHsr6Qw';

// Bump together with VERSION in sw.js on every deploy.
const APP_VERSION = 'v1.6';

const ROLL_MS = 600;
const NO_REPEAT = 20;
const MAX_HISTORY = 500;
const SAVE_ERROR = "Couldn't save that. Try again.";

const sb = window.supabase.createClient(SB_URL, SB_KEY);

let rawPieces: Piece[] = [];
let requests: Req[] = [];
let lib: Library | null = null;
let searchQuery = '';
let lastListHash = '#/home';
let lastRouteKey = '';
let rolled: Piece | null = null;
let rollHistory: string[] = []; // every poem rolled this session, in order
let rollPos = -1; // which of them is on screen
let rolling = false;
let trashOpen = false;
let kindOpen = false;
let busy = false;
let reloading = false;
let notesOpen = false;
let noteMode: 'claude' | 'mine' | null = null;
let mineOpen = false;
let includesOpen = false;
const SEEN_STAY_MS = 3000;

/** 3 seconds, unless a test sets window.__WL_STAY_MS to keep the timer out of the way. */
function stayMs(): number {
  const v = window.__WL_STAY_MS;
  return typeof v === 'number' ? v : SEEN_STAY_MS;
}
const SEEN_DEDUPE_MS = 60_000;
let seen = new Map<string, SeenRow>();
const lastSent = new Map<string, number>();
let stayTimer: ReturnType<typeof setTimeout> | undefined;
let installEvent: BeforeInstallPromptEvent | null = null;
let installed = false;
const DRAFT_TITLE_KEY = 'wl-write-title';
const DRAFT_BODY_KEY = 'wl-write-body';
const DRAFT_SAVE_MS = 1500;
let writeTitle = '';
let writeBody = '';
let draftTimer: ReturnType<typeof setTimeout> | undefined;
let noteFor: string | null = null; // piece id, or 'general', while a note box is open
let noteDraft = '';
let answeredSeen = new Set<number>();
const SEEN_KEY = 'wl-seen-replies';
const DISMISSED_KEY = 'wl-dismissed-edits';
let editFor: string | null = null; // piece id while its edit box is open
let editDraft = '';
let dismissedEdits = new Set<number>();

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node as T;
}

function showGate(): void {
  el('gate').hidden = false;
  el('app').hidden = true;
}

function showApp(): void {
  el('gate').hidden = true;
  el('app').hidden = false;
}

function setView(html: string): void {
  el('view').innerHTML = html;
}

function setError(on: boolean): void {
  const line = el('save-error');
  line.textContent = on ? SAVE_ERROR : '';
  line.hidden = !on;
}

function answeredIds(): number[] {
  return requests.filter((r) => r.action === 'note' && r.done_at !== null).map((r) => r.id);
}

function loadSeen(): Set<number> | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? new Set(JSON.parse(raw) as number[]) : null;
  } catch {
    return null;
  }
}

/** She has now seen every reply that exists. (Remembered per device, as a convenience only.) */
function markSeen(): void {
  answeredSeen = new Set(answeredIds());
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...answeredSeen]));
  } catch {
    // storage blocked: the dot just resets next time
  }
}

function hasFreshReplies(): boolean {
  return answeredIds().some((id) => !answeredSeen.has(id));
}

function loadDismissed(): Set<number> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw) as number[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissed(): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissedEdits]));
  } catch {
    // storage blocked: the line just comes back next time
  }
}

/** Let the edit box grow to fit her text, so the page scrolls instead of the box. */
function autogrow(id = 'edit-text'): void {
  const box = document.getElementById(id);
  if (!box) return;
  box.style.height = 'auto';
  box.style.height = `${box.scrollHeight + 2}px`;
}

// ---- seen: what she has looked at (fire-and-forget; never blocks, never shows an error) ----

function updateSeenLine(): void {
  const line = document.querySelector('.seen-line');
  if (line && lib) line.textContent = seenNote(lib, seen);
}

/** Record that she looked at a piece. At most once a minute per piece. */
function touchSeen(id: string): void {
  const now = Date.now();
  const prev = lastSent.get(id) ?? 0;
  if (now - prev < SEEN_DEDUPE_MS) return;
  lastSent.set(id, now);
  const iso = new Date(now).toISOString();
  const row = seen.get(id);
  const times = (row?.times ?? 0) + 1;
  seen.set(id, { drive_id: id, first_seen: row?.first_seen ?? iso, last_seen: iso, times });
  updateSeenLine();
  void Promise.resolve(
    sb
      .from('writing_seen')
      .upsert({ drive_id: id, last_seen: iso, times }, { onConflict: 'drive_id' }),
  ).then(
    (res) => {
      if (res.error) console.warn('[seen] not saved:', res.error.message);
    },
    (err: unknown) => console.warn('[seen] not saved:', err),
  );
}

/** Today's poem or the rolled poem counts as seen once she has stayed on it for 3 seconds. */
function watchShown(): void {
  clearTimeout(stayTimer);
  if (!lib) return;
  const id = (rolled ?? todaysPoem(lib))?.drive_id;
  if (!id) return;
  stayTimer = setTimeout(() => {
    const shown = lib ? (rolled ?? todaysPoem(lib))?.drive_id : undefined;
    if (shown === id && parseHash(location.hash).name === 'home') touchSeen(id);
  }, stayMs());
}

// ---- install as an app -------------------------------------------------------

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true;
}

function installState(): 'button' | 'hint' | 'none' {
  if (installed || isStandalone()) return 'none';
  return installEvent ? 'button' : 'hint';
}

function updateInstallSlot(): void {
  const slot = document.getElementById('install-slot');
  if (slot) slot.innerHTML = installHtml(installState());
}

async function runInstall(): Promise<void> {
  const ev = installEvent;
  if (!ev) return;
  installEvent = null; // the browser only lets an install prompt be used once
  try {
    await ev.prompt();
    await ev.userChoice;
  } catch (err) {
    console.warn('[install] failed:', err);
  }
  updateInstallSlot();
}

// ---- write: draft kept on this device only until she saves --------------------

function loadDraft(): void {
  try {
    writeTitle = localStorage.getItem(DRAFT_TITLE_KEY) ?? '';
    writeBody = localStorage.getItem(DRAFT_BODY_KEY) ?? '';
  } catch {
    // storage blocked: no draft recovery, the tab still works
  }
}

function persistDraft(): void {
  clearTimeout(draftTimer);
  draftTimer = undefined;
  try {
    if (writeTitle || writeBody) {
      localStorage.setItem(DRAFT_TITLE_KEY, writeTitle);
      localStorage.setItem(DRAFT_BODY_KEY, writeBody);
    } else {
      localStorage.removeItem(DRAFT_TITLE_KEY);
      localStorage.removeItem(DRAFT_BODY_KEY);
    }
  } catch {
    // storage blocked
  }
}

function scheduleDraftSave(): void {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(persistDraft, DRAFT_SAVE_MS);
}

function focusNote(): void {
  document.getElementById('note-text')?.focus();
}

function routeKey(r: Route): string {
  switch (r.name) {
    case 'shelf':
      return `shelf:${r.shelf}`;
    case 'piece':
      return `piece:${r.id}`;
    default:
      return r.name;
  }
}

function rebuild(): void {
  lib = buildLibrary(rawPieces, requests);
  // a rolled poem that is now waiting for the trash should not stay on screen
  if (rolled) {
    const fresh = lib.byId.get(rolled.drive_id);
    rolled = fresh && !lib.trashed.has(fresh.drive_id) ? fresh : null;
  }
}

function updateSearchResults(): void {
  const box = document.getElementById('search-results');
  if (!box || !lib) return;
  box.innerHTML = searchQuery.trim() ? searchResultsHtml(searchWorks(lib, searchQuery)) : '';
}

function render(): void {
  if (!lib) return;
  const route = parseHash(location.hash);
  if (route.name !== 'piece') lastListHash = location.hash || '#/home';
  const tab = tabOf(route) ?? tabOf(parseHash(lastListHash));
  document.querySelectorAll<HTMLElement>('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  const key = routeKey(route);
  if (key !== lastRouteKey) {
    kindOpen = false;
    includesOpen = false;
    noteFor = null;
    noteMode = null;
    noteDraft = '';
    editFor = null;
    editDraft = '';
    setError(false);
  }
  switch (route.name) {
    case 'home':
      setView(
        homeHtml(lib, {
          query: searchQuery,
          rolled,
          trashOpen,
          notesOpen,
          generalMode: noteFor === 'general' ? noteMode : null,
          mineOpen,
          install: installState(),
          seenNote: seenNote(lib, seen),
          nav: navState(),
          noteDraft,
          freshReplies: hasFreshReplies(),
        }),
      );
      updateSearchResults();
      watchShown();
      break;
    case 'shelves':
      setView(shelvesHtml(lib));
      break;
    case 'shelf':
      setView(shelfHtml(lib, route.shelf));
      break;
    case 'browse':
      setView(browseHtml(lib, route.filters));
      break;
    case 'first':
      setView(firstLinesHtml(lib));
      break;
    case 'write':
      setView(writeHtml(lib, { title: writeTitle, body: writeBody }));
      break;
    case 'piece': {
      const piece = lib.byId.get(route.id);
      if (piece) touchSeen(piece.drive_id);
      setView(
        piece
          ? pieceHtml(lib, piece, lastListHash, {
              kindOpen,
              includesOpen,
              noteMode: noteFor === piece.drive_id ? noteMode : null,
              noteDraft,
              editing: editFor === piece.drive_id,
              editDraft,
              dismissed: dismissedEdits,
            })
          : `<p class="crumb"><a href="#/home">‹ Home</a></p><p class="empty">Nothing here yet</p>`,
      );
      break;
    }
  }
  autogrow();
  autogrow('write-body');
  if (key !== lastRouteKey) window.scrollTo(0, 0);
  lastRouteKey = key;
}

async function loadAndShow(): Promise<void> {
  showApp();
  setView('<p class="loading">Loading…</p>');
  try {
    rawPieces = await fetchAll(sb);
    requests = await fetchRequests(sb);
    try {
      seen = new Map((await fetchSeen(sb)).map((r) => [r.drive_id, r]));
    } catch (err) {
      console.warn('[seen] could not load:', err);
      seen = new Map();
    }
    const stored = loadSeen();
    dismissedEdits = loadDismissed();
    if (stored) answeredSeen = stored;
    else markSeen();
    rebuild();
    render();
  } catch (err) {
    console.warn('[load] failed:', err);
    setView(
      `<p class="empty">Couldn't load your writing.</p>
       <p class="footer-links"><button type="button" class="linklike" data-act="retry">Try again</button></p>`,
    );
  }
}

// ---- dice -----------------------------------------------------------------

function navState(): RollNav {
  return { canBack: rollPos > 0, canNext: rollPos < rollHistory.length - 1 };
}

function updateTodaySlot(): void {
  const slot = document.getElementById('today-slot');
  if (slot && lib) slot.innerHTML = todaySlotHtml(lib, rolled, navState(), seenNote(lib, seen));
  watchShown();
}

function pickRandomPoem(): Piece | null {
  if (!lib) return null;
  const recent = rollHistory.slice(-NO_REPEAT);
  const fresh = newPoems(lib, seen); // not seen, no note, not waiting for the trash
  // When every poem has been seen, fall back to the ones seen longest ago.
  const candidates = fresh.length > 0 ? fresh : oldestSeen(lib, seen, 25);
  if (candidates.length === 0) return null;
  let pool = candidates.filter((p) => !recent.includes(p.drive_id));
  if (pool.length === 0) pool = candidates.filter((p) => p.drive_id !== rolled?.drive_id);
  if (pool.length === 0) pool = candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}

function showRolled(): void {
  rolling = false;
  const picked = pickRandomPoem();
  if (!picked || !lib) return;
  rolled = picked;
  // a new roll always goes on the END of the history, wherever she was in it
  rollHistory = [...rollHistory, picked.drive_id].slice(-MAX_HISTORY);
  rollPos = rollHistory.length - 1;
  updateTodaySlot();
}

/** Step through this session's rolls: -1 = Back, +1 = Next. Skips any that have since gone. */
function stepRoll(dir: -1 | 1): void {
  if (!lib) return;
  let pos = rollPos + dir;
  while (pos >= 0 && pos < rollHistory.length) {
    const p = lib.byId.get(rollHistory[pos]);
    if (p && !lib.trashed.has(p.drive_id)) {
      rollPos = pos;
      rolled = p;
      updateTodaySlot();
      return;
    }
    pos += dir;
  }
}

function roll(): void {
  if (rolling) return;
  const die = document.querySelector<HTMLElement>('#roll .die');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !die) {
    showRolled();
    return;
  }
  rolling = true;
  die.classList.add('rolling');
  setTimeout(() => {
    die.classList.remove('rolling');
    showRolled();
  }, ROLL_MS);
}

// ---- requests (the only writes) ------------------------------------------------

async function saveRequest(
  drive_id: string,
  action: Req['action'],
  value?: string,
  baseModified?: string | null,
  title?: string,
): Promise<boolean> {
  if (busy) return false;
  busy = true;
  setError(false);
  try {
    const row: {
      drive_id: string;
      action: string;
      value?: string;
      base_modified?: string | null;
      title?: string;
    } = { drive_id, action };
    if (value !== undefined) row.value = value;
    if (baseModified !== undefined) row.base_modified = baseModified;
    if (title) row.title = title;
    const { data, error } = await sb.from('writing_requests').insert(row).select();
    const saved = (data ?? []) as Record<string, unknown>[];
    if (error || saved.length === 0) {
      setError(true);
      return false;
    }
    requests = [...requests, ...saved.map(normaliseReq)];
    kindOpen = false;
    if (action === 'edit') {
      editFor = null;
      editDraft = '';
    }
    if (action === 'new') {
      writeTitle = '';
      writeBody = '';
      persistDraft();
    }
    rebuild();
    render();
    return true;
  } catch (err) {
    console.warn('[save] failed:', err);
    setError(true);
    return false;
  } finally {
    busy = false;
  }
}

/** Delete still-pending requests (undo a trash, unsend a note). Only the server's word counts. */
async function deleteRequests(ids: number[]): Promise<void> {
  if (busy || ids.length === 0) return;
  busy = true;
  setError(false);
  try {
    const gone = new Set<number>();
    for (const id of ids) {
      const { data, error } = await sb
        .from('writing_requests')
        .delete()
        .eq('id', id)
        .is('done_at', null)
        .select();
      if (error || !data || data.length === 0) {
        setError(true);
        break;
      }
      gone.add(id);
    }
    if (gone.size > 0) {
      requests = requests.filter((r) => !gone.has(r.id));
      rebuild();
      render();
    }
  } catch (err) {
    console.warn('[undo] failed:', err);
    setError(true);
  } finally {
    busy = false;
  }
}

function undoTrash(drive_id: string): Promise<void> {
  const pending = lib?.trashed.get(drive_id) ?? [];
  return deleteRequests(pending.map((r) => r.id));
}

/** Pick up replies Claude left since the last load. No polling: called on focus and on Home. */
async function reloadRequests(): Promise<void> {
  if (reloading || busy || !lib) return;
  reloading = true;
  try {
    requests = await fetchRequests(sb);
    rebuild();
    const onHome = parseHash(location.hash).name === 'home';
    if (notesOpen && onHome) markSeen();
    // don't pull a half-written note out from under her
    if (!(document.activeElement instanceof HTMLTextAreaElement)) render();
  } catch (err) {
    console.warn('[reload] failed:', err);
  } finally {
    reloading = false;
  }
}

function currentPieceId(): string | null {
  const route = parseHash(location.hash);
  return route.name === 'piece' ? route.id : null;
}

// ---- auth -----------------------------------------------------------------

async function clearRuntimeCache(): Promise<void> {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.endsWith('-runtime')).map((k) => caches.delete(k)));
  } catch {
    // no cache storage available; nothing to clear
  }
}

async function logout(): Promise<void> {
  try {
    await sb.auth.signOut();
  } catch (err) {
    console.warn('[auth] signOut failed:', err);
  }
  await clearRuntimeCache();
  lib = null;
  rawPieces = [];
  requests = [];
  rolled = null;
  rollHistory = [];
  rollPos = -1;
  seen = new Map();
  notesOpen = false;
  mineOpen = false;
  editFor = null;
  editDraft = '';
  noteFor = null;
  noteMode = null;
  noteDraft = '';
  answeredSeen = new Set();
  searchQuery = '';
  location.hash = '#/home';
  showGate();
}

async function login(email: string, password: string): Promise<void> {
  const button = el<HTMLButtonElement>('login-button');
  const error = el('login-error');
  error.hidden = true;
  button.disabled = true;
  try {
    const { error: err } = await sb.auth.signInWithPassword({ email, password });
    if (err) {
      error.hidden = false;
      return;
    }
    await loadAndShow();
  } catch (err) {
    console.warn('[auth] login failed:', err);
    error.hidden = false;
  } finally {
    button.disabled = false;
  }
}

// ---- wiring ---------------------------------------------------------------

function openNoteBox(target: string | null, mode: 'claude' | 'mine'): void {
  const same = noteFor === target && noteMode === mode;
  noteFor = same ? null : target;
  noteMode = same ? null : mode;
  noteDraft = '';
  render();
  focusNote();
}

function onAct(btn: HTMLElement): void {
  const id = btn.dataset.id ?? '';
  switch (btn.dataset.act) {
    case 'logout':
      void logout();
      break;
    case 'retry':
      void loadAndShow();
      break;
    case 'roll':
      roll();
      break;
    case 'write-save': {
      const text = writeBody;
      if (text.trim())
        void saveRequest('new', 'new', text, undefined, writeTitle.trim() || undefined);
      break;
    }
    case 'install':
      void runInstall();
      break;
    case 'includes-more':
      includesOpen = true;
      render();
      break;
    case 'roll-back':
      stepRoll(-1);
      break;
    case 'roll-next':
      stepRoll(1);
      break;
    case 'back-today':
      rolled = null;
      updateTodaySlot();
      break;
    case 'toggle-trash':
      trashOpen = !trashOpen;
      if (lib) el('trash-slot').innerHTML = trashCardHtml(lib, trashOpen);
      break;
    case 'undo':
      void undoTrash(id);
      break;
    case 'trash':
      if (!lib?.trashed.has(id)) void saveRequest(id, 'trash');
      break;
    case 'kind-open':
      kindOpen = !kindOpen;
      render();
      break;
    case 'pick-kind': {
      const kind = btn.dataset.kind ?? '';
      const pid = currentPieceId();
      if (pid && KIND_LABEL[kind]) void saveRequest(pid, 'kind', kind);
      break;
    }
    case 'top':
      void saveRequest(id, 'top', id);
      break;
    case 'note-open': {
      editFor = null;
      openNoteBox(currentPieceId(), 'claude');
      break;
    }
    case 'mine-open':
      editFor = null;
      openNoteBox(currentPieceId(), 'mine');
      break;
    case 'note-general':
      openNoteBox('general', 'claude');
      break;
    case 'mine-general':
      openNoteBox('general', 'mine');
      break;
    case 'toggle-mine':
      mineOpen = !mineOpen;
      render();
      break;
    case 'mine-send': {
      const text = noteDraft.trim();
      if (text) {
        void saveRequest(id, 'mine', text).then((ok) => {
          if (!ok) return;
          noteFor = null;
          noteMode = null;
          noteDraft = '';
          render();
        });
      }
      break;
    }
    case 'note-cancel':
      noteFor = null;
      noteMode = null;
      noteDraft = '';
      render();
      break;
    case 'note-send': {
      const text = noteDraft.trim();
      if (text) {
        void saveRequest(id, 'note', text).then((ok) => {
          if (!ok) return;
          noteFor = null;
          noteMode = null;
          noteDraft = '';
          render();
        });
      }
      break;
    }
    case 'toggle-notes':
      notesOpen = !notesOpen;
      if (notesOpen) markSeen();
      render();
      break;
    case 'edit-open': {
      const pid = currentPieceId();
      const piece = pid ? lib?.byId.get(pid) : undefined;
      if (!pid || !piece || !piece.editable) break;
      editFor = editFor === pid ? null : pid;
      editDraft = piece.body;
      noteFor = null;
      noteMode = null;
      kindOpen = false;
      render();
      if (editFor) {
        const box = document.getElementById('edit-text');
        box?.focus();
      }
      break;
    }
    case 'edit-cancel':
      editFor = null;
      editDraft = '';
      render();
      break;
    case 'edit-save': {
      const piece = lib?.byId.get(id);
      if (!piece) break;
      const norm = (s: string): string => s.split('\r\n').join('\n');
      if (norm(editDraft) === norm(piece.body)) {
        editFor = null;
        editDraft = '';
        render();
      } else {
        void saveRequest(id, 'edit', editDraft, piece.drive_modified);
      }
      break;
    }
    case 'undo-edit':
      void deleteRequests((lib?.edits.get(id) ?? []).map((r) => r.id));
      break;
    case 'dismiss-edit':
      dismissedEdits.add(Number(id));
      saveDismissed();
      render();
      break;
    case 'unsend':
      void deleteRequests([Number(id)]);
      break;
  }
}

function wire(): void {
  window.addEventListener('hashchange', () => {
    const was = lastRouteKey;
    render();
    const now = parseHash(location.hash).name;
    if (now !== was && (now === 'home' || now === 'write')) void reloadRequests();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void reloadRequests();
    else persistDraft();
  });

  el<HTMLFormElement>('login-form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const email = el<HTMLInputElement>('login-email').value.trim();
    const password = el<HTMLInputElement>('login-password').value;
    void login(email, password);
  });

  document.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t instanceof HTMLInputElement && t.id === 'search') {
      searchQuery = t.value;
      updateSearchResults();
    } else if (t instanceof HTMLTextAreaElement && t.id === 'note-text') {
      noteDraft = t.value;
    } else if (t instanceof HTMLInputElement && t.id === 'write-title') {
      writeTitle = t.value;
      scheduleDraftSave();
    } else if (t instanceof HTMLTextAreaElement && t.id === 'write-body') {
      writeBody = t.value;
      autogrow('write-body');
      scheduleDraftSave();
    } else if (t instanceof HTMLTextAreaElement && t.id === 'edit-text') {
      editDraft = t.value;
      autogrow();
    }
  });

  document.addEventListener('click', (ev) => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    const letter = t.closest<HTMLElement>('[data-letter]');
    if (letter?.dataset.letter) {
      document.getElementById(letter.dataset.letter)?.scrollIntoView({ block: 'start' });
      return;
    }
    const btn = t.closest<HTMLElement>('[data-act]');
    if (btn) onAct(btn);
  });
}

async function boot(): Promise<void> {
  el('app-version').textContent = APP_VERSION;
  loadDraft();
  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    installEvent = ev as BeforeInstallPromptEvent;
    updateInstallSlot();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    installEvent = null;
    updateInstallSlot();
  });
  window.addEventListener('pagehide', persistDraft);
  wire();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {
      // installs fine without it; offline just won't work
    });
  }
  try {
    const { data } = await sb.auth.getSession();
    if (data.session) {
      await loadAndShow();
      return;
    }
  } catch (err) {
    console.warn('[auth] getSession failed:', err);
  }
  showGate();
}

void boot();
