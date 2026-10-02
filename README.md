# CRU+ Coffee Log

A buildless, mobile-first dashboard for Batch Brew +, Batch Brew, Cold Brew and Decaf. Serve over HTTP with `npm start`; run the persistence tests with `npm test`.

## Safe preview

`cloud-config.js` defaults to `readOnly: true`. It reads the existing live Supabase table but never issues POST, PATCH or DELETE requests. Edits are saved in this browser only, clearly labelled as preview drafts. Preview and write-enabled caches use different keys, so preview drafts cannot accidentally sync during cutover. Clearing browser storage removes device-only drafts.

Do not merge or deploy this branch to the operating GitHub Pages site before reviewing `PREVIEW_REVIEW.md`.

## Data compatibility

No SQL migration is required. Uses `batch_brew_records(record_date, payload, updated_at)` and existing keys: `YYYY-MM-DD` for batch; `cold-decaf:YYYY-MM-DD` for cold/decaf. Existing `b1History`, `b2History`, `coldHistory`, `decafHistory`, QC fields and unknown JSON fields remain intact. New saves append revisions and update legacy top-level recipe fields. Existing extraction-volume/QC data is preserved but is not presented as an analytics chart.

New revision fields inside existing JSON: `active`, `tool`, `waterTemp`, `image` (compressed JPEG data URL), `updatedBy`, `mutationId`, `recipeType`, and `prepTime`; origin/notes/water can now also be stored for decaf. There are no destructive actions in the dashboard.

## Autosave and offline

Valid changes enter a persisted local queue immediately. Cloud sync starts after about 1 second idle or when settings close. Unsent changes for the same recipe/date coalesce. Invalid form values also have a local editor cache and require correction before entering the sync queue. Staff identity is stored locally and captured with each queued revision.

With writes enabled, reads fetch the current cloud row before each write. PATCH uses `updated_at` as a compare-and-swap condition; concurrent changes to other recipes are preserved, while overlapping field edits stop for explicit conflict review. A revision's `mutationId` prevents duplicate insertion after a lost acknowledgement. Network failures retain the queue. Reconnect, refresh, visibility return and a 15-second foreground retry sync pending changes. No background-sync promise: if the browser is closed, reopen it to sync.

Cloud reads paginate in batches of 500, and foreground polling reflects other phones' updates. No real-time subscription is required. A service worker caches only app-shell assets on the same origin; Supabase responses and writes are excluded. Offline records and draft queues come from localStorage. HTTPS is required for phone installation; iOS uses Share → Add to Home Screen.

## Authentication later

All data access is centralized in `sync.js`. An optional `config.accessToken()` can provide a signed-in user's token later, alongside Supabase Auth and proper RLS policies. Staff selection is attribution, not authentication. Existing public database policies remain unchanged.

## Branding

The original uploaded CRU+ clover and approved mockup were unavailable through the referenced conversation and are absent from the repository/live HTML. Current preview uses a CRU+ text mark and restrained sage/cream styling. Add the supplied original logo to `assets/` and set `brandLogo` in config; do not substitute an invented clover.
