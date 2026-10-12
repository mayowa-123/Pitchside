# PitchSide hardening pass — what changed

Copy each file to the same path in your repo (GitHub web editor: open file → paste).
Files in this zip are ONLY the ones that changed or are new.

## Do these in order
1. **Firebase console → Firestore → Rules**: paste `firestore.rules` → Publish.
   (Then Indexes: create the two in `firestore.indexes.json` if comments/notifications show an index error.)
2. Upload `firebase-auth.js`, `app.js`, `index.html`, `comments.js`, `war-room.js`, `settings.js`, `match-detail.js`, `pitchside-ai.js`.
3. Upload the `api/` files (new `api/_auth.js` is required). Vercel env `FIREBASE_SERVICE_ACCOUNT` must exist (it already does for highlightly.js).
4. Upload `scripts/live-scores-bot.cjs` and `.github/workflows/*`.

## Safe to delete from the repo (unused / duplicates)
`netlify/`, `netlify.toml`, `api/sportmonks.js`, `api/highlights.js`, `api/standing.js`, `persistent-interactions.js`,
`debug.html`, `analyze_html.py`, `test_*.js`, `IMPLEMENTATION_PLAN.md`, `IMPROVEMENTS_SUMMARY.md`, `HANDOVER.md`, `docs/`.
