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
