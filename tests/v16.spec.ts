import { expect, test, type Page } from '@playwright/test';
import { login, mockSupabase, row, type ReqRow, type Row, type SeenFixture } from './helpers';

// v1.6: Write tab, install as an app, and the dice that favour poems she hasn't seen.

function newItem(id: number, over: Partial<ReqRow> = {}): ReqRow {
  return {
    id,
    drive_id: 'new',
    action: 'new',
    value: 'Placeholder new text\nsecond line',
    title: null,
    created_at: `2026-10-19T1${id}:00:00Z`,
    done_at: null,
    result: null,
    ...over,
  };
}

async function goto(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
}

function poems(n: number): Row[] {
  return Array.from({ length: n }, (_, i) =>
    row({
      drive_id: `p${String(i).padStart(2, '0')}`,
      title: `Placeholder poem ${i}`,
      body: `Body of placeholder poem ${i}\nsecond line`,
    }),
  );
}

function seenRow(id: string, minutesAgo: number): SeenFixture {
  const t = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  return { drive_id: id, first_seen: t, last_seen: t, times: 1 };
}

// ---------------------------------------------------------------- Write tab

test('five tabs, Write is the fifth, and an empty Write tab shows just the form', async ({
  page,
}) => {
  await mockSupabase(page);
  await login(page);
  const labels = await page.locator('.tabs .tab').allInnerTexts();
  expect(labels).toHaveLength(5);
  expect(labels[4]).toContain('Write');
  await page.getByRole('link', { name: /Write/ }).click();
  await expect(page).toHaveURL(/#\/write$/);
  await expect(page.locator('.tab.active')).toContainText('Write');
  await expect(page.locator('#write-title')).toHaveAttribute('dir', 'auto');
  await expect(page.locator('#write-body')).toHaveAttribute('dir', 'auto');
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  await expect(page.locator('.caption').first()).toHaveText(
    'Claude files it into Drive in the right place. Then it shows up here like everything else.',
  );
  await expect(page.locator('.write-item')).toHaveCount(0);
  // the tab for First lines keeps its full accessible name
  await expect(page.getByRole('link', { name: 'First lines' })).toBeVisible();
});

test('save: inserts the exact text, lists it as waiting, Unsend removes it', async ({ page }) => {
  const mock = await mockSupabase(page);
  await login(page);
  await goto(page, '#/write');
  const typed = 'שורה ראשונה\n\n  Indented second line\nlast line';
  await page.locator('#write-title').fill('Placeholder title');
  await page.locator('#write-body').fill(typed);
  await page.getByRole('button', { name: 'Save' }).click();

  expect(mock.requests).toHaveLength(1);
  expect(mock.requests[0]).toMatchObject({
    drive_id: 'new',
    action: 'new',
    title: 'Placeholder title',
    value: typed,
    done_at: null,
  });
  await expect(page.locator('#write-body')).toHaveValue('');
  await expect(page.locator('#write-title')).toHaveValue('');
  const item = page.locator('.write-item');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('Placeholder title');
  await expect(item).toContainText('Waiting for Claude to file it');

  await item.getByRole('button', { name: 'Unsend' }).click();
  await expect(page.locator('.write-item')).toHaveCount(0);
  expect(mock.requests).toHaveLength(0);
});

test('an untitled save is listed by its first line, newest first', async ({ page }) => {
  await mockSupabase(page, undefined, {
    requests: [
      newItem(1, { value: 'Older first line\nmore' }),
      newItem(2, { value: 'Newer first line\nmore' }),
    ],
  });
  await login(page);
  await goto(page, '#/write');
  const titles = await page.locator('.write-item .card-title').allInnerTexts();
  expect(titles).toEqual(['Newer first line', 'Older first line']);
  await expect(page.locator('.write-item .card-title').first()).toHaveClass(/untitled/);
});

test('a filed item shows "Filed:" and links to the piece when drive_id is known', async ({
  page,
}) => {
  await mockSupabase(page, undefined, {
    requests: [
      newItem(1, {
        title: 'Filed one',
        drive_id: 'a1',
        done_at: '2026-10-20T00:00:00Z',
        result: 'Filed as a Poem in poems/2026',
      }),
      newItem(2, {
        title: 'Filed elsewhere',
        drive_id: 'not-in-data',
        done_at: '2026-10-20T00:00:00Z',
        result: 'Filed as a Musing',
      }),
    ],
  });
  await login(page);
  await goto(page, '#/write');
  const linked = page.locator('.write-item', { hasText: 'Filed one' });
  await expect(linked).toContainText('Filed: Filed as a Poem in poems/2026');
  await expect(linked.locator('a.also-link')).toHaveAttribute('href', '#/p/a1');
  await expect(linked.getByRole('button', { name: 'Unsend' })).toHaveCount(0);
  const plain = page.locator('.write-item', { hasText: 'Filed elsewhere' });
  await expect(plain).toContainText('Filed: Filed as a Musing');
  await expect(plain.locator('a')).toHaveCount(0);
  await linked.locator('a.also-link').click();
  await expect(page).toHaveURL(/#\/p\/a1$/);
});

test('a failed save keeps her text and shows the error line', async ({ page }) => {
  const mock = await mockSupabase(page, undefined, { failPost: true });
  await login(page);
  await goto(page, '#/write');
  await page.locator('#write-title').fill('Keep me');
  await page.locator('#write-body').fill('Text I must not lose\nline two');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#save-error')).toHaveText("Couldn't save that. Try again.");
  await expect(page.locator('#write-body')).toHaveValue('Text I must not lose\nline two');
  await expect(page.locator('#write-title')).toHaveValue('Keep me');
  await expect(page.locator('.write-item')).toHaveCount(0);
  expect(mock.requests).toHaveLength(0);
});

test('the draft survives a reload and is cleared on Save', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  await goto(page, '#/write');
  await page.locator('#write-title').fill('Draft title');
  await page.locator('#write-body').fill('Draft body\nsecond line');
  // saved to this device every few seconds
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('wl-write-body')), { timeout: 5000 })
    .toBe('Draft body\nsecond line');
  await page.reload();
  await page.locator('#write-body').waitFor();
  await expect(page.locator('#write-title')).toHaveValue('Draft title');
  await expect(page.locator('#write-body')).toHaveValue('Draft body\nsecond line');

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.write-item')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('wl-write-body'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('wl-write-title'))).toBeNull();
  await page.reload();
  await page.locator('#write-body').waitFor();
  await expect(page.locator('#write-body')).toHaveValue('');
});

