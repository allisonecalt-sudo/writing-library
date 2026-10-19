// My Writing: a private reading app. Drive is the master. The app reads the library and can
// only leave requests (trash / kind / top) in writing_requests; a nightly job applies them.
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildLibrary, fetchAll, fetchRequests, normaliseReq } from './lib/data.js';
import { KIND_LABEL } from './lib/format.js';
import { parseHash, tabOf } from './lib/route.js';
import { searchWorks } from './lib/search.js';
import type { Library, Piece, Req, Route } from './lib/types.js';
import {
  browseHtml,
  firstLinesHtml,
  homeHtml,
  pieceHtml,
  searchResultsHtml,
  shelfHtml,
  shelvesHtml,
  todaySlotHtml,
  trashCardHtml,
} from './lib/views.js';

declare global {
  interface Window {
    supabase: { createClient: (url: string, key: string) => SupabaseClient };
  }
}

// Same Supabase project as the budget app. The anon key is public by design;
// the writing tables are only readable by her logged-in user (RLS).
const SB_URL = 'https://hpiyvnfhoqnnnotrmwaz.supabase.co';
const SB_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwaXl2bmZob3Fubm5vdHJtd2F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NzIwNDEsImV4cCI6MjA4ODA0ODA0MX0.AsGhYitkSnyVMwpJII05UseS_gICaXiCy7d8iHsr6Qw';

// Bump together with VERSION in sw.js on every deploy.
const APP_VERSION = 'v1.1';

const ROLL_MS = 600;
const NO_REPEAT = 20;
const SAVE_ERROR = "Couldn't save that. Try again.";

const sb = window.supabase.createClient(SB_URL, SB_KEY);

let rawPieces: Piece[] = [];
let requests: Req[] = [];
let lib: Library | null = null;
let searchQuery = '';
let lastListHash = '#/home';
let lastRouteKey = '';
let rolled: Piece | null = null;
let rollHistory: string[] = [];
let rolling = false;
let trashOpen = false;
let kindOpen = false;
let busy = false;

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
    setError(false);
  }
  switch (route.name) {
    case 'home':
      setView(homeHtml(lib, { query: searchQuery, rolled, trashOpen }));
      updateSearchResults();
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
    case 'piece': {
      const piece = lib.byId.get(route.id);
      setView(
        piece
          ? pieceHtml(lib, piece, lastListHash, { kindOpen })
          : `<p class="crumb"><a href="#/home">‹ Home</a></p><p class="empty">Nothing here yet</p>`,
      );
      break;
    }
  }
  if (key !== lastRouteKey) window.scrollTo(0, 0);
  lastRouteKey = key;
}

async function loadAndShow(): Promise<void> {
  showApp();
  setView('<p class="loading">Loading…</p>');
  try {
    rawPieces = await fetchAll(sb);
    requests = await fetchRequests(sb);
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

function pickRandomPoem(): Piece | null {
  if (!lib) return null;
  const poems = lib.works.map((w) => w.top).filter((p) => p.kind === 'poem');
  if (poems.length === 0) return null;
  let pool = poems.filter((p) => !rollHistory.includes(p.drive_id));
  if (pool.length === 0) {
    // everything was rolled lately: start over, but never repeat the one on screen
    rollHistory = rolled ? [rolled.drive_id] : [];
    pool = poems.filter((p) => !rollHistory.includes(p.drive_id));
    if (pool.length === 0) pool = poems;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function showRolled(): void {
  rolling = false;
  const picked = pickRandomPoem();
  if (!picked || !lib) return;
  rolled = picked;
  rollHistory = [...rollHistory, picked.drive_id].slice(-NO_REPEAT);
  const slot = document.getElementById('today-slot');
  if (slot) slot.innerHTML = todaySlotHtml(lib, rolled);
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

async function saveRequest(drive_id: string, action: Req['action'], value?: string): Promise<void> {
  if (busy) return;
  busy = true;
  setError(false);
  try {
    const row: { drive_id: string; action: string; value?: string } = { drive_id, action };
    if (value !== undefined) row.value = value;
    const { data, error } = await sb.from('writing_requests').insert(row).select();
    const saved = (data ?? []) as Record<string, unknown>[];
    if (error || saved.length === 0) {
      setError(true);
      return;
    }
    requests = [...requests, ...saved.map(normaliseReq)];
    kindOpen = false;
    rebuild();
    render();
  } catch (err) {
    console.warn('[save] failed:', err);
    setError(true);
  } finally {
    busy = false;
  }
}

async function undoTrash(drive_id: string): Promise<void> {
  if (busy) return;
  const pending = lib?.trashed.get(drive_id) ?? [];
  if (pending.length === 0) return;
  busy = true;
  setError(false);
  try {
    const gone = new Set<number>();
    for (const r of pending) {
      const { data, error } = await sb
        .from('writing_requests')
        .delete()
        .eq('id', r.id)
        .is('done_at', null)
        .select();
      if (error || !data || data.length === 0) {
        setError(true);
        break;
      }
      gone.add(r.id);
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
    case 'back-today':
      rolled = null;
      if (lib) el('today-slot').innerHTML = todaySlotHtml(lib, null);
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
  }
}

function wire(): void {
  window.addEventListener('hashchange', render);

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
