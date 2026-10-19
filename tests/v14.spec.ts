import { expect, test, type Page } from '@playwright/test';
import { login, mockSupabase, row, type ReqRow } from './helpers';

// v1.4: private notes to herself, dice Back/Next, no doubled first line on untitled pieces.

function mine(id: number, drive_id: string, value: string): ReqRow {
  return {
    id,
    drive_id,
    action: 'mine',
    value,
    created_at: `2026-10-19T1${id}:00:00Z`,
    done_at: null,
    result: null,
  };
}

async function goto(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
}

async function rollOnce(page: Page): Promise<string> {
  await page.locator('#roll').click();
  await expect(page.locator('#today-slot .label')).toHaveText('🎲 Rolled poem');
  await expect(page.locator('#roll .die')).not.toHaveClass(/rolling/);
  return page.locator('#today-slot .body').innerText();
}

test('My note: save, shows in the thread (no Claude waiting state), Delete removes it', async ({
  page,
}) => {
  const mock = await mockSupabase(page);
  await login(page);
  await goto(page, '#/p/b1'); // not editable: My note is there for every piece
  await page.getByRole('button', { name: '📝 My note' }).click();
  const box = page.locator('#note-text');
  await expect(box).toBeFocused();
  await expect(box).toHaveAttribute('placeholder', 'A note just for you');
  await box.fill('I read this one on the bus');
  await expect(page.getByRole('button', { name: 'Send' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save' }).click();

  expect(mock.requests).toHaveLength(1);
  expect(mock.requests[0]).toMatchObject({
    drive_id: 'b1',
    action: 'mine',
    value: 'I read this one on the bus',
    done_at: null,
  });
  const msg = page.locator('.thread .msg.mine');
  await expect(msg).toContainText('My note');
  await expect(msg).toContainText('I read this one on the bus');
  await expect(page.locator('.thread .msg.wait')).toHaveCount(0);
  await expect(page.locator('.thread')).not.toContainText('Waiting for Claude');
  await expect(page.locator('#note-text')).toHaveCount(0);

  await msg.getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.thread')).toHaveCount(0);
  expect(mock.requests).toHaveLength(0);
});

test('My note box and Claude note box are separate, with their own labels', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  await goto(page, '#/p/a1');
  await page.getByRole('button', { name: '💬 Note to Claude' }).click();
  await expect(page.getByRole('button', { name: 'Send' })).toBeVisible();
  await page.getByRole('button', { name: '📝 My note' }).click();
  await expect(page.locator('#note-text')).toHaveAttribute('placeholder', 'A note just for you');
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  await expect(page.locator('#note-text')).toHaveCount(1);
});

test('a failed My note save shows the error line and keeps her text', async ({ page }) => {
  const mock = await mockSupabase(page, undefined, { failPost: true });
  await login(page);
  await goto(page, '#/p/a1');
  await page.getByRole('button', { name: '📝 My note' }).click();
  await page.locator('#note-text').fill('keep this');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#save-error')).toHaveText("Couldn't save that. Try again.");
  await expect(page.locator('#note-text')).toHaveValue('keep this');
  expect(mock.requests).toHaveLength(0);
});

test('Home My notes card: newest first, tappable, general composer; separate from Claude notes', async ({
  page,
}) => {
  await mockSupabase(page, undefined, {
    requests: [
      mine(1, 'a1', 'Older private thought'),
      mine(2, 'general', 'Newest private thought'),
    ],
  });
  await login(page);
  // nothing here belongs to the Claude notes card, its count, or its dot
  await expect(page.locator('#notes-slot .notes-card')).toHaveCount(0);
  await expect(page.locator('.dot')).toHaveCount(0);

  const card = page.locator('#mine-slot .notes-card');
  await expect(card.locator('.trash-head')).toContainText('My notes');
  await expect(card.locator('.notes-count')).toHaveText('2 notes');
  await card.locator('.trash-head').click();
  const rows = card.locator('.note-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Newest private thought');
  await expect(rows.nth(0)).toContainText('General');
  await expect(rows.nth(1)).toContainText('Placeholder Poem Alpha');

  // the general composer inside the card
  await card.getByRole('button', { name: 'Write a note for yourself' }).click();
  await expect(page.locator('#note-text')).toHaveAttribute('placeholder', 'A note just for you');
  await page.locator('#note-text').fill('Third private thought');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(card.locator('.notes-count')).toHaveText('3 notes');
  await expect(card.locator('.note-row').first()).toContainText('Third private thought');

  await card.locator('.note-row', { hasText: 'Older private thought' }).click();
  await expect(page).toHaveURL(/#\/p\/a1$/);
  await expect(page.locator('.thread .msg.mine')).toContainText('Older private thought');
});

test('with no private notes: no card, a quiet way to write the first one', async ({ page }) => {
  const mock = await mockSupabase(page);
  await login(page);
  await expect(page.locator('#mine-slot .notes-card')).toHaveCount(0);
  await page.getByRole('button', { name: '📝 Write a note for yourself' }).click();
  await page.locator('#note-text').fill('First private thought');
  await page.getByRole('button', { name: 'Save' }).click();
  expect(mock.requests[0]).toMatchObject({ drive_id: 'general', action: 'mine' });
  await expect(page.locator('#mine-slot .notes-count')).toHaveText('1 note');
});

test('a private note never changes kind, top, trash, edit, or the Claude notes card', async ({
  page,
}) => {
  await mockSupabase(page, undefined, {
    requests: [mine(1, 'a2', 'private'), mine(2, 'e1', 'private')],
  });
  await login(page);
  await expect(page.locator('.counts')).toHaveText('9 pieces · 4 poems · 2 with versions');
  await expect(page.locator('#trash-slot')).toBeEmpty();
  await expect(page.locator('#notes-slot')).not.toContainText('Notes to Claude');
  await goto(page, '#/p/a2');
  await expect(page.locator('.pill', { hasText: 'on top' })).toContainText(
    'Placeholder Poem Alpha',
  );
  await expect(page.locator('.banner')).toHaveCount(0);
  await goto(page, '#/p/e1');
  await expect(page.locator('.piece .card-meta')).toContainText('Musing');
  await expect(page.locator('.piece > .body')).toHaveText('Zebra musing placeholder, line one');
});

test('dice Back / Next walk this session’s history, and Roll adds to the end', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  const body1 = await rollOnce(page);
  await expect(page.getByRole('button', { name: '‹ Back' })).toBeDisabled(); // first roll
  await expect(page.getByRole('button', { name: 'Next ›' })).toHaveCount(0);
  const body2 = await rollOnce(page);
  const body3 = await rollOnce(page);
  expect(new Set([body1, body2, body3]).size).toBe(3);

  const body = page.locator('#today-slot .body');
  await page.getByRole('button', { name: '‹ Back' }).click();
  await expect(body).toHaveText(body2);
  await expect(page.getByRole('button', { name: 'Next ›' })).toBeVisible();
  await page.getByRole('button', { name: '‹ Back' }).click();
  await expect(body).toHaveText(body1);
  await expect(page.getByRole('button', { name: '‹ Back' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next ›' }).click();
  await expect(body).toHaveText(body2);

  // Roll from the middle adds a NEW poem at the end; Next is gone there
  const body4 = await rollOnce(page);
  expect([body1, body2, body3]).not.toContain(body4);
  await expect(page.getByRole('button', { name: 'Next ›' })).toHaveCount(0);
  await page.getByRole('button', { name: '‹ Back' }).click();
  await expect(body).toHaveText(body3); // the end of the history, not body2
  await page.getByRole('button', { name: '‹ Back' }).click();
  await expect(body).toHaveText(body2);
});

test('dice Back / Next buttons are neutral, not the accent', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  await rollOnce(page);
  await rollOnce(page);
  const bg = await page
    .getByRole('button', { name: '‹ Back' })
    .evaluate((n) => getComputedStyle(n).backgroundColor);
  expect(bg).not.toBe('rgb(45, 106, 79)');
});

test('an untitled piece shows its first line once in the piece view, not as a heading too', async ({
  page,
}) => {
  await mockSupabase(page);
  await login(page);
  await goto(page, '#/p/d1');
  const first = 'Untitled placeholder opening line';
  await expect(page.locator('.piece-title')).toHaveCount(0);
  await expect(page.locator('.piece > .body')).toContainText(first);
  const text = await page.locator('article.piece').innerText();
  expect(text.split(first).length - 1).toBe(1); // exactly once
  await expect(page.locator('.piece .card-meta')).toContainText('Poem');
  // a titled piece keeps its heading
  await goto(page, '#/p/a1');
  await expect(page.locator('.piece-title')).toHaveText('Placeholder Poem Alpha');
});

test('an untitled poem on the dice card or Today’s poem has no doubled first line', async ({
  page,
}) => {
  await mockSupabase(page, [
    row({
      drive_id: 'u1',
      title: '',
      has_title: false,
      body: 'Only poem, untitled opening\nSecond line',
    }),
  ]);
  await login(page);
  const slot = page.locator('#today-slot');
  await expect(slot).toContainText('Only poem, untitled opening');
  expect((await slot.innerText()).split('Only poem, untitled opening').length - 1).toBe(1);
  await page.locator('#roll').click();
  await expect(page.locator('#today-slot .label')).toHaveText('🎲 Rolled poem');
  expect((await slot.innerText()).split('Only poem, untitled opening').length - 1).toBe(1);
});

test('lists and version pills still label an untitled piece by its first line', async ({
  page,
}) => {
  await mockSupabase(page);
  await login(page);
  await page.locator('#search').fill('untitled placeholder');
  await expect(page.locator('#search-results .card-title')).toHaveText(
    'Untitled placeholder opening line',
  );
  await page.getByRole('link', { name: /First lines/ }).click();
  await expect(
    page.locator('.line-row', { hasText: 'Untitled placeholder opening line' }),
  ).toHaveCount(1);
});

test('no sideways scroll at 320 px with a private note thread and the dice nav', async ({
  page,
}) => {
  await mockSupabase(page, undefined, {
    requests: [mine(1, 'a1', 'A long private placeholder thought '.repeat(15))],
  });
  await page.setViewportSize({ width: 320, height: 892 });
  await login(page);
  await page.locator('#roll').click();
  await expect(page.locator('#today-slot .label')).toHaveText('🎲 Rolled poem');
  await page.locator('#mine-slot .trash-head').click();
  const ok = (): Promise<boolean> =>
    page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
  expect(await ok()).toBe(true);
  await goto(page, '#/p/a1');
  await page.getByRole('button', { name: '📝 My note' }).click();
  expect(await ok()).toBe(true);
});
