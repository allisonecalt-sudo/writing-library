# writing-library ("My Writing")

A private, read-only reading app for Allison's ~1,000 poems and other writing.

## What this is

A phone-first PWA with four tabs: Home (search, Today's poem), Shelves (her own collections), Browse (filter by kind, year, theme, mood) and First lines (A–Z index). Tap a piece to read it, switch between its versions, and open the original in Drive. It only reads. It never writes anything.

## Why it exists

Her words, Oct 19 2026: _"a rlly organized website the drive is thliek the master make sure all is ther nad then on the wbstie i cna click adn look around"_ and _"def private bc i want all in it"_.

## What's decided

- Google Drive is the master. The app is a window onto it and never changes anything.
- Data arrives in the Supabase table `public.writing_pieces` via `second-brain/scripts/writing-sync.py`. Not this repo's job.
- Her login only. The table is readable by her logged-in user (RLS), not by the anon key. If you are logged out you see only the login card.
- No writing lives in this repo. Test fixtures are invented placeholder text.
- English / LTR chrome. Every block of her text and every title carries `dir="auto"`, so Hebrew pieces render right.
- One accent colour (`#2d6a4f`), used only for the primary actions: "Open in Drive" and "Log in".
- One card per work (its `is_top` version). Other versions show as pills above the body.

## What's built (v1.3 on top of v1.2, v1.1 and v1.0)

- v1.3: ✏️ Edit on Google Docs only (`writing_pieces.editable`). The body becomes a textarea; Save inserts a `writing_requests` row `action = 'edit'` with the full new text and `base_modified` = the piece's `drive_modified`. A pending edit is shown as the body everywhere (view, previews, search, first lines, dice) with a banner and Undo. The nightly job skips an edit if the Doc changed after `base_modified`; the piece view then shows a quiet "Your edit wasn't written" line with "show my edit" so her text is never lost.

- v1.2: "💬 Note to Claude" on every piece (and a general note from Home). A note is a `writing_requests` row with `action = 'note'`; Claude answers later by setting `result` and `done_at`. Notes show as a thread on the piece version they were written on, with Unsend while unanswered. Home has a "Notes to Claude" card (waiting / answered in the last 14 days) with a quiet dot for new replies. Replies are reloaded when the app returns to the foreground and when Home opens (no polling). Notes never change kind, top or trash state.

- v1.1: a 🎲 Roll button on Home (random poem, last 20 not repeated), audit controls in the piece view (Trash, Kind picker, Put on top), and a "To trash" card on Home. Controls only INSERT or DELETE (undo) rows in `public.writing_requests`; a nightly job applies them to Drive. The app applies her pending requests in memory at once (latest kind request per piece wins, latest top request per work wins, pending-trash pieces are hidden from every list). Writes use the server's returned row; on error it shows "Couldn't save that. Try again." and changes nothing.
- v1.0 pieces below.

- `index.html`, `styles.css`, `app.ts` plus `lib/` (`data`, `search`, `route`, `views`, `format`, `types`).
- Hash routes: `#/home`, `#/shelves`, `#/shelf/<name>`, `#/browse?kind=&year=&theme=&mood=`, `#/first`, `#/p/<drive_id>`.
- Loads the table in pages of 1,000 (`.range()`), holds it in memory.
- PWA: manifest, icons (192 / 512 / maskable), `sw.js` (cache-first shell, network-first for Supabase GETs, auth calls never cached). The visible `APP_VERSION` in `app.ts` and `VERSION` in `sw.js` must match on every deploy.
- Playwright tests with Supabase fully mocked (`tests/`). They never touch the real project.

## Run it

```
npm install
npm run build      # tsc -> dist/
npm run format:check && npm run lint && npm test
npm run serve      # http://localhost:4871
```

`node scripts/render-icons.js` re-renders the PNG icons from `icon.svg`.

## What's next

- A doubles screen.
- Not deployed yet. No GitHub repo, no Pages. Her call.

## Links

- Map of her writing: `second-brain/creative/writing-map.md`
- Data loader: `second-brain/scripts/writing-sync.py`
- Style guide followed: `second-brain/reference/app-building-guide.md`
