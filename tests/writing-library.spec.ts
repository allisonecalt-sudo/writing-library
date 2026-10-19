import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { login, mockSupabase, row } from './helpers';

async function noSideScroll(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
}

test("shows only the login card until you log in, then Home with Today's poem", async ({
  page,
}) => {
  await mockSupabase(page);
  await page.goto('/');
  await expect(page.locator('#login-form')).toBeVisible();
  await expect(page.locator('.tabs')).toBeHidden();
  await expect(page.locator('#login-button')).toHaveText('Log in');

  await page.locator('#login-email').fill('test@example.test');
  await page.locator('#login-password').fill('not-a-real-password');
  await page.locator('#login-button').click();

  await expect(page.locator('#search')).toBeVisible();
  await expect(page.locator('.today .label')).toHaveText("Today's poem");
  await expect(page.locator('.today .body')).not.toBeEmpty();
  await expect(page.locator('.counts')).toHaveText('9 pieces · 4 poems · 2 with versions');
  await expect(page.locator('#app-version')).toHaveText('v1.2');
});

test('wrong login shows a plain error', async ({ page }) => {
  await mockSupabase(page);
  await page.route('**/auth/v1/token**', (route) =>
    route.fulfill({
      status: 400,
      headers: { 'access-control-allow-origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'invalid_grant',
        error_description: 'Invalid login credentials',
      }),
    }),
  );
  await page.goto('/');
  await page.locator('#login-email').fill('test@example.test');
  await page.locator('#login-password').fill('nope');
  await page.locator('#login-button').click();
  await expect(page.locator('#login-error')).toHaveText(
    "That didn't work. Check the email and password.",
  );
});

test("today's poem is a poem and opens the piece", async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  await expect(page.locator('.today .card-meta')).toContainText('Poem');
  await expect(page.locator('a.today')).toHaveAttribute('href', new RegExp('#/p/'));
});

test('search finds a piece by a body word, trims, and reaches into other versions', async ({
  page,
}) => {
  await mockSupabase(page);
  await login(page);
  await page.locator('#search').fill('  LANTERN  ');
  await expect(page.locator('#search-results .count')).toHaveText('1 found');
  await expect(page.locator('#search-results .card')).toHaveCount(1);
  await expect(page.locator('#search-results .card-title')).toHaveText('Placeholder Poem Alpha');

  // a word that only appears in a non-top version still finds the work (shown as its top)
  await page.locator('#search').fill('first try');
  await expect(page.locator('#search-results .card-title')).toHaveText('Placeholder Poem Alpha');

  // Hebrew works
  await page.locator('#search').fill('שנייה');
  await expect(page.locator('#search-results .count')).toHaveText('1 found');
  await expect(page.locator('#search-results .card-title')).toHaveText('שיר לדוגמה');

  // nothing found is gentle
  await page.locator('#search').fill('qqqqqq');
  await expect(page.locator('#search-results .count')).toHaveText('0 found');
  await expect(page.locator('#search-results .empty')).toHaveText('Nothing here yet');
});

test('Shelves lists each shelf with a count and opens its works', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  await page.getByRole('link', { name: /Shelves/ }).click();
  await expect(page.locator('.shelf-card')).toHaveCount(2);
  await expect(page.locator('.shelf-card', { hasText: 'Found Gold' })).toContainText('2 pieces');
  await expect(page.locator('.shelf-card', { hasText: 'In the Darkness' })).toContainText(
    '1 piece',
  );
  await page.locator('.shelf-card', { hasText: 'In the Darkness' }).click();
  await expect(page).toHaveURL(/#\/shelf\/In%20the%20Darkness/);
  await expect(page.locator('.cards .card')).toHaveCount(1);
});

test('Shelves empty state', async ({ page }) => {
  await mockSupabase(page, [row({ drive_id: 'x1', title: 'Placeholder only' })]);
  await login(page);
  await page.getByRole('link', { name: /Shelves/ }).click();
  await expect(page.locator('.empty')).toHaveText('No shelves yet');
});