test('the writing area grows with the text', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  await goto(page, '#/write');
  const box = page.locator('#write-body');
  const before = await box.evaluate((n) => n.getBoundingClientRect().height);
  await box.fill(Array.from({ length: 40 }, (_, i) => `Placeholder line ${i}`).join('\n'));
  const after = await box.evaluate((n) => n.getBoundingClientRect().height);
  expect(after).toBeGreaterThan(before + 200);
  expect(await box.evaluate((n) => getComputedStyle(n).fontFamily)).toContain('Georgia');
});

test('new writing never changes kind, top, trash or edit state', async ({ page }) => {
  await mockSupabase(page, undefined, { requests: [newItem(1, { drive_id: 'a2' })] });
  await login(page);
  await expect(page.locator('.counts')).toHaveText('9 pieces · 4 poems · 2 with versions');
  await expect(page.locator('#trash-slot')).toBeEmpty();
  await goto(page, '#/p/a2');
  await expect(page.locator('.pill', { hasText: 'on top' })).toContainText(
    'Placeholder Poem Alpha',
  );
  await expect(page.locator('.banner')).toHaveCount(0);
});

test('five tabs fit from 320 to 430 px with no sideways scroll', async ({ page }) => {
  await mockSupabase(page);
  for (const width of [320, 360, 412, 430]) {
    await page.setViewportSize({ width, height: 892 });
    await page.goto('/');
    if (await page.locator('#login-form').isVisible()) {
      await page.locator('#login-email').fill('test@example.test');
      await page.locator('#login-password').fill('not-a-real-password');
      await page.locator('#login-button').click();
    }
    await page.locator('#search').waitFor();
    for (const hash of ['#/home', '#/write']) {
      await goto(page, hash);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        ),
        `${hash} at ${width}`,
      ).toBe(true);
    }
    const boxes = await page.locator('.tabs .tab').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { left: r.left, right: r.right, over: e.scrollWidth > e.clientWidth };
      }),
    );
    expect(boxes).toHaveLength(5);
    for (const b of boxes) {
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(width);
      expect(b.over).toBe(false);
    }
  }
});

// ---------------------------------------------------------------- Install

test('with no install event and not standalone, a one-line hint shows', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  await expect(page.locator('#install-slot')).toContainText(
    'To install: browser menu ⋮ → Add to Home screen',
  );
  await expect(page.getByRole('button', { name: '📲 Install app' })).toHaveCount(0);
});

