# Preview review and live cutover

## Implemented

- One responsive dashboard; old Cold Brew/Decaf URL redirects into it.
- Sticky four-recipe strip with swipeable mobile cards, optional coffee image, neutral placeholder and inactive indication.
- Settings drawer on desktop and bottom sheet on mobile; recipe type identifies the fixed service slot. Includes active state, origin, roast date, notes, tool, grind/dose touch controls, water/ratio, temperature, Cold Brew preparation/serve fields, decaf yield, QC text, reason, staff and optional image.
- Daily logs filter by date/type/search; all historical revisions and raw saved fields can be inspected and exported.
- 7-day EK/dose plots with held recipe values, keyboard/touch change markers and staff/reason history. No extraction-volume analysis.
- Durable draft queue, debounced cloud persistence, failure/retry handling and overlapping-edit review.
- Installable PWA manifest, PNG icons, same-origin offline shell and cached actual records.

## Preview safety

The preview reads actual current cloud records, never seeded sample data. It does not write to the operating database. Local edits show "Preview draft saved · device only". Multi-phone cloud editing is implemented but needs an isolated staging Supabase table before staff try it together; the first deployed preview deliberately does not activate live writes.

No schema or Supabase policy changes were applied. The preview branch does not replace the live site. Sites preview hosting is a separate private site for the owner; its access gate is supplied by hosting, not app passwords or Supabase Auth.

## Before cutover

1. Supply the original CRU+ clover and approved mockup for exact visual matching.
2. Back up the live table and provision a staging copy with the same columns/policies. Change only the preview config's table to staging, then set readOnly false. Avoid namespaced preview rows in the live table: the old app may display them.
3. Have two staff phones test save visibility, offline/reopen/reconnect, image revisions and simultaneous same-field conflicts against staging. Physical iOS/Android installation should be checked on devices; browser emulation does not establish native-device behavior.
4. Confirm no legacy editor is modifying records during migration. New-client compare-and-swap cannot prevent an old client from blindly overwriting a later payload.
5. Review access: the existing public Supabase policies allow anyone with the public endpoint/key to write. Staff identity is not a security boundary. Supabase Auth can be added later as requested.
6. Deploy the reviewed branch only after approval. Point table back to live and set readOnly false. Keep an independent backup/rollback snapshot and the prior main commit.

## Operational limits

- Browser localStorage is finite and device-specific; private browsing/storage clearing can lose unsynced drafts. Quota errors are visible and do not claim saved status.
- Images are resized to at most 480px, JPEG encoded, limited to 220 KB encoded, and stored inside revisions. Repeated images increase row size and local cache use; move images to Supabase Storage later for a larger catalog.
- Polling fetches complete history every 15 seconds when idle; this suits the current small table but needs incremental reads as usage grows.
- Carry-forward plots represent recipe settings, not independent brew measurements. Days without a saved setting stay empty. Recipe dates use Melbourne service dates; timestamp labels use Australia/Melbourne.
- App-shell updates are network-first; the next navigation loads current assets. Bump the cache version on future shell changes, and review service-worker scope before moving to live.
