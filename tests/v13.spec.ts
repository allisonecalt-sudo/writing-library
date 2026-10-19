import { expect, test, type Page } from '@playwright/test';
import { login, mockSupabase, type ReqRow } from './helpers';

// v1.3: editing a Google Doc's text from the piece view (queued as an 'edit' request).

function edit(id: number, drive_id: string, value: string, over: Partial<ReqRow> = {}): ReqRow {
  return {
    id,
    drive_id,
    action: 'edit',
    value,
    created_at: `2026-10-19T1${id}:00:00Z`,
    done_at: null,
    result: null,
    base_modified: '2023-05-02T10:00:00Z',
    ...over,
  };
}

async function goto(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
}

async function openEdit(page: Page, hash: string): Promise<void> {
  await goto(page, hash);
  await page.getByRole('button', { name: '✏️ Edit' }).click();
}

test('Edit shows only for editable pieces', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  await goto(page, '#/p/a1'); // a Google Doc
  await expect(page.getByRole('button', { name: '✏️ Edit' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open in Drive ↗' })).toBeVisible();
  await goto(page, '#/p/b1'); // not editable (Word / PDF / etc.)
  await expect(page.getByRole('button', { name: '✏️ Edit' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open in Drive ↗' })).toBeVisible();
});

test('a piece waiting for the trash has no Edit control', async ({ page }) => {
  await mockSupabase(page, undefined, {
    requests: [
      {
        id: 1,
        drive_id: 'a1',
        action: 'trash',
        value: null,
        created_at: '2026-10-19T10:00:00Z',
        done_at: null,
        result: null,
      },
    ],
  });
  await login(page);
  await goto(page, '#/p/a1');
  await expect(page.getByRole('button', { name: '✏️ Edit' })).toHaveCount(0);
});

test('the edit box holds the current text in the serif font and grows with it', async ({
  page,
}) => {
  await mockSupabase(page);
  await login(page);
  await openEdit(page, '#/p/a1');
  const box = page.locator('#edit-text');
  await expect(box).toBeFocused();
  await expect(box).toHaveAttribute('dir', 'auto');
  await expect(box).toHaveValue(
    'Placeholder poem one, line one\nPlaceholder poem one, line two\n\nPlaceholder stanza two, lantern',
  );
  const font = await box.evaluate((n) => getComputedStyle(n).fontFamily);
  expect(font).toContain('Georgia');
  const before = await box.evaluate((n) => n.getBoundingClientRect().height);
  await box.fill(Array.from({ length: 30 }, (_, i) => `Placeholder long line ${i}`).join('\n'));
  const after = await box.evaluate((n) => n.getBoundingClientRect().height);
  expect(after).toBeGreaterThan(before + 100);
  // the page scrolls, not the box
  expect(await box.evaluate((n) => n.scrollHeight <= n.clientHeight + 2)).toBe(true);
});

test('save: inserts with base_modified, banner, new text in view, search and card preview; Undo restores', async ({
  page,
}) => {
  const mock = await mockSupabase(page);
  await login(page);
  await openEdit(page, '#/p/a1');
  const typed =
    'Placeholder edited line one\nPlaceholder edited line two\n\nSecond stanza, zanzibar';
  await page.locator('#edit-text').fill(typed);
  await page.getByRole('button', { name: 'Save' }).click();

  expect(mock.requests).toHaveLength(1);
  expect(mock.requests[0]).toMatchObject({
    drive_id: 'a1',
    action: 'edit',
    value: typed, // exactly what was typed, line breaks and all
    base_modified: '2023-05-02T10:00:00Z', // that piece's drive_modified
    done_at: null,
  });
  await expect(page.locator('#edit-text')).toHaveCount(0);
  await expect(page.locator('.banner')).toContainText('Your edit goes into Drive tonight');
  await expect(page.locator('.piece .body')).toHaveText(typed);

  // everywhere else too: search, card preview, first lines
  await page.getByRole('link', { name: /Home/ }).click();
  await page.locator('#search').fill('zanzibar');
  await expect(page.locator('#search-results .count')).toHaveText('1 found');
  await expect(page.locator('#search-results .card-preview')).toHaveText(
    'Placeholder edited line one\nPlaceholder edited line two',
  );
  await page.locator('#search').fill('');
  await page.getByRole('link', { name: /First lines/ }).click();
  await expect(page.locator('.line-row', { hasText: 'Placeholder edited line one' })).toHaveCount(
    1,
  );
  await expect(
    page.locator('.line-row', { hasText: 'Placeholder poem one, line one' }),
  ).toHaveCount(0);

  // Undo from the piece view: the original is back and the row is gone
  await goto(page, '#/p/a1');
  await page.locator('.banner').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.banner')).toHaveCount(0);
  expect(mock.requests).toHaveLength(0);
  await expect(page.locator('.piece .body')).toContainText('Placeholder stanza two, lantern');
  await page.getByRole('link', { name: /Home/ }).click();
  await page.locator('#search').fill('zanzibar');
  await expect(page.locator('#search-results .count')).toHaveText('0 found');
});

test('editing again while pending: the newest edit wins and the box starts from it', async ({
  page,
}) => {
  const mock = await mockSupabase(page, undefined, {
    requests: [edit(1, 'e1', 'First pending edit')],
  });
  await login(page);
  await openEdit(page, '#/p/e1');
  await expect(page.locator('#edit-text')).toHaveValue('First pending edit');
  await page.locator('#edit-text').fill('Second pending edit');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.piece .body')).toHaveText('Second pending edit');
  expect(mock.requests).toHaveLength(2);
  expect(mock.requests[1]).toMatchObject({ value: 'Second pending edit', action: 'edit' });

  // Undo clears ALL pending edits for the piece
  await page.locator('.banner').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.piece .body')).toHaveText('Zebra musing placeholder, line one');
  expect(mock.requests).toHaveLength(0);
});

test('saving without a change just closes the box', async ({ page }) => {
  const mock = await mockSupabase(page);
  await login(page);
  await openEdit(page, '#/p/e1');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#edit-text')).toHaveCount(0);
  expect(mock.requests).toHaveLength(0);
  await expect(page.locator('.banner')).toHaveCount(0);
});

test('Cancel discards the draft', async ({ page }) => {
  const mock = await mockSupabase(page);
  await login(page);
  await openEdit(page, '#/p/e1');
  await page.locator('#edit-text').fill('never mind');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('#edit-text')).toHaveCount(0);
  await expect(page.locator('.piece .body')).toHaveText('Zebra musing placeholder, line one');
  expect(mock.requests).toHaveLength(0);
});

test('a failed save keeps the box open with her text, and shows the error line', async ({
  page,
}) => {
  const mock = await mockSupabase(page, undefined, { failPost: true });
  await login(page);
  await openEdit(page, '#/p/e1');
  await page.locator('#edit-text').fill('Text I must not lose\nsecond line');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#save-error')).toHaveText("Couldn't save that. Try again.");
  await expect(page.locator('#edit-text')).toHaveValue('Text I must not lose\nsecond line');
  await expect(page.locator('.banner')).toHaveCount(0);
  expect(mock.requests).toHaveLength(0);
});

test('Hebrew text and a leading blank line round-trip exactly', async ({ page }) => {
  const mock = await mockSupabase(page);
  await login(page);
  await openEdit(page, '#/p/c1');
  const typed = '\nשורה חדשה לדוגמה\n\n  שורה עם רווחים\nשורה אחרונה';
  await page.locator('#edit-text').fill(typed);
  await page.getByRole('button', { name: 'Save' }).click();
  expect(mock.requests[0].value).toBe(typed);
  await expect(page.locator('.piece .body')).toHaveAttribute('dir', 'auto');
  // reopening shows the very same text, leading blank line included
  await page.getByRole('button', { name: '✏️ Edit' }).click();
  await expect(page.locator('#edit-text')).toHaveValue(typed);
});

test('a done edit that was not written shows a quiet line with "show my edit"', async ({
  page,
}) => {
  await mockSupabase(page, undefined, {
    requests: [
      edit(1, 'e1', 'My edit that did not land\nsecond line', {
        done_at: '2026-10-20T00:00:00Z',
        result: 'not written: the Drive doc changed after you started editing',
      }),
    ],
  });
  await login(page);
  await goto(page, '#/p/e1');
  const line = page.locator('.edit-failed');
  await expect(line).toContainText(
    "Your edit wasn't written: not written: the Drive doc changed after you started editing",
  );
  await expect(line.locator('details .body')).toBeHidden();
  await line.locator('summary', { hasText: 'show my edit' }).click();
  await expect(line.locator('details .body')).toHaveText('My edit that did not land\nsecond line');
  // the body itself is untouched
  await expect(page.locator('.piece > .body')).toHaveText('Zebra musing placeholder, line one');
  // and she can dismiss it
  await line.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.locator('.edit-failed')).toHaveCount(0);
});

test('a done edit that was written shows nothing', async ({ page }) => {
  await mockSupabase(page, undefined, {
    requests: [
      edit(1, 'e1', 'written text', { done_at: '2026-10-20T00:00:00Z', result: 'written' }),
    ],
  });
  await login(page);
  await goto(page, '#/p/e1');
  await expect(page.locator('.edit-failed')).toHaveCount(0);
  await expect(page.locator('.banner')).toHaveCount(0);
});

test('edits never change kind, top or trash state', async ({ page }) => {
  await mockSupabase(page, undefined, { requests: [edit(1, 'a1', 'Edited alpha text')] });
  await login(page);
  await expect(page.locator('.counts')).toHaveText('9 pieces · 4 poems · 2 with versions');
  await expect(page.locator('#trash-slot')).toBeEmpty();
  await goto(page, '#/p/a1');
  await expect(page.locator('.pill', { hasText: 'on top' })).toContainText(
    'Placeholder Poem Alpha',
  );
  await expect(page.locator('.piece .card-meta')).toContainText('Poem');
  await expect(page.locator('.audit .tiny')).toHaveCount(0);
  await goto(page, '#/browse');
  await expect(page.locator('.cards .card')).toHaveCount(6);
});

test('an edited poem can come up in the dice with its new text', async ({ page }) => {
  await mockSupabase(page, undefined, { requests: [edit(1, 'a1', 'Dice edited poem text')] });
  await login(page);
  const bodies = new Set<string>();
  for (let i = 0; i < 4; i++) {
    await page.locator('#roll').click();
    await expect(page.locator('#roll .die')).not.toHaveClass(/rolling/);
    bodies.add(await page.locator('#today-slot .body').innerText());
  }
  expect(bodies.has('Dice edited poem text')).toBe(true);
});

test('no sideways scroll at 320 px while editing', async ({ page }) => {
  await mockSupabase(page);
  await page.setViewportSize({ width: 320, height: 892 });
  await login(page);
  await openEdit(page, '#/p/a1');
  await page.locator('#edit-text').fill('A very long placeholder line without breaks '.repeat(20));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
