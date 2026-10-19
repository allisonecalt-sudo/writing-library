// My Writing: a private, read-only reading app. Drive is the master; this only reads.
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildLibrary, fetchAll } from './lib/data.js';
import { parseHash, tabOf } from './lib/route.js';
import { searchWorks } from './lib/search.js';
import type { Library, Route } from './lib/types.js';
import {
  browseHtml,
  firstLinesHtml,
  homeHtml,
  pieceHtml,
  searchResultsHtml,
  shelfHtml,
  shelvesHtml,
} from './lib/views.js';

declare global {
  interface Window {
    supabase: { createClient: (url: string, key: string) => SupabaseClient };
  }
}

// Same Supabase project as the budget app. The anon key is public by design;
// the writing_pieces table itself is only readable by her logged-in user (RLS).
const SB_URL = 'https://hpiyvnfhoqnnnotrmwaz.supabase.co';
const SB_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwaXl2bmZob3Fubm5vdHJtd2F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0NzIwNDEsImV4cCI6MjA4ODA0ODA0MX0.AsGhYitkSnyVMwpJII05UseS_gICaXiCy7d8iHsr6Qw';

// Bump together with VERSION in sw.js on every deploy.
const APP_VERSION = 'v1.0';

const sb = window.supabase.createClient(SB_URL, SB_KEY);

let lib: Library | null = null;
let searchQuery = '';
let lastListHash = '#/home';
let lastRouteKey = '';

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
  switch (route.name) {
    case 'home':
      setView(homeHtml(lib, searchQuery));
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
          ? pieceHtml(lib, piece, lastListHash)
          : `<p class="crumb"><a href="#/home">‹ Home</a></p><p class="empty">Nothing here yet</p>`,
      );
      break;
    }
  }
  const key = routeKey(route);
  if (key !== lastRouteKey) window.scrollTo(0, 0);
  lastRouteKey = key;
}

async function loadAndShow(): Promise<void> {
  showApp();
  setView('<p class="loading">Loading…</p>');
  try {
    lib = buildLibrary(await fetchAll(sb));
    render();
  } catch (err) {
    console.warn('[load] failed:', err);
    setView(
      `<p class="empty">Couldn't load your writing.</p>
       <p class="footer-links"><button type="button" class="linklike" data-act="retry">Try again</button></p>`,
    );
  }
}

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
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'logout') void logout();
    else if (act === 'retry') void loadAndShow();
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
