import { expect, test, type Page } from '@playwright/test';
import { login, mockSupabase, type ReqRow } from './helpers';

// v1.2: notes to Claude (per piece, general, replies, unsend, refresh). All mocked.

function note(
  id: number,
  drive_id: string,
  value: string,
  reply?: { result: string; done_at?: string },
): ReqRow {
  return {
    id,
    drive_id,
    action: 'note',
    value,
    created_at: `2026-10-19T1${id}:00:00Z`,
    done_at: reply ? (reply.done_at ?? new Date().toISOString()) : null,
    result: reply ? reply.result : null,
  };
}

async function goto(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
}

test('a sent note shows as a thread with "Waiting for Claude", and Unsend removes it', async ({
  page,
}) => {
  const mock = await mockSupabase(page);
  await login(page);
  await goto(page, '#/p/a1');
  await page.getByRole('button', { name: '💬 Note to Claude' }).click();
  const box = page.locator('#note-text');
  await expect(box).toBeFocused();
  await expect(box).toHaveAttribute('placeholder', 'Tell Claude anything about this piece');
  await expect(box).toHaveAttribute('dir', 'auto');
  await expect(box).toHaveAttribute('rows', '4');

  await box.fill('Please check the second line');
  await page.getByRole('button', { name: 'Send' }).click();

  expect(mock.requests).toHaveLength(1);
  expect(mock.requests[0]).toMatchObject({
    drive_id: 'a1',
    action: 'note',
    value: 'Please check the second line',
    done_at: null,
  });
  await expect(page.locator('#note-text')).toHaveCount(0);
  const thread = page.locator('.thread');
  await expect(thread).toContainText('You');
  await expect(thread).toContainText('Please check the second line');
  await expect(thread.locator('.msg.wait')).toContainText('Waiting for Claude');

  await thread.getByRole('button', { name: 'Unsend' }).click();
  await expect(page.locator('.thread')).toHaveCount(0);
  expect(mock.requests).toHaveLength(0);
});

test('Cancel closes the note box without sending', async ({ page }) => {
  const mock = await mockSupabase(page);
  await login(page);
  await goto(page, '#/p/a1');
  await page.getByRole('button', { name: '💬 Note to Claude' }).click();
  await page.locator('#note-text').fill('never mind');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('#note-text')).toHaveCount(0);
  expect(mock.requests).toHaveLength(0);
});

test("Claude's reply shows under the note, and a replied note cannot be unsent", async ({
  page,
}) => {
  await mockSupabase(page, undefined, {
    requests: [note(1, 'a1', 'Is this a draft?', { result: 'Placeholder reply: it is a poem.' })],
  });
  await login(page);
  await goto(page, '#/p/a1');
  const thread = page.locator('.thread');
  await expect(thread.locator('.msg').first()).toContainText('Is this a draft?');
  await expect(thread.locator('.msg.claude')).toContainText('Claude');
  await expect(thread.locator('.msg.claude')).toContainText('Placeholder reply: it is a poem.');
  await expect(thread.getByRole('button', { name: 'Unsend' })).toHaveCount(0);
  await expect(thread.locator('.msg.wait')).toHaveCount(0);
});

test('notes stay on the version they were written on', async ({ page }) => {
  await mockSupabase(page, undefined, { requests: [note(1, 'a1', 'About the top one')] });
  await login(page);
  await goto(page, '#/p/a1');
  await expect(page.locator('.thread')).toContainText('About the top one');
  await goto(page, '#/p/a2');
  await expect(page.locator('.thread')).toHaveCount(0);
});

test('notes are oldest first', async ({ page }) => {
  await mockSupabase(page, undefined, {
    requests: [note(1, 'e1', 'First note'), note(2, 'e1', 'Second note')],
  });
  await login(page);
  await goto(page, '#/p/e1');
  await expect(page.locator('.thread .msg')).toHaveCount(4);
  const heads = await page
    .locator('.thread .msg:not(.wait):not(.claude) .msg-body')
    .allInnerTexts();
  expect(heads).toEqual(['First note', 'Second note']);
});

