import { expect, test } from '@playwright/test';
import { login, mockSupabase, type ReqRow } from './helpers';

// v1.1: dice, audit requests (trash / kind / top), "To trash" card. All mocked.

function req(
  id: number,
  drive_id: string,
  action: string,
  value: string | null = null,
  done = false,
): ReqRow {
  return {
    id,
    drive_id,
    action,
    value,
    created_at: `2026-10-19T10:0${id}:00Z`,
    done_at: done ? '2026-10-20T00:00:00Z' : null,
    result: done ? 'done' : null,
  };
}

async function goto(page: import('@playwright/test').Page, hash: string): Promise<void> {
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
}

test('dice rolls a random poem, and a second roll gives a different one', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  const roll = page.locator('#roll');
  await expect(roll).toContainText('Roll');
  await roll.click();
  await expect(page.locator('#today-slot .label')).toHaveText('🎲 Rolled poem');
  const first = await page.locator('#today-slot .body').innerText();
  await expect(page.locator('#today-slot .card-meta')).toContainText('Poem');
  await expect(page.locator('#today-slot .body')).not.toBeEmpty();
  await expect(page.locator('a.today')).toHaveAttribute('href', new RegExp('#/p/'));

  await roll.click();
  await expect(page.locator('#today-slot .body')).not.toHaveText(first);

  // the quiet way back to today's poem
  await page.getByRole('button', { name: "Today's poem" }).click();
  await expect(page.locator('#today-slot .label')).toHaveText("Today's poem");
});

test('dice does not repeat within the recent rolls', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  const seen: string[] = [];
  for (let i = 0; i < 4; i++) {
    await page.locator('#roll').click();
    await expect(page.locator('#today-slot .label')).toHaveText('🎲 Rolled poem');
    await expect(page.locator('#roll .die')).not.toHaveClass(/rolling/);
    seen.push(await page.locator('#today-slot .body').innerText());
  }
  expect(new Set(seen).size).toBe(4); // the fixture has exactly 4 poems
});

test('the dice spins, and a reduced-motion setting skips the animation', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  await page.locator('#roll').click();
  await expect(page.locator('#roll .die')).toHaveClass(/rolling/);
  expect(await page.locator('#roll .die').evaluate((n) => getComputedStyle(n).animationName)).toBe(
    'dice-roll',
  );
  await expect(page.locator('#today-slot .label')).toHaveText('🎲 Rolled poem');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await page.locator('#search').waitFor();
  await page.locator('#roll').click();
  // no waiting for a spin: the poem is there at once and the die never got the class
  await expect(page.locator('#today-slot .label')).toHaveText('🎲 Rolled poem', { timeout: 300 });
  await expect(page.locator('#roll .die')).not.toHaveClass(/rolling/);
});

test('the dice button uses a neutral fill, not the accent', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  const bg = await page.locator('#roll').evaluate((n) => getComputedStyle(n).backgroundColor);
  expect(bg).not.toBe('rgb(45, 106, 79)');
});