test('a beforeinstallprompt shows the button, and tapping it calls prompt()', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__prompted = 0;
    const ev = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(ev, {
      prompt: () => {
        w.__prompted = Number(w.__prompted) + 1;
        return Promise.resolve();
      },
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    window.dispatchEvent(ev);
  });
  const button = page.getByRole('button', { name: '📲 Install app' });
  await expect(button).toBeVisible();
  await expect(page.locator('#install-slot')).not.toContainText('Add to Home screen');
  await button.click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as Record<string, unknown>).__prompted))
    .toBe(1);
  await expect(button).toHaveCount(0); // an install prompt can only be used once
});

test('appinstalled hides the install control', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  await page.evaluate(() => {
    const ev = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(ev, { prompt: () => Promise.resolve(), userChoice: Promise.resolve({}) });
    window.dispatchEvent(ev);
  });
  await expect(page.getByRole('button', { name: '📲 Install app' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.getByRole('button', { name: '📲 Install app' })).toHaveCount(0);
  await expect(page.locator('#install-slot')).toBeEmpty();
});

test('standalone mode hides the install button and the hint', async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (q: string): MediaQueryList => {
      const list = original(q);
      return q.includes('display-mode: standalone')
        ? ({ ...list, matches: true, media: q } as unknown as MediaQueryList)
        : list;
    };
  });
  await mockSupabase(page);
  await login(page);
  await expect(page.locator('#install-slot')).toBeEmpty();
});

