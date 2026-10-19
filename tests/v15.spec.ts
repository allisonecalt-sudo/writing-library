import { expect, test, type Page } from '@playwright/test';
import { login, mockSupabase, row, type Row } from './helpers';

// v1.5: written dates on version pills, year from `written`, "Also in" / "Includes" links.

async function goto(page: Page, hash: string): Promise<void> {
  await page.evaluate((h) => {
    location.hash = h;
  }, hash);
}

function versions(): Row[] {
  const base = { work_id: 'w', folder: 'Placeholder folder' };
  return [
    row({
      ...base,
      drive_id: 'v-top',
      title: 'Top version',
      written: '2020-05-17',
      drive_modified: '2019-01-01T00:00:00Z',
    }),
    row({
      ...base,
      drive_id: 'v-month',
      is_top: false,
      title: 'Month version',
      written: '2023-03',
      drive_modified: '2018-01-01T00:00:00Z',
    }),
    row({
      ...base,
      drive_id: 'v-year',
      is_top: false,
      title: 'Year version',
      written: '2021',
      drive_modified: '2025-01-01T00:00:00Z',
    }),
    row({
      ...base,
      drive_id: 'v-day',
      is_top: false,
      title: 'Day version',
      written: '2023-11-02',
      drive_modified: '2017-01-01T00:00:00Z',
    }),
    row({
      ...base,
      drive_id: 'v-none',
      is_top: false,
      title: 'Unknown version',
      written: null,
      drive_modified: '2026-10-01T00:00:00Z',
    }),
  ];
}

test('version pills show the written date in all three formats, and no date when unknown', async ({
  page,
}) => {
  await mockSupabase(page, versions());
  await login(page);
  await goto(page, '#/p/v-top');
  const pill = (name: string) => page.locator('.pill', { hasText: name });
  await expect(pill('Top version').locator('.pill-sub')).toHaveText('17 May 2020 · on top');
  await expect(pill('Day version').locator('.pill-sub')).toHaveText('2 Nov 2023');
  await expect(pill('Month version').locator('.pill-sub')).toHaveText('Mar 2023');
  await expect(pill('Year version').locator('.pill-sub')).toHaveText('2021');
  // never the Drive date: unknown stays blank, even though drive_modified is set
  await expect(pill('Unknown version').locator('.pill-sub')).toHaveText('');
});

test('pills: top first, then newest written date, unknown last', async ({ page }) => {
  await mockSupabase(page, versions());
  await login(page);
  await goto(page, '#/p/v-top');
  await expect(page.locator('.pill')).toHaveCount(5);
  const titles = await page.locator('.pill .pill-title').allInnerTexts();
  expect(titles).toEqual([
    'Top version',
    'Day version', // 2 Nov 2023
    'Month version', // Mar 2023
    'Year version', // 2021
    'Unknown version',
  ]);
});

test('the fixture work still lists its versions by written date', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  await goto(page, '#/p/a1');
  await expect(page.locator('.pill')).toHaveCount(3);
  const subs = await page.locator('.pill .pill-sub').allInnerTexts();
  expect(subs).toEqual(['12 Jan 2026 · on top', 'Mar 2024', '2022']);
});

test('meta line uses the written year when year is null, and keeps year otherwise', async ({
  page,
}) => {
  await mockSupabase(page, [
    row({ drive_id: 'm1', title: 'Placeholder no year', year: null, written: '2019-05-02' }),
    row({ drive_id: 'm2', title: 'Placeholder both', year: 2015, written: '2019-05-02' }),
    row({ drive_id: 'm3', title: 'Placeholder neither', year: null, written: null }),
  ]);
  await login(page);
  await page.locator('#search').fill('placeholder no year');
  await expect(page.locator('#search-results .card-meta')).toHaveText('2019 · Poem');
  await page.locator('#search').fill('placeholder both');
  await expect(page.locator('#search-results .card-meta')).toHaveText('2015 · Poem');
  await page.locator('#search').fill('placeholder neither');
  await expect(page.locator('#search-results .card-meta')).toHaveText('Poem');
  await goto(page, '#/p/m1');
  await expect(page.locator('.piece .card-meta')).toHaveText('2019 · Poem · Placeholder folder');
});