test('a note does not change kind, top or trash state', async ({ page }) => {
  await mockSupabase(page, undefined, {
    requests: [note(1, 'a2', 'note on a draft'), note(2, 'e1', 'note on a musing')],
  });
  await login(page);
  await expect(page.locator('.counts')).toHaveText('9 pieces · 4 poems · 2 with versions');
  await expect(page.locator('#trash-slot')).toBeEmpty();
  await goto(page, '#/p/a2');
  await expect(page.locator('.pill', { hasText: 'on top' })).toContainText(
    'Placeholder Poem Alpha',
  );
  await expect(page.getByRole('button', { name: 'Put on top' })).toBeVisible();
  await expect(page.locator('.banner')).toHaveCount(0);
  await goto(page, '#/p/e1');
  await expect(page.locator('.piece .card-meta')).toContainText('Musing');
  await expect(page.locator('.audit .tiny')).toHaveCount(0);
  await goto(page, '#/browse');
  await expect(page.locator('.cards .card')).toHaveCount(6);
});

test('Home notes card: counts, waiting first, answered from the last 14 days, tap goes to piece', async ({
  page,
}) => {
  const old = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  await mockSupabase(page, undefined, {
    requests: [
      note(1, 'a1', 'Waiting on alpha'),
      note(2, 'e1', 'Answered on musing', { result: 'Placeholder reply two' }),
      note(3, 'general', 'A general thought'),
      note(4, 'f1', 'Old answered note', { result: 'old reply', done_at: old }),
    ],
  });
  await login(page);
  const card = page.locator('.notes-card');
  await expect(card.locator('.trash-head')).toContainText('Notes to Claude');
  await expect(card.locator('.notes-count')).toHaveText('2 waiting · 1 answered');
  await expect(card.locator('.note-row')).toHaveCount(0); // collapsed until tapped

  await card.locator('.trash-head').click();
  const rows = card.locator('.note-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('General'); // newest waiting first
  await expect(rows.nth(1)).toContainText('Placeholder Poem Alpha');
  await expect(rows.nth(1)).toContainText('Waiting on alpha');
  await expect(rows.nth(2)).toContainText('Placeholder reply two');
  await expect(card).not.toContainText('Old answered note');

  // the notes card sits between the counts line and "To trash"
  const order = await page
    .locator('#view > *')
    .evaluateAll((els) => els.map((e) => e.id || e.className));
  expect(order.indexOf('notes-slot')).toBeGreaterThan(order.indexOf('today-slot'));

  await rows.nth(1).click();
  await expect(page).toHaveURL(/#\/p\/a1$/);
});

test('no notes: no card, but a quiet way to write a general note', async ({ page }) => {
  const mock = await mockSupabase(page);
  await login(page);
  await expect(page.locator('.notes-card')).toHaveCount(0);
  await page.getByRole('button', { name: '💬 Write a note to Claude' }).click();
  await expect(page.locator('#note-text')).toBeFocused();
  await expect(page.locator('#note-text')).toHaveAttribute('placeholder', 'Tell Claude anything');
  await page.locator('#note-text').fill('A thought about everything');
  await page.getByRole('button', { name: 'Send' }).click();

  expect(mock.requests[0]).toMatchObject({ drive_id: 'general', action: 'note' });
  const card = page.locator('.notes-card');
  await expect(card.locator('.notes-count')).toHaveText('1 waiting · 0 answered');
  await card.locator('.trash-head').click();
  await expect(card.locator('.note-row')).toContainText('General');
  await expect(card.locator('.note-row')).toContainText('A thought about everything');

  // a second one from inside the card
  await card.getByRole('button', { name: 'Write a general note' }).click();
  await page.locator('#note-text').fill('Another thought');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(card.locator('.notes-count')).toHaveText('2 waiting · 0 answered');
  expect(mock.requests).toHaveLength(2);
});

test('a failed note save shows the plain error line, keeps her text, and adds no note', async ({
  page,
}) => {
  const mock = await mockSupabase(page, undefined, { failPost: true });
  await login(page);
  await goto(page, '#/p/a1');
  await page.getByRole('button', { name: '💬 Note to Claude' }).click();
  await page.locator('#note-text').fill('this should not vanish');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.locator('#save-error')).toHaveText("Couldn't save that. Try again.");
  await expect(page.locator('.thread')).toHaveCount(0);
  await expect(page.locator('#note-text')).toHaveValue('this should not vanish');
  expect(mock.requests).toHaveLength(0);
});

test('a waiting reply is picked up when the app comes back to the foreground', async ({ page }) => {
  const mock = await mockSupabase(page, undefined, {
    requests: [note(1, 'a1', 'Waiting on alpha')],
  });
  await login(page);
  const card = page.locator('.notes-card');
  await expect(card.locator('.notes-count')).toHaveText('1 waiting · 0 answered');
  await expect(card.locator('.dot')).toHaveCount(0);

  // Claude answers while the app is in the background
  mock.requests[0].done_at = new Date().toISOString();
  mock.requests[0].result = 'Placeholder reply from Claude';
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

  await expect(card.locator('.notes-count')).toHaveText('0 waiting · 1 answered');
  await expect(card.locator('.dot')).toBeVisible();
  // opening the card means she has seen it: the dot goes quiet again
  await card.locator('.trash-head').click();
  await expect(card.locator('.note-row')).toContainText('Placeholder reply from Claude');
  await expect(card.locator('.dot')).toHaveCount(0);
});

test('opening the Home tab reloads the replies too', async ({ page }) => {
  const mock = await mockSupabase(page, undefined, {
    requests: [note(1, 'a1', 'Waiting on alpha')],
  });
  await login(page);
  await page.getByRole('link', { name: /Browse/ }).click();
  mock.requests[0].done_at = new Date().toISOString();
  mock.requests[0].result = 'A fresh reply';
  await page.getByRole('link', { name: /Home/ }).click();
  await expect(page.locator('.notes-card .dot')).toBeVisible();
  await expect(page.locator('.notes-card .notes-count')).toHaveText('0 waiting · 1 answered');
});

test('a piece waiting for the trash still shows its notes, read-only', async ({ page }) => {
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
      note(2, 'a1', 'A note before the trash'),
    ],
  });
  await login(page);
  await goto(page, '#/p/a1');
  await expect(page.locator('.banner')).toBeVisible();
  await expect(page.locator('.thread')).toContainText('A note before the trash');
  await expect(page.locator('.thread').getByRole('button', { name: 'Unsend' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '💬 Note to Claude' })).toHaveCount(0);
});

test('Send is neutral dark, not the accent', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  await goto(page, '#/p/a1');
  await page.getByRole('button', { name: '💬 Note to Claude' }).click();
  const bg = await page
    .getByRole('button', { name: 'Send' })
    .evaluate((n) => getComputedStyle(n).backgroundColor);
  expect(bg).not.toBe('rgb(45, 106, 79)');
});

test('no sideways scroll at 320 px with a note box and a thread', async ({ page }) => {
  await mockSupabase(page, undefined, {
    requests: [
      note(1, 'a1', 'A fairly long placeholder note '.repeat(12), { result: 'Reply '.repeat(40) }),
    ],
  });
  await page.setViewportSize({ width: 320, height: 892 });
  await login(page);
  const ok = (): Promise<boolean> =>
    page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
  await page.locator('.notes-card .trash-head').click();
  expect(await ok()).toBe(true);
  await goto(page, '#/p/a1');
  await page.getByRole('button', { name: '💬 Note to Claude' }).click();
  expect(await ok()).toBe(true);
});