test('the manifest and service worker meet the install criteria', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  const m = (await res.json()) as Record<string, unknown> & {
    icons: { sizes: string; purpose: string; type: string }[];
  };
  expect(m.name).toBe('My Writing');
  expect(m.short_name).toBe('My Writing');
  expect(m.start_url).toBe('./');
  expect(m.scope).toBe('./');
  expect(m.display).toBe('standalone');
  expect(m.theme_color).toMatch(/^#/);
  expect(m.background_color).toMatch(/^#/);
  expect(m.icons.some((i) => i.sizes === '192x192' && i.type === 'image/png')).toBe(true);
  expect(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any')).toBe(true);
  expect(m.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
  for (const icon of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
    expect((await request.get(`/${icon}`)).ok()).toBe(true);
  }
  const sw = await (await request.get('/sw.js')).text();
  expect(sw).toContain("addEventListener('fetch'");
});

// ---------------------------------------------------------------- Seen + dice

test('opening a piece records it as seen, once a minute at most', async ({ page }) => {
  const mock = await mockSupabase(page);
  await login(page);
  await goto(page, '#/p/b1');
  await expect.poll(() => mock.seenWrites.filter((w) => w.drive_id === 'b1').length).toBe(1);
  expect(mock.seenWrites[0]).toMatchObject({ drive_id: 'b1', times: 1 });
  // away and back within a minute: not sent again
  await goto(page, '#/home');
  await goto(page, '#/p/b1');
  await page.waitForTimeout(400);
  expect(mock.seenWrites.filter((w) => w.drive_id === 'b1')).toHaveLength(1);
  // a different piece is its own row
  await goto(page, '#/p/e1');
  await expect.poll(() => mock.seenWrites.filter((w) => w.drive_id === 'e1').length).toBe(1);
});

test('a failed seen write never shows an error or blocks anything', async ({ page }) => {
  await mockSupabase(page);
  await page.route('**/rest/v1/writing_seen**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          status: 200,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: '[]',
        })
      : route.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*' }, body: '{}' }),
  );
  await login(page);
  await goto(page, '#/p/b1');
  await expect(page.locator('.piece-title')).toHaveText('Placeholder Poem Beta');
  await page.waitForTimeout(300);
  await expect(page.locator('#save-error')).toBeHidden();
});

test('Today’s poem counts as seen only after she stays 3 seconds', async ({ page }) => {
  const mock = await mockSupabase(page, poems(5), { seenStayMs: null });
  await login(page);
  await page.waitForTimeout(1500);
  expect(mock.seenWrites).toHaveLength(0);
  await expect.poll(() => mock.seenWrites.length, { timeout: 5000 }).toBe(1);
  const shownTitle = await page.locator('#today-slot .card-title').innerText();
  const id = `p${shownTitle.replace('Placeholder poem ', '').padStart(2, '0')}`;
  expect(mock.seenWrites[0].drive_id).toBe(id);
});

test('leaving Home before 3 seconds means no seen mark', async ({ page }) => {
  const mock = await mockSupabase(page, poems(5), { seenStayMs: 1200 });
  await login(page);
  await goto(page, '#/browse');
  await page.waitForTimeout(1800);
  expect(mock.seenWrites).toHaveLength(0);
});

test('the dice never pick a seen or noted poem while unseen ones exist', async ({ page }) => {
  const rows = poems(6); // p00..p05
  await mockSupabase(page, rows, {
    seen: [seenRow('p00', 5)],
    requests: [
      {
        id: 1,
        drive_id: 'p01',
        action: 'note',
        value: 'a note',
        created_at: '2026-10-19T10:00:00Z',
        done_at: null,
        result: null,
      },
      {
        id: 2,
        drive_id: 'p02',
        action: 'mine',
        value: 'mine',
        created_at: '2026-10-19T10:01:00Z',
        done_at: null,
        result: null,
      },
    ],
  });
  await login(page);
  const allowed = new Set([
    'Body of placeholder poem 3',
    'Body of placeholder poem 4',
    'Body of placeholder poem 5',
  ]);
  for (let i = 0; i < 8; i++) {
    await page.locator('#roll').click();
    await expect(page.locator('#today-slot .label')).toHaveText('🎲 Rolled poem');
    await expect(page.locator('#roll .die')).not.toHaveClass(/rolling/);
    const first = (await page.locator('#today-slot .body').innerText()).split('\n')[0];
    expect(allowed.has(first), first).toBe(true);
  }
  await expect(page.locator('.seen-line')).toHaveText("3 poems you haven't seen yet");
});

test('a note on another version of the work also keeps it out of the dice', async ({ page }) => {
  await mockSupabase(
    page,
    [
      row({
        drive_id: 'w1',
        work_id: 'w',
        title: 'Placeholder work top',
        body: 'Work top body\nx',
      }),
      row({
        drive_id: 'w2',
        work_id: 'w',
        is_top: false,
        title: 'Placeholder work older',
        body: 'Older body\nx',
      }),
      row({ drive_id: 'x1', title: 'Placeholder other', body: 'Other poem body\nx' }),
    ],
    {
      requests: [
        {
          id: 1,
          drive_id: 'w2',
          action: 'note',
          value: 'on the older version',
          created_at: '2026-10-19T10:00:00Z',
          done_at: null,
          result: null,
        },
      ],
    },
  );
  await login(page);
  for (let i = 0; i < 4; i++) {
    await page.locator('#roll').click();
    await expect(page.locator('#roll .die')).not.toHaveClass(/rolling/);
    await expect(page.locator('#today-slot .body')).toContainText('Other poem body');
  }
});

test('when every poem is seen, the dice use the oldest-seen and say so', async ({ page }) => {
  const rows = poems(30); // p00..p29, seen from oldest (p00) to newest (p29)
  await mockSupabase(page, rows, {
    seen: rows.map((r, i) => seenRow(r.drive_id, 1000 - i * 10)),
  });
  await login(page);
  await expect(page.locator('.seen-line')).toHaveText(
    "You've seen them all. Now the oldest-seen ones.",
  );
  for (let i = 0; i < 10; i++) {
    await page.locator('#roll').click();
    await expect(page.locator('#roll .die')).not.toHaveClass(/rolling/);
    const first = (await page.locator('#today-slot .body').innerText()).split('\n')[0];
    const n = Number(first.replace('Body of placeholder poem ', ''));
    expect(n, first).toBeLessThan(25); // never one of the 5 most recently seen
  }
  await expect(page.locator('.seen-line')).toHaveText(
    "You've seen them all. Now the oldest-seen ones.",
  );
});

test('the count line updates after a poem has been on screen for the stay time', async ({
  page,
}) => {
  const mock = await mockSupabase(page, poems(4), { seenStayMs: 400 });
  await login(page);
  const line = page.locator('.seen-line');
  // Today's poem is seen first
  await expect(line).toHaveText("3 poems you haven't seen yet");
  await page.locator('#roll').click();
  await expect(page.locator('#today-slot .label')).toHaveText('🎲 Rolled poem');
  await expect(line).toHaveText("2 poems you haven't seen yet");
  await expect.poll(() => mock.seenWrites.length).toBe(2);
  // a plain count: no percent, no bar
  await expect(page.locator('#today-slot')).not.toContainText('%');
});

test('a seen piece looks no different in lists', async ({ page }) => {
  await mockSupabase(page, undefined, { seen: [seenRow('b1', 5), seenRow('e1', 5)] });
  await login(page);
  await goto(page, '#/browse');
  await expect(page.locator('.cards .card')).toHaveCount(6);
  const classes = await page
    .locator('.cards .card')
    .evaluateAll((els) => els.map((e) => e.className));
  expect(new Set(classes).size).toBe(1);
});
