# CLAUDE.md — Network Review Board

This file tells Claude Code (or any agent) how to work on this repo.

## What this is

A single-page static web app that acts as Charles Song's investor-network review board. Deployed to GitHub Pages at:
**https://kzhu-tishman.github.io/nrb-52d78fdc2196/**

The board reads/writes a Supabase database (`fpgcorarhyopljrwjzls`) directly from the browser using a public "publishable" anon key. Nothing on the server side lives in this repo.

## Files

- `index.html` — page shell, password gate, and cache-buster (`?v=YYYYMMDDx` on `app.js`)
- `app.js` — all UI logic. ~2500 lines. Sections in order: config, Supabase helpers, formatters, calendar tab, threads tab, lists (rolodex) tab, invites tab, "This Week" widget, modals, toast/undo helper
- `style.css` — all styling (Nexus palette: bg `#F7F6F2`, primary `#01696F`, error `#A12C7B`)
- `README.md` — human-facing overview

## Local development

There is no build step. Just edit files and open `index.html` in a browser.
For quick local testing:
```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Making changes

1. Edit `app.js` / `style.css` / `index.html` as needed
2. **Bump the cache-buster** in `index.html` line ~220: `?v=20260916a` → `?v=20260916b` (or new date). Without this the user's browser caches the old JS and your change looks like it didn't apply.
3. Commit and push to `main`. GitHub Pages auto-deploys in ~1–2 min.
4. Verify at the deployed URL. Password is `100park` (12h TTL in localStorage).

## Conventions Katie has locked in

- **No editorial/interpretive commentary in the Lists tab.** Show name, firm, title, city only. No "great fit for X" notes.
- **Notes are minimal.** Only what's essential. No CS: or Charles: prefixes on interaction notes (Charles is the assumed owner). Only prefix a different owner ("KZ:", "CC:").
- **Sidebar order is fixed** — do not reorder.
- **No zero-touch alerts** — do not add "hasn't been touched in N days" widgets. Clogs the view.
- **No "Upcoming Events" widget in the This Week card** — that's what her calendar is for.
- **Remove buttons must be pill-styled and undoable** — every destructive row action shows a toast with an Undo link for ~6 seconds.
- **Lists are alphabetical and edit-ready** — she reviews them live with CS.

## Supabase (data)

- URL: `https://fpgcorarhyopljrwjzls.supabase.co`
- Publishable/anon key is hardcoded in `app.js` lines 8–9. This is intentional — RLS on the DB enforces access, the key is safe to expose.
- Tables you'll touch: `contacts`, `interactions`, `events`, `event_invitees`, `followups`, `dashboard_state`
- **Never** put a service-role key in this repo. If Claude needs one for a script, it lives outside the repo.

## Password gate

- SHA-256 hash of the password lives in `index.html` (search for `EXPECTED =`)
- To change the password: hash the new one and update that line. Users' 12h localStorage entries will stop matching and they'll re-enter.
  ```bash
  python3 -c "import hashlib; print(hashlib.sha256(b'newpassword').hexdigest())"
  ```
- Not real security — anyone who views source can extract the hash. Only prevents casual URL sharing.

## Deploy asset id (Perplexity, mostly historical)

There's still a Perplexity-hosted copy at `https://www.perplexity.ai/computer/a/network-review-board-joKd8wwpRpqyQkDKdax6dQ` (asset_id `8e829df3-0c29-469a-b242-40ca75ac7a75`). While Katie is transitioning, that copy is kept in sync manually via her Perplexity chats. Once GitHub Pages is the source of truth, that copy can be retired.

## Things NOT to do

- Don't touch the sidebar order or add widgets to This Week without checking with Katie first
- Don't add editorial notes to Lists
- Don't rename tables or columns in the Supabase schema from client code
- Don't check in secrets. If you need one, tell Katie and she'll set it up.
- Don't remove the password gate without asking
