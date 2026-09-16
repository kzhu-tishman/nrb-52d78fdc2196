# CS Network Review Board

Front-end code for the CS (Charles Song) investor-network review board, deployed on Perplexity Computer.

**Live board:** https://www.perplexity.ai/computer/a/network-review-board-joKd8wwpRpqyQkDKdax6dQ

## What's here

- `index.html` — page shell + cache-buster
- `app.js` — all UI logic (calendar, threads, lists, invites)
- `style.css` — styling

## What's NOT here

- **Data** (contacts, followups, invites, events, dashboard_state) lives in a Supabase project (`fpgcorarhyopljrwjzls`). This repo only touches presentation logic.
- **Deploy asset id** `8e829df3-0c29-469a-b242-40ca75ac7a75` — used by the deploy workflow to update the same live URL.

## Deploy flow

Any push to `main` triggers `.github/workflows/deploy.yml`, which redeploys the board to its permanent Perplexity URL via `deploy_website`.

## Editing

Bump the cache-buster in `index.html` line 141 (`?v=YYYYMMDDx`) so the browser fetches fresh JS/CSS after each deploy.
