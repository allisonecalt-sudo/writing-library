// Takes the 412x892 screenshots (placeholder data only). Saved under test-results/screens/.
import { test } from '@playwright/test';
import path from 'node:path';
import { login, mockSupabase } from './helpers';

const OUT = path.join(__dirname, '..', 'test-results', 'screens');

test('screenshots at 412x892', async ({ page }) => {
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