test('Browse: a chip filters, AND across rows, and tapping again clears', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  await page.getByRole('link', { name: /Browse/ }).click();
  const cards = page.locator('.cards .card');
  await expect(cards).toHaveCount(6); // one per work
  await expect(page.locator('.caption')).toHaveText(
    "Kinds and themes are a first guess. Tell Claude what's off.",
  );

  await page.locator('.chip', { hasText: 'Musing' }).click();
  await expect(cards).toHaveCount(1);
  await expect(page.locator('.chip.clear')).toBeVisible();
  await expect(page).toHaveURL(/#\/browse\?kind=musing/);

  // AND across rows: with Musing selected, a theme no musing has is not offered
  await expect(page.locator('.chip', { hasText: 'Family' })).toHaveCount(0);
  await page.locator('.chip', { hasText: 'Musing' }).click();
  await expect(cards).toHaveCount(6);
  await expect(page.locator('.chip.clear')).toHaveCount(0);

  await page.locator('.chip', { hasText: 'Family' }).click();
  await expect(cards).toHaveCount(1);
  await page.locator('.chip', { hasText: /^Poem/ }).click();
  await expect(cards).toHaveCount(1);
  await page.locator('.chip.clear').click();
  await expect(cards).toHaveCount(6);
});

test('Browse sorts newest year first, no-year last', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  await page.getByRole('link', { name: /Browse/ }).click();
  await expect(page.locator('.cards .card')).toHaveCount(6);
  const metas = await page.locator('.cards .card .card-meta').allInnerTexts();
  const years = metas.map((m) => (/^\d{4}/.test(m) ? Number(m.slice(0, 4)) : 0));
  const sorted = [...years].sort((a, b) => b - a);
  expect(years).toEqual(sorted);
  expect(years[years.length - 1]).toBe(0); // the untitled piece has no year
});

test('First lines groups Hebrew under א–ת at the end, ignores leading quotes', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  await page.getByRole('link', { name: /First lines/ }).click();
  const heads = await page.locator('.letter-head').allInnerTexts();
  expect(heads[heads.length - 1]).toBe('א–ת');
  // beta's first line starts with a quote mark but files under its first letter
  expect(heads).toContain('Q');
  const group = page.locator('#fl-he .line-row');
  await expect(group).toHaveCount(1);
  await expect(group).toContainText('שורה ראשונה לדוגמה');
  // letter strip jumps
  await page.locator('.letter', { hasText: /^U$/ }).click();
  await expect(page.locator('#fl-U')).toBeInViewport();
});

test('piece view: versions row, switching changes body and URL, Drive link', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  await page.locator('#search').fill('alpha');
  await page.locator('#search-results .card').first().click();

  await expect(page).toHaveURL(/#\/p\/a1$/);
  await expect(page.locator('.piece-title')).toHaveText('Placeholder Poem Alpha');
  await expect(page.locator('.piece .card-meta')).toHaveText('2021 · Poem · Placeholder folder');
  await expect(page.locator('.piece .chip.small')).toHaveCount(2);

  const pills = page.locator('.pill');
  await expect(pills).toHaveCount(3);
  await expect(pills.first()).toContainText('on top');
  await expect(pills.first()).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.piece .body')).toContainText('Placeholder stanza two, lantern');

  await pills.nth(2).click(); // oldest
  await expect(page).toHaveURL(/#\/p\/a2$/);
  await expect(page.locator('.piece .body')).toContainText('Draft of alpha, first try');
  await expect(page.locator('.piece .body')).not.toContainText('lantern');

  await page.locator('.pill', { hasText: '(polished)' }).click();
  await expect(page.locator('.note')).toHaveText(
    'AI-polished (ChatGPT) — your own version is on top',
  );

  const drive = page.getByRole('link', { name: 'Open in Drive ↗' });
  await expect(drive).toHaveAttribute('href', 'https://drive.example.test/file/a3');
  await expect(drive).toHaveAttribute('target', '_blank');
  await expect(drive).toHaveAttribute('rel', 'noopener');

  // her text blocks are dir=auto and keep line breaks
  await expect(page.locator('.piece .body')).toHaveAttribute('dir', 'auto');
  expect(await page.locator('.piece .body').evaluate((n) => getComputedStyle(n).whiteSpace)).toBe(
    'pre-wrap',
  );

  // Android back returns to the previous version, then the list
  await page.goBack();
  await expect(page).toHaveURL(/#\/p\/a2$/);
});

test('untitled pieces show the first line in italics', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  await page.locator('#search').fill('untitled placeholder');
  const title = page.locator('#search-results .card-title');
  await expect(title).toHaveText('Untitled placeholder opening line');
  await expect(title).toHaveClass(/untitled/);
});

test('only the Open in Drive and Log in buttons use the accent colour', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  const accent = 'rgb(45, 106, 79)';
  await page.getByRole('link', { name: /Browse/ }).click();
  await page.locator('.chip', { hasText: 'Musing' }).click();
  const colors = await page.evaluate(() =>
    [...document.querySelectorAll('.chip, .tab, .card, .pill')].flatMap((n) => {
      const s = getComputedStyle(n);
      return [s.color, s.backgroundColor, s.borderTopColor];
    }),
  );
  expect(colors).not.toContain(accent);
});

