// Takes the 412x892 screenshots (placeholder data only). Saved under test-results/screens/.
import { test } from '@playwright/test';
import path from 'node:path';
import { login, mockSupabase } from './helpers';

const OUT = path.join(__dirname, '..', 'test-results', 'screens');

test('v1.0 screenshots at 412x892', async ({ page }) => {
  await mockSupabase(page);
  await page.setViewportSize({ width: 412, height: 892 });
  await page.goto('/');
  await page.screenshot({ path: path.join(OUT, '0-login.png') });
  await login(page);
  await page.locator('#search').fill('placeholder');
  await page.locator('#search-results .card').first().waitFor();
  await page.screenshot({ path: path.join(OUT, '1-home-search.png') });
  await page.locator('#search').fill('');
  await page.screenshot({ path: path.join(OUT, '1-home.png') });

  const shots: [string, string][] = [
    ['#/shelves', '2-shelves.png'],
    ['#/browse?kind=poem', '3-browse.png'],
    ['#/first', '4-first-lines.png'],
    ['#/p/a1', '5-piece.png'],
  ];
  for (const [hash, file] of shots) {
    await page.evaluate((h) => {
      location.hash = h;
    }, hash);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, file) });
  }
});

test('v1.1 screenshots at 412x892', async ({ page }) => {
  await mockSupabase(page, undefined, {
    requests: [
      {
        id: 1,
        drive_id: 'b1',
        action: 'trash',
        value: null,
        created_at: '2026-10-19T10:00:00Z',
        done_at: null,
        result: null,
      },
      {
        id: 2,
        drive_id: 'f1',
        action: 'trash',
        value: null,
        created_at: '2026-10-19T10:05:00Z',
        done_at: null,
        result: null,
      },
    ],
  });
  await page.setViewportSize({ width: 412, height: 892 });
  await login(page);
  await page.locator('#roll').click();
  await page.locator('#today-slot .label', { hasText: 'Rolled' }).waitFor();
  await page.locator('.trash-head').click();
  await page.screenshot({ path: path.join(OUT, '6-home-dice-trash.png'), fullPage: true });

  const go = async (hash: string): Promise<void> => {
    await page.evaluate((h) => {
      location.hash = h;
    }, hash);
    await page.waitForTimeout(150);
  };
  await go('#/p/a2');
  await page.screenshot({ path: path.join(OUT, '7-piece-audit.png'), fullPage: true });
  await page.getByRole('button', { name: /Kind:/ }).click();
  await page.screenshot({ path: path.join(OUT, '8-kind-picker.png'), fullPage: true });
  await go('#/p/b1');
  await page.screenshot({ path: path.join(OUT, '9-pending-trash.png'), fullPage: true });
});

test('v1.2 screenshots at 412x892', async ({ page }) => {
  const now = new Date().toISOString();
  await mockSupabase(page, undefined, {
    requests: [
      {
        id: 1,
        drive_id: 'a1',
        action: 'note',
        value: 'Placeholder note: is the second line right?',
        created_at: '2026-10-19T11:05:00Z',
        done_at: null,
        result: null,
      },
      {
        id: 2,
        drive_id: 'e1',
        action: 'note',
        value: 'Placeholder note: should this be a musing?',
        created_at: '2026-10-19T11:10:00Z',
        done_at: now,
        result: 'Placeholder reply: yes, I moved it to Musing.',
      },
      {
        id: 3,
        drive_id: 'general',
        action: 'note',
        value: 'Placeholder general note about shelves',
        created_at: '2026-10-19T11:20:00Z',
        done_at: null,
        result: null,
      },
    ],
  });
  await page.setViewportSize({ width: 412, height: 892 });
  await login(page);
  await page.locator('.notes-card .trash-head').click();
  await page.screenshot({ path: path.join(OUT, '12-home-notes.png'), fullPage: true });

  const go = async (hash: string): Promise<void> => {
    await page.evaluate((h) => {
      location.hash = h;
    }, hash);
    await page.waitForTimeout(150);
  };
  await go('#/p/a1');
  await page.screenshot({ path: path.join(OUT, '11-piece-waiting-note.png'), fullPage: true });
  await page.getByRole('button', { name: '💬 Note to Claude' }).click();
  await page.locator('#note-text').fill('Placeholder: tell Claude something about this poem');
  await page.screenshot({ path: path.join(OUT, '10-piece-note-box.png'), fullPage: true });
  await go('#/p/e1');
  await page.screenshot({ path: path.join(OUT, '13-piece-claude-reply.png'), fullPage: true });
});

test('v1.3 screenshots at 412x892', async ({ page }) => {
  await mockSupabase(page, undefined, {
    requests: [
      {
        id: 1,
        drive_id: 'e1',
        action: 'edit',
        value: 'Placeholder edited musing, line one\nPlaceholder edited musing, line two',
        created_at: '2026-10-19T11:05:00Z',
        done_at: null,
        result: null,
        base_modified: '2022-03-01T10:00:00Z',
      },
    ],
  });
  await page.setViewportSize({ width: 412, height: 892 });
  await login(page);
  const go = async (hash: string): Promise<void> => {
    await page.evaluate((h) => {
      location.hash = h;
    }, hash);
    await page.waitForTimeout(150);
  };
  await go('#/p/e1');
  await page.screenshot({ path: path.join(OUT, '15-piece-pending-edit.png'), fullPage: true });
  await page.getByRole('button', { name: '✏️ Edit' }).click();
  await page.screenshot({ path: path.join(OUT, '14-edit-box.png'), fullPage: true });
  await go('#/p/b1');
  await page.screenshot({ path: path.join(OUT, '16-not-editable.png'), fullPage: true });
});

test('v1.4 screenshots at 412x892', async ({ page }) => {
  await mockSupabase(page, undefined, {
    requests: [
      {
        id: 1,
        drive_id: 'a1',
        action: 'mine',
        value: 'Placeholder private note: read this on the bus, come back to stanza two',
        created_at: '2026-10-19T11:05:00Z',
        done_at: null,
        result: null,
      },
      {
        id: 2,
        drive_id: 'general',
        action: 'mine',
        value: 'Placeholder general private note',
        created_at: '2026-10-19T11:10:00Z',
        done_at: null,
        result: null,
      },
    ],
  });
  await page.setViewportSize({ width: 412, height: 892 });
  await login(page);
  await page.locator('#roll').click();
  await page.locator('#today-slot .label', { hasText: 'Rolled' }).waitFor();
  await page.waitForTimeout(100);
  await page.locator('#roll').click();
  await page.locator('#roll .die:not(.rolling)').waitFor();
  await page.waitForTimeout(100);
  await page.getByRole('button', { name: '‹ Back' }).click();
  await page.locator('#mine-slot .trash-head').click();
  await page.screenshot({ path: path.join(OUT, '17-home-dice-back-mynotes.png'), fullPage: true });

  const go = async (hash: string): Promise<void> => {
    await page.evaluate((h) => {
      location.hash = h;
    }, hash);
    await page.waitForTimeout(150);
  };
  await go('#/p/a1');
  await page.screenshot({ path: path.join(OUT, '18-piece-my-note.png'), fullPage: true });
  await page.getByRole('button', { name: '📝 My note' }).click();
  await page.screenshot({ path: path.join(OUT, '19-my-note-box.png'), fullPage: true });
  await go('#/p/d1');
  await page.screenshot({ path: path.join(OUT, '20-untitled-no-double.png'), fullPage: true });
});
