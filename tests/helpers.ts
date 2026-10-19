// Test helpers: invented placeholder data and a full in-test Supabase mock.
// Nothing here touches the real project, and none of this is her writing.
import type { Page, Request } from '@playwright/test';
import path from 'node:path';

export interface Row {
  drive_id: string;
  work_id: string;
  is_top: boolean;
  top_by: string | null;
  title: string;
  has_title: boolean;
  first_line: string;
  kind: string;
  kind_by: string | null;
  editable: boolean;
  written: string | null;
  also_in: string[];
  year: number | null;
  themes: string[];
  mood: string | null;
  shelves: string[];
  folder: string;
  body: string;
  words: number;
  drive_created: string;
  drive_modified: string;
  link: string;
  source: string;
  note: string | null;
}

export function row(over: Partial<Row> & { drive_id: string }): Row {
  const body = over.body ?? 'Placeholder line one\nPlaceholder line two';
  return {
    work_id: over.drive_id,
    is_top: true,
    top_by: null,
    title: 'Placeholder title',
    has_title: true,
    first_line: body.split('\n')[0],
    kind: 'poem',
    kind_by: null,
    editable: false,
    written: null,
    also_in: [],
    year: 2021,
    themes: [],
    mood: null,
    shelves: [],
    folder: 'Placeholder folder',
    body,
    words: body.split(/\s+/).length,
    drive_created: '2021-03-01T10:00:00Z',
    drive_modified: '2022-03-01T10:00:00Z',
    link: `https://drive.example.test/file/${over.drive_id}`,
    source: 'test',
    note: null,
    ...over,
  };
}

export const FIXTURE: Row[] = [
  // Work A: three versions, "a1" is on top
  row({
    drive_id: 'a1',
    work_id: 'work-a',
    title: 'Placeholder Poem Alpha',
    editable: true,
    written: '2026-01-12',
    body: 'Placeholder poem one, line one\nPlaceholder poem one, line two\n\nPlaceholder stanza two, lantern',
    year: 2021,
    themes: ['Family', 'Healing & recovery'],
    mood: 'warm tribute',
    shelves: ['Found Gold'],
    drive_modified: '2023-05-02T10:00:00Z',
  }),
  row({
    drive_id: 'a2',
    work_id: 'work-a',
    is_top: false,
    title: 'Placeholder Poem Alpha (draft)',
    written: '2022',
    body: 'Draft of alpha, first try\nDraft of alpha, second try',
    drive_modified: '2021-04-10T10:00:00Z',
  }),
  row({
    drive_id: 'a3',
    work_id: 'work-a',
    is_top: false,
    title: 'Placeholder Poem Alpha (polished)',
    written: '2024-03',
    kind: 'draft',
    body: 'Polished alpha, tidy line one\nPolished alpha, tidy line two',
    note: 'AI-polished (ChatGPT) — your own version is on top',
    drive_modified: '2022-09-15T10:00:00Z',
  }),
  // Work B: two versions
  row({
    drive_id: 'b1',
    work_id: 'work-b',
    title: 'Placeholder Poem Beta',
    body: '"Quoted opening for beta"\nPlaceholder beta, line two',
    year: 2019,
    themes: ['Darkness & fear'],
    mood: 'dark & raw',
    shelves: ['Found Gold', 'In the Darkness'],
  }),
  row({
    drive_id: 'b2',
    work_id: 'work-b',
    is_top: false,
    title: 'Placeholder Poem Beta (older)',
    body: 'Older beta, line one',
    year: 2019,
    drive_modified: '2019-06-01T10:00:00Z',
  }),
  // Hebrew piece
  row({
    drive_id: 'c1',
    work_id: 'work-c',
    title: 'שיר לדוגמה',
    editable: true,
    body: 'שורה ראשונה לדוגמה\nשורה שנייה לדוגמה',
    year: 2020,
    themes: ['Faith & God'],
    mood: 'serious',
  }),
  // Untitled
  row({
    drive_id: 'd1',
    work_id: 'work-d',
    title: '',
    has_title: false,
    body: 'Untitled placeholder opening line\nSecond untitled line',
    year: null,
  }),
  // Other kinds
  row({
    drive_id: 'e1',
    work_id: 'work-e',
    title: 'Placeholder Musing',
    editable: true,
    kind: 'musing',
    year: 2021,
    themes: ['Writing'],
    mood: 'light & fun',
    body: 'Zebra musing placeholder, line one',
  }),
  row({
    drive_id: 'f1',
    work_id: 'work-f',
    title: 'Placeholder Letter',
    kind: 'letter',
    year: 2018,
    themes: ['For someone'],
    body: 'Dear placeholder, line one',
  }),
];

function b64url(obj: object): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