test('"Also in" shows linked pieces with a kind label, links navigate, missing ids are skipped', async ({
  page,
}) => {
  await mockSupabase(page, [
    row({ drive_id: 'p1', title: 'Placeholder Poem', also_in: ['c1', 'gone-id', 'c2'] }),
    row({ drive_id: 'c1', title: 'Poems for Placeholder', kind: 'collection' }),
    row({
      drive_id: 'c2',
      title: '',
      has_title: false,
      kind: 'diary',
      body: 'Untitled diary first line\nmore',
    }),
  ]);
  await login(page);
  await goto(page, '#/p/p1');
  const row_ = page.locator('.also-in');
  await expect(row_).toContainText('Also in:');
  await expect(row_.locator('.also-link')).toHaveCount(2); // the missing id is skipped
  await expect(row_.locator('.also-link').nth(0)).toContainText('Poems for Placeholder');
  await expect(row_.locator('.also-link').nth(0)).toContainText('Collection');
  await expect(row_.locator('.also-link').nth(1)).toContainText('Untitled diary first line');
  await expect(row_.locator('.also-link').nth(1)).toContainText('Diary');
  await expect(row_.locator('.also-link .untitled')).toHaveCount(1); // untitled in italics

  await row_.locator('.also-link').nth(0).click();
  await expect(page).toHaveURL(/#\/p\/c1$/);
  await expect(page.locator('.piece-title')).toHaveText('Poems for Placeholder');
});

test('a collection says "Includes:", shows 12 links and expands "+ N more"', async ({ page }) => {
  const kids: Row[] = Array.from({ length: 14 }, (_, i) =>
    row({ drive_id: `k${String(i).padStart(2, '0')}`, title: `Placeholder child ${i}` }),
  );
  await mockSupabase(page, [
    row({
      drive_id: 'col',
      title: 'Placeholder Collection',
      kind: 'collection',
      also_in: [...kids.map((k) => k.drive_id), 'missing-id'],
    }),
    ...kids,
  ]);
  await login(page);
  await goto(page, '#/p/col');
  const box = page.locator('.also-in');
  await expect(box).toContainText('Includes:');
  await expect(box.locator('.also-link')).toHaveCount(12);
  await expect(box.getByRole('button', { name: '+ 2 more' })).toBeVisible(); // 14 present, missing skipped
  await box.getByRole('button', { name: '+ 2 more' }).click();
  await expect(box.locator('.also-link')).toHaveCount(14);
  await expect(box.getByRole('button', { name: /more/ })).toHaveCount(0);
});

test('a linked piece waiting for the trash is skipped', async ({ page }) => {
  await mockSupabase(
    page,
    [
      row({ drive_id: 'p1', title: 'Placeholder Poem', also_in: ['c1', 'c2'] }),
      row({ drive_id: 'c1', title: 'Placeholder Kept', kind: 'collection' }),
      row({ drive_id: 'c2', title: 'Placeholder Trashed', kind: 'collection' }),
    ],
    {
      requests: [
        {
          id: 1,
          drive_id: 'c2',
          action: 'trash',
          value: null,
          created_at: '2026-10-19T10:00:00Z',
          done_at: null,
          result: null,
        },
      ],
    },
  );
  await login(page);
  await goto(page, '#/p/p1');
  await expect(page.locator('.also-link')).toHaveCount(1);
  await expect(page.locator('.also-in')).not.toContainText('Placeholder Trashed');
});

test('no Also in row when nothing is linked', async ({ page }) => {
  await mockSupabase(page);
  await login(page);
  await goto(page, '#/p/a1');
  await expect(page.locator('.also-in')).toHaveCount(0);
});

test('no sideways scroll at 320 px with a long Also in row', async ({ page }) => {
  const kids: Row[] = Array.from({ length: 14 }, (_, i) =>
    row({ drive_id: `k${i}`, title: `Placeholder child with a rather long title number ${i}` }),
  );
  await mockSupabase(page, [
    row({
      drive_id: 'col',
      title: 'Col',
      kind: 'collection',
      also_in: kids.map((k) => k.drive_id),
    }),
    ...kids,
  ]);
  await page.setViewportSize({ width: 320, height: 892 });
  await login(page);
  await goto(page, '#/p/col');
  await page.getByRole('button', { name: /more/ }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