test('trash: banner, hidden from lists/search, in To trash, Undo restores', async ({ page }) => {
  const mock = await mockSupabase(page);
  await login(page);
  await expect(page.locator('.trash-card')).toHaveCount(0); // nothing pending, nothing shown

  await page.locator('#search').fill('beta');
  await page.locator('#search-results .card').first().click();
  await expect(page).toHaveURL(/#\/p\/b1$/);
  await page.getByRole('button', { name: '🗑 Trash' }).click();

  await expect(page.locator('.banner')).toContainText('Going to Drive Trash tonight');
  expect(mock.requests).toHaveLength(1);
  expect(mock.requests[0]).toMatchObject({ drive_id: 'b1', action: 'trash', done_at: null });
  // still readable in the piece view, and its pill says so
  await expect(page.locator('.piece .body')).toContainText('Quoted opening for beta');
  await expect(page.locator('.pill', { hasText: 'to trash' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: '🗑 Trash' })).toHaveCount(0);

  // Home: the To trash card; hidden from search; the work falls back to its next version
  await page.getByRole('link', { name: /Home/ }).click();
  await expect(page.locator('.trash-head')).toContainText('To trash · 1');
  await expect(page.locator('.counts')).toHaveText('8 pieces · 4 poems · 1 with versions');
  await expect(page.locator('.caption')).toContainText('Drive Trash tonight');
  await page.locator('.trash-head').click();
  await expect(page.locator('.trash-row')).toHaveCount(1);
  await expect(page.locator('.trash-row')).toContainText('Placeholder Poem Beta');
  await page.locator('#search').fill('quoted opening');
  await expect(page.locator('#search-results .count')).toHaveText('0 found');
  await page.locator('#search').fill('older beta');
  await expect(page.locator('#search-results .card-title')).toHaveText(
    'Placeholder Poem Beta (older)',
  );
  await page.locator('#search').fill('');

  // First lines: the trashed top is gone, the work shows its older version
  await page.getByRole('link', { name: /First lines/ }).click();
  await expect(page.locator('.line-row', { hasText: 'Quoted opening' })).toHaveCount(0);
  await expect(page.locator('.line-row', { hasText: 'Older beta' })).toHaveCount(1);

  // Undo from the Home card restores it
  await page.getByRole('link', { name: /Home/ }).click();
  // the card stays open from before
  await expect(page.locator('.trash-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.trash-card')).toHaveCount(0);
  expect(mock.requests).toHaveLength(0);
  await expect(page.locator('.counts')).toHaveText('9 pieces · 4 poems · 2 with versions');
  await page.getByRole('link', { name: /First lines/ }).click();
  await expect(page.locator('.line-row', { hasText: 'Quoted opening' })).toHaveCount(1);
});

test('a trashed piece is hidden from Browse', async ({ page }) => {
  await mockSupabase(page, undefined, { requests: [req(1, 'e1', 'trash')] });
  await login(page);
  await page.getByRole('link', { name: /Browse/ }).click();
  await expect(page.locator('.cards .card')).toHaveCount(5);
  await expect(page.locator('.card-title', { hasText: 'Placeholder Musing' })).toHaveCount(0);
});

test('Undo from the piece-view banner', async ({ page }) => {
  const mock = await mockSupabase(page);
  await login(page);
  await goto(page, '#/p/e1');
  await page.getByRole('button', { name: '🗑 Trash' }).click();
  await expect(page.locator('.banner')).toBeVisible();
  await page.locator('.banner').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.banner')).toHaveCount(0);
  expect(mock.requests).toHaveLength(0);
  await expect(page.getByRole('button', { name: '🗑 Trash' })).toBeVisible();
});

test('a pending-trash poem never turns up in the dice', async ({ page }) => {
  await mockSupabase(page, undefined, {
    requests: [req(1, 'a1', 'trash'), req(2, 'c1', 'trash')],
  });
  await login(page);
  await expect(page.locator('.trash-head')).toContainText('To trash · 2');
  const seen = new Set<string>();
  for (let i = 0; i < 6; i++) {
    await page.locator('#roll').click();
    await expect(page.locator('#roll .die')).not.toHaveClass(/rolling/);
    seen.add(await page.locator('#today-slot .body').innerText());
  }
  expect([...seen].some((b) => b.includes('שורה ראשונה'))).toBe(false);
  expect([...seen].some((b) => b.includes('Placeholder poem one'))).toBe(false);
});

test('done requests do not show in To trash', async ({ page }) => {
  await mockSupabase(page, undefined, { requests: [req(1, 'a1', 'trash', null, true)] });
  await login(page);
  await expect(page.locator('.trash-card')).toHaveCount(0);
});

test('kind change: meta line, "your pick", and Browse kind counts', async ({ page }) => {
  const mock = await mockSupabase(page);
  await login(page);
  await goto(page, '#/p/c1');
  await expect(page.locator('.piece .card-meta')).toContainText('Poem');
  await page.getByRole('button', { name: /Kind: Poem/ }).click();
  await expect(page.locator('.picker .chip')).toHaveCount(11);
  await page.locator('.picker .chip', { hasText: 'Song' }).click();

  expect(mock.requests[0]).toMatchObject({ drive_id: 'c1', action: 'kind', value: 'song' });
  await expect(page.locator('.piece .card-meta')).toHaveText('2020 · Song · Placeholder folder');
  await expect(page.getByRole('button', { name: /Kind: Song/ })).toBeVisible();
  await expect(page.locator('.audit .tiny')).toHaveText('your pick');
  await expect(page.locator('.picker')).toHaveCount(0);

  await page.getByRole('link', { name: /Browse/ }).click();
  await expect(page.locator('.chip', { hasText: /^Song/ })).toContainText('1');
  await expect(page.locator('.chip', { hasText: /^Poem/ })).toContainText('3');
  await page.getByRole('link', { name: /Home/ }).click();
  await expect(page.locator('.counts')).toContainText('3 poems');
});

test('the latest kind request wins', async ({ page }) => {
  await mockSupabase(page, undefined, {
    requests: [req(1, 'e1', 'kind', 'diary'), req(2, 'e1', 'kind', 'torah')],
  });
  await login(page);
  await goto(page, '#/p/e1');
  await expect(page.locator('.piece .card-meta')).toContainText('Torah');
  await expect(page.locator('.audit .tiny')).toHaveText('your pick');
});

test('put on top: moves "on top", and lists use the new top', async ({ page }) => {
  const mock = await mockSupabase(page);
  await login(page);
  await goto(page, '#/p/a1');
  await expect(page.getByRole('button', { name: 'Put on top' })).toHaveCount(0); // already on top
  await page.locator('.pill', { hasText: '(draft)' }).click();
  await page.getByRole('button', { name: 'Put on top' }).click();

  expect(mock.requests[0]).toMatchObject({ drive_id: 'a2', action: 'top', value: 'a2' });
  await expect(page.locator('.pill', { hasText: 'on top' })).toHaveCount(1);
  await expect(page.locator('.pill', { hasText: 'on top' })).toContainText('(draft)');
  await expect(page.getByRole('button', { name: 'Put on top' })).toHaveCount(0);

  await page.getByRole('link', { name: /Browse/ }).click();
  await expect(
    page.locator('.card-title', { hasText: 'Placeholder Poem Alpha (draft)' }),
  ).toHaveCount(1);
  await expect(page.locator('.card-title', { hasText: /^Placeholder Poem Alpha$/ })).toHaveCount(0);
});

test('a failed save shows one plain line and changes nothing', async ({ page }) => {
  const mock = await mockSupabase(page, undefined, { failPost: true });
  await login(page);
  await goto(page, '#/p/e1');
  await page.getByRole('button', { name: '🗑 Trash' }).click();
  await expect(page.locator('#save-error')).toHaveText("Couldn't save that. Try again.");
  await expect(page.locator('.banner')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '🗑 Trash' })).toBeVisible();
  expect(mock.requests).toHaveLength(0);

  await page.getByRole('button', { name: /Kind: Musing/ }).click();
  await page.locator('.picker .chip', { hasText: 'Diary' }).click();
  await expect(page.locator('#save-error')).toBeVisible();
  await expect(page.locator('.piece .card-meta')).toContainText('Musing');
});

test('requests are loaded in pages too', async ({ page }) => {
  await mockSupabase(page);
  const seen: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('writing_requests') && r.method() === 'GET') seen.push(r.url());
  });
  await login(page);
  expect(seen.length).toBeGreaterThanOrEqual(1);
  expect(seen[0]).toMatch(/offset=0|limit=1000/);
});

test('no sideways scroll at 320 px with the new controls open', async ({ page }) => {
  await mockSupabase(page, undefined, { requests: [req(1, 'b1', 'trash')] });
  await page.setViewportSize({ width: 320, height: 892 });
  await login(page);
  await page.locator('.trash-head').click();
  const ok = (): Promise<boolean> =>
    page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
  expect(await ok()).toBe(true);
  await goto(page, '#/p/a2');
  await page.getByRole('button', { name: /Kind:/ }).click();
  expect(await ok()).toBe(true);
});