export function fakeSession(): object {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const jwt = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: 'user-1', role: 'authenticated', exp })}.sig`;
  return {
    access_token: jwt,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: 'fake-refresh',
    user: {
      id: 'user-1',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'test@example.test',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00Z',
    },
  };
}

const UMD = path.join(
  __dirname,
  '..',
  'node_modules',
  '@supabase',
  'supabase-js',
  'dist',
  'umd',
  'supabase.js',
);

export interface ReqRow {
  id: number;
  drive_id: string;
  action: string;
  value: string | null;
  created_at: string;
  done_at: string | null;
  result: string | null;
  base_modified?: string | null;
  title?: string | null;
}

export interface SeenFixture {
  drive_id: string;
  first_seen: string;
  last_seen: string;
  times: number;
}

export interface MockOptions {
  requests?: ReqRow[];
  /** Make every POST to writing_requests fail with a 500. */
  failPost?: boolean;
  /** Rows already in writing_seen. */
  seen?: SeenFixture[];
  /** How long a poem must stay on screen to count as seen. Default: out of the way (1 hour). Pass null for the real 3 s. */
  seenStayMs?: number | null;
}

export interface Mock {
  /** The server-side writing_requests table (mutated by POST / DELETE). */
  requests: ReqRow[];
  /** The server-side writing_seen table, and every upsert the app sent. */
  seen: SeenFixture[];
  seenWrites: SeenFixture[];
  /** Every request made to the writing_pieces endpoint. */
  restRequests: Request[];
}

export async function mockSupabase(
  page: Page,
  rows: Row[] = FIXTURE,
  opts: MockOptions = {},
): Promise<Mock> {
  const mock: Mock = {
    restRequests: [],
    requests: [...(opts.requests ?? [])],
    seen: [...(opts.seen ?? [])],
    seenWrites: [],
  };
  if (opts.seenStayMs !== null) {
    const ms = opts.seenStayMs ?? 3_600_000;
    await page.addInitScript((v) => {
      (window as unknown as Record<string, unknown>).__WL_STAY_MS = v;
    }, ms);
  }
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': '*',
  };
  // Serve the supabase-js bundle from node_modules so the suite needs no network.
  await page.route('**/supabase-js@2.118.0', (route) =>
    route.fulfill({ path: UMD, contentType: 'application/javascript' }),
  );
  await page.route('**/auth/v1/token**', (route) =>
    route.fulfill({
      status: 200,
      headers: cors,
      contentType: 'application/json',
      body: JSON.stringify(fakeSession()),
    }),
  );
  await page.route('**/auth/v1/logout**', (route) => route.fulfill({ status: 204, headers: cors }));
  await page.route('**/rest/v1/writing_pieces**', (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    mock.restRequests.push(req);
    const url = new URL(req.url());
    const range = req.headers()['range'];
    let offset = Number(url.searchParams.get('offset') ?? 0);
    let limit = Number(url.searchParams.get('limit') ?? 1000);
    if (range) {
      const [a, b] = range.split('-').map(Number);
      offset = a;
      limit = Math.min(b - a + 1, 1000);
    }
    return route.fulfill({
      status: 200,
      headers: cors,
      contentType: 'application/json',
      body: JSON.stringify(rows.slice(offset, offset + Math.min(limit, 1000))),
    });
  });
  await page.route('**/rest/v1/writing_seen**', (route) => {
    const req = route.request();
    const json = { 'content-type': 'application/json', ...cors };
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (method === 'POST' || method === 'PATCH') {
      const body = JSON.parse(req.postData() ?? '{}') as
        Partial<SeenFixture> | Partial<SeenFixture>[];
      for (const r of Array.isArray(body) ? body : [body]) {
        const row = {
          drive_id: String(r.drive_id),
          last_seen: String(r.last_seen),
          times: Number(r.times ?? 1),
        };
        mock.seenWrites.push({ ...row, first_seen: row.last_seen });
        const at = mock.seen.findIndex((s) => s.drive_id === row.drive_id);
        if (at >= 0) mock.seen[at] = { ...mock.seen[at], ...row };
        else mock.seen.push({ ...row, first_seen: row.last_seen });
      }
      return route.fulfill({ status: 201, headers: json, body: '' });
    }
    const url = new URL(req.url());
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 1000);
    return route.fulfill({
      status: 200,
      headers: json,
      body: JSON.stringify(mock.seen.slice(offset, offset + limit)),
    });
  });
  await page.route('**/rest/v1/writing_requests**', (route) => {
    const req = route.request();
    const json = { 'content-type': 'application/json', ...cors };
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (method === 'POST') {
      if (opts.failPost) {
        return route.fulfill({
          status: 500,
          headers: json,
          body: JSON.stringify({ message: 'boom' }),
        });
      }
      const body = JSON.parse(req.postData() ?? '{}') as Partial<ReqRow>;
      const created: ReqRow = {
        id: Math.max(0, ...mock.requests.map((r) => r.id)) + 1,
        drive_id: String(body.drive_id),
        action: String(body.action),
        value: body.value ?? null,
        created_at: new Date().toISOString(),
        done_at: null,
        result: null,
        base_modified: body.base_modified ?? null,
        title: body.title ?? null,
      };
      mock.requests.push(created);
      return route.fulfill({ status: 201, headers: json, body: JSON.stringify([created]) });
    }
    if (method === 'DELETE') {
      const url = new URL(req.url());
      const id = Number((url.searchParams.get('id') ?? '').replace('eq.', ''));
      const gone = mock.requests.filter((r) => r.id === id && r.done_at === null);
      mock.requests = mock.requests.filter((r) => !gone.includes(r));
      return route.fulfill({ status: 200, headers: json, body: JSON.stringify(gone) });
    }
    const url = new URL(req.url());
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 1000);
    return route.fulfill({
      status: 200,
      headers: json,
      body: JSON.stringify(mock.requests.slice(offset, offset + limit)),
    });
  });
  return mock;
}

export async function login(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('#login-email').fill('test@example.test');
  await page.locator('#login-password').fill('not-a-real-password');
  await page.locator('#login-button').click();
  await page.locator('#search').waitFor();
}