test('requests the table in pages (range/offset) and stops on a short page', async ({ page }) => {
  const mock = await mockSupabase(page);
  await login(page);
  expect(mock.restRequests).toHaveLength(1);
  const req = mock.restRequests[0];
  const url = new URL(req.url());
  const paged =
    req.headers()['range'] !== undefined ||
    url.searchParams.has('offset') ||
    url.searchParams.has('limit');
  expect(paged).toBe(true);
  expect(`${req.headers()['range'] ?? ''}${url.search}`).toMatch(/0-999|limit=1000/);
});

test('keeps paging while a page comes back full, and holds all rows', async ({ page }) => {
  const many: ReturnType<typeof row>[] = [];
  for (let i = 0; i < 1005; i++) {
    many.push(row({ drive_id: `p${String(i).padStart(5, '0')}`, title: `Placeholder ${i}` }));
  }
  const mock = await mockSupabase(page, many);
  await login(page);
  await expect(page.locator('.counts')).toContainText('1,005 pieces');
  expect(mock.restRequests).toHaveLength(2);
  const second = mock.restRequests[1];
  const url = new URL(second.url());
  expect(`${second.headers()['range'] ?? ''}${url.search}`).toMatch(/1000-1999|offset=1000/);
});

test('no sideways scroll from 320 to 430 px on every screen', async ({ page }) => {
  await mockSupabase(page);
  for (const width of [320, 360, 412, 430]) {
    await page.setViewportSize({ width, height: 892 });
    await page.goto('/');
    if (await page.locator('#login-form').isVisible()) {
      expect(await noSideScroll(page)).toBe(true);
      await page.locator('#login-email').fill('test@example.test');
      await page.locator('#login-password').fill('not-a-real-password');
      await page.locator('#login-button').click();
      await page.locator('#search').waitFor();
    }
    for (const hash of [
      '#/home',
      '#/shelves',
      '#/shelf/Found%20Gold',
      '#/browse',
      '#/first',
      '#/p/a1',
    ]) {
      await page.evaluate((h) => {
        location.hash = h;
      }, hash);
      await page.waitForTimeout(60);
      expect(await noSideScroll(page), `${hash} at ${width}px`).toBe(true);
    }
  }
});

test('log out returns to the login card', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page.locator('#login-form')).toBeVisible();
});

test('APP_VERSION and the service worker cache version match', async () => {
  const root = path.join(__dirname, '..');
  const app = fs.readFileSync(path.join(root, 'app.ts'), 'utf8');
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const appVersion = /APP_VERSION = '([^']+)'/.exec(app)?.[1];
  const swVersion = /VERSION = 'writing-library-([^']+)'/.exec(sw)?.[1];
  expect(appVersion).toBeTruthy();
  expect(swVersion).toBe(appVersion);
});
