// api/highlightly.js
//
// Secure, CACHED proxy for Highlightly. Every match-detail lookup
// (match/lineups/odds/h2h/highlights) is backed by Firestore so that
// repeat views -- from any number of users -- cost zero additional
// Highlightly requests once a piece of data has been fetched within its
// freshness window.
//
// WHY THIS EXISTS: the $9.49/mo Highlightly plan allows 7,500 requests/
// day, shared across the live-scores bot AND every match-detail view in
// the app. Without caching, cost scales with USERS (every tap = 1+ API
// calls). With this cache, cost scales with DISTINCT MATCHES -- a match
// watched by 10 people or 10 million costs Highlightly the same.
//
// TTLs below were sized against a worst-case budget of ~200 distinct
// matches/day (the live-scores bot uses ~288 req/day on its own,
// leaving ~7,200/day for this):
//   MATCH_LIVE (6 min TTL)  -> ceiling ~ 105min live phase / 6min = 18 calls/match
//   LINEUPS    (20 min TTL) -> ceiling ~ 60min pre-kickoff / 20min = 3 calls/match
//   ODDS       (10 min TTL) -> ceiling ~ 90min pre-kickoff / 10min = 9 calls/match
//   H2H        (30 day TTL) -> 1 call ever per team-pair (reused across
//                              every future meeting of these two teams)
//   HIGHLIGHTS (scheduled)  -> checked at most 4 times per match (1h/6h/
//                              24h/48h after full time), then stopped
// Total worst case: ~35 calls/match x 200 matches = 7,000/day, +288/day
// for live scores = ~7,288/day against the 7,500/day cap.
//
// If real usage ever regularly exceeds ~200-220 distinct matches/day,
// these same TTLs will start exceeding budget -- that's the signal to
// either loosen TTLs (fewer live refreshes per match) or upgrade to the
// $20.99/mo tier (25,000 req/day), not a sign this code is broken.
//
// REQUIRES (set these before deploying):
//   1. Vercel env var FIREBASE_SERVICE_ACCOUNT -- same JSON value already
//      used by the GitHub Actions live-scores bot secret. Vercel and
//      GitHub Actions are separate environments; this must be added to
//      Vercel separately.
//   2. `firebase-admin` listed in this project's package.json deps.
//   3. Vercel env var HIGHLIGHTLY_API_KEY_DIRECT (same key the bot uses).
//
// If Firestore isn't reachable (missing/broken credentials), every
// function below falls back to calling Highlightly directly and skips
// caching, rather than failing the whole endpoint -- so a Firebase
// misconfiguration degrades to "no caching" instead of "site is down."

import admin from 'firebase-admin';

const BASE_URL = 'https://soccer.highlightly.net';

let db = null;
if (!admin.apps.length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    } catch (e) {
      console.error('[highlightly] FIREBASE_SERVICE_ACCOUNT invalid -- caching disabled:', e.message);
    }
  } else {
    console.error('[highlightly] FIREBASE_SERVICE_ACCOUNT not set -- caching disabled, every request will hit Highlightly directly');
  }
}
if (admin.apps.length) db = admin.firestore();

const TTL = {
  MATCH_LIVE: 6 * 60 * 1000,
  LINEUPS: 20 * 60 * 1000,
  ODDS: 10 * 60 * 1000,
  H2H: 30 * 24 * 60 * 60 * 1000,
};

const HIGHLIGHT_CHECK_WINDOWS_MS = [
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  48 * 60 * 60 * 1000,
];

function tsToMs(ts) {
  return ts?.toDate ? ts.toDate().getTime() : (typeof ts === 'number' ? ts : 0);
}

async function fetchHighlightly(path, apiKey) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': 'soccer.highlightly.net' },
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* non-JSON body */ }
  return { status: res.status, ok: res.ok, json, text };
}

async function cachedField(docRef, field, ttlMs, fetchFn) {
  const snap = await docRef.get();
  const existing = snap.exists ? snap.data()?.[field] : null;

  if (existing?.frozen) {
    return { data: existing.data, status: existing.status ?? 200, fromCache: true };
  }

  const ageMs = existing?.fetchedAt ? Date.now() - tsToMs(existing.fetchedAt) : Infinity;
  if (existing && ageMs < ttlMs) {
    return { data: existing.data, status: existing.status ?? 200, fromCache: true };
  }

  const lockAgeMs = existing?.fetchLockAt ? Date.now() - tsToMs(existing.fetchLockAt) : Infinity;
  if (existing?.fetchInProgress && lockAgeMs < 15000) {
    return { data: existing.data ?? null, status: existing.status ?? 200, fromCache: true, stale: true };
  }

  await docRef.set({
    [field]: { ...(existing || {}), fetchInProgress: true, fetchLockAt: admin.firestore.FieldValue.serverTimestamp() },
  }, { merge: true });

  try {
    const { data, status } = await fetchFn();
    await docRef.set({
      [field]: {
        data,
        status,
        fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
        fetchInProgress: false,
      },
    }, { merge: true });
    return { data, status, fromCache: false };
  } catch (e) {
    await docRef.set({
      [field]: { ...(existing || {}), fetchInProgress: false },
    }, { merge: true });
    if (existing?.data) return { data: existing.data, status: existing.status ?? 200, fromCache: true, stale: true };
    throw e;
  }
}

function isFinishedDescription(desc) {
  const d = (desc || '').toLowerCase();
  return d.includes('finished') || d === 'ft' || d.includes('ended');
}

async function getMatchCached(matchId, apiKey) {
  if (!db) {
    const r = await fetchHighlightly(`/matches/${encodeURIComponent(matchId)}`, apiKey);
    return { status: r.status, json: r.json };
  }

  const docRef = db.collection('matchCache').doc(String(matchId));
  const result = await cachedField(docRef, 'match', TTL.MATCH_LIVE, async () => {
    const r = await fetchHighlightly(`/matches/${encodeURIComponent(matchId)}`, apiKey);
    if (!r.ok) throw new Error(`status ${r.status}`);
    return { data: r.json, status: r.status };
  });

  if (!result.fromCache) {
    try {
      const matchObj = Array.isArray(result.data) ? result.data[0] : result.data;
      if (isFinishedDescription(matchObj?.state?.description)) {
        const snap = await docRef.get();
        const field = snap.data()?.match;
        if (field && !field.finalizedAt) {
          await docRef.set({ match: { finalizedAt: admin.firestore.FieldValue.serverTimestamp() } }, { merge: true });
        } else if (field?.finalizedAt && Date.now() - tsToMs(field.finalizedAt) > 60 * 60 * 1000) {
          await docRef.set({ match: { frozen: true } }, { merge: true });
        }
      }
    } catch (e) {
      console.warn('[highlightly] match freeze-check failed (non-fatal):', e.message);
    }
  }

  return { status: result.status, json: result.data };
}

async function getLineupsCached(matchId, apiKey) {
  if (!db) {
    const r = await fetchHighlightly(`/lineups/${encodeURIComponent(matchId)}`, apiKey);
    return { status: r.status, json: r.json };
  }

  const docRef = db.collection('matchCache').doc(String(matchId));
  const result = await cachedField(docRef, 'lineups', TTL.LINEUPS, async () => {
    const r = await fetchHighlightly(`/lineups/${encodeURIComponent(matchId)}`, apiKey);
    if (!r.ok) throw new Error(`status ${r.status}`);
    return { data: r.json, status: r.status };
  });

  if (!result.fromCache) {
    const hasLineup = (result.data?.homeTeam?.initialLineup?.length || 0) > 0;
    if (hasLineup) {
      await docRef.set({ lineups: { frozen: true } }, { merge: true });
    }
  }

  return { status: result.status, json: result.data };
}

async function getOddsCached(matchId, apiKey) {
  if (!db) {
    const r = await fetchHighlightly(`/odds?matchId=${encodeURIComponent(matchId)}`, apiKey);
    return { status: r.status, json: r.json };
  }

  const docRef = db.collection('matchCache').doc(String(matchId));
  const snap = await docRef.get();
  const matchField = snap.data()?.match;
  const matchObj = matchField ? (Array.isArray(matchField.data) ? matchField.data[0] : matchField.data) : null;
  const matchDesc = (matchObj?.state?.description || '').toLowerCase();
  const matchStarted = matchDesc && matchDesc !== 'not started' && matchDesc !== 'ns';

  const existingOdds = snap.data()?.odds;
  if (matchStarted && existingOdds && !existingOdds.frozen) {
    await docRef.set({ odds: { frozen: true } }, { merge: true });
    return { status: existingOdds.status ?? 200, json: existingOdds.data };
  }

  const result = await cachedField(docRef, 'odds', TTL.ODDS, async () => {
    const r = await fetchHighlightly(`/odds?matchId=${encodeURIComponent(matchId)}`, apiKey);
    return { data: r.json, status: r.status };
  });

  return { status: result.status, json: result.data };
}

async function getH2hCached(teamIdOne, teamIdTwo, apiKey) {
  if (!db) {
    const r = await fetchHighlightly(`/head-2-head?teamIdOne=${encodeURIComponent(teamIdOne)}&teamIdTwo=${encodeURIComponent(teamIdTwo)}`, apiKey);
    return { status: r.status, json: r.json };
  }

  const pairKey = [String(teamIdOne), String(teamIdTwo)].sort().join('_');
  const docRef = db.collection('h2hCache').doc(pairKey);
  const result = await cachedField(docRef, 'h2h', TTL.H2H, async () => {
    const r = await fetchHighlightly(`/head-2-head?teamIdOne=${encodeURIComponent(teamIdOne)}&teamIdTwo=${encodeURIComponent(teamIdTwo)}`, apiKey);
    if (!r.ok) throw new Error(`status ${r.status}`);
    return { data: r.json, status: r.status };
  });

  return { status: result.status, json: result.data };
}

async function getHighlightsCached(matchId, apiKey) {
  if (!db) {
    const r = await fetchHighlightly(`/highlights?matchId=${encodeURIComponent(matchId)}`, apiKey);
    return { status: r.status, json: r.json };
  }

  const docRef = db.collection('matchCache').doc(String(matchId));
  const snap = await docRef.get();
  const data = snap.data() || {};
  const matchField = data.match;
  const highlightsField = data.highlights;

  if (highlightsField?.found) {
    return { status: 200, json: highlightsField.data };
  }
  if (highlightsField?.exhausted) {
    return { status: 200, json: highlightsField.data || { data: [] } };
  }

  const matchObj = matchField ? (Array.isArray(matchField.data) ? matchField.data[0] : matchField.data) : null;
  const finished = isFinishedDescription(matchObj?.state?.description);
  if (!finished || !matchField?.finalizedAt) {
    return { status: 200, json: highlightsField?.data || { data: [] } };
  }

  const sinceFinishedMs = Date.now() - tsToMs(matchField.finalizedAt);
  const checksDone = highlightsField?.checksDone || 0;
  const nextWindowMs = HIGHLIGHT_CHECK_WINDOWS_MS[checksDone];

  if (nextWindowMs === undefined) {
    await docRef.set({ highlights: { exhausted: true } }, { merge: true });
    return { status: 200, json: highlightsField?.data || { data: [] } };
  }

  if (sinceFinishedMs < nextWindowMs) {
    return { status: 200, json: highlightsField?.data || { data: [] } };
  }

  const r = await fetchHighlightly(`/highlights?matchId=${encodeURIComponent(matchId)}`, apiKey);
  const foundClips = Array.isArray(r.json?.data) && r.json.data.length > 0;

  await docRef.set({
    highlights: {
      data: r.json,
      status: r.status,
      checksDone: checksDone + 1,
      found: foundClips,
      fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
  }, { merge: true });

  return { status: r.status, json: r.json };
}

export default async function handler(req, res) {
  const { endpoint, teamIdOne, teamIdTwo, matchId } = req.query;

  const apiKey = process.env.HIGHLIGHTLY_API_KEY_DIRECT;
  if (!apiKey) {
    res.status(500).json({ error: 'HIGHLIGHTLY_API_KEY_DIRECT is not configured on the server' });
    return;
  }

  try {
    let result;

    if (endpoint === 'h2h') {
      if (!teamIdOne || !teamIdTwo) {
        res.status(400).json({ error: 'teamIdOne and teamIdTwo are required for h2h' });
        return;
      }
      result = await getH2hCached(teamIdOne, teamIdTwo, apiKey);
    } else if (endpoint === 'odds') {
      if (!matchId) {
        res.status(400).json({ error: 'matchId is required for odds' });
        return;
      }
      result = await getOddsCached(matchId, apiKey);
    } else if (endpoint === 'match') {
      if (!matchId) {
        res.status(400).json({ error: 'matchId is required for match' });
        return;
      }
      result = await getMatchCached(matchId, apiKey);
    } else if (endpoint === 'lineups') {
      if (!matchId) {
        res.status(400).json({ error: 'matchId is required for lineups' });
        return;
      }
      result = await getLineupsCached(matchId, apiKey);
    } else if (endpoint === 'highlights') {
      if (!matchId) {
        res.status(400).json({ error: 'matchId is required for highlights' });
        return;
      }
      result = await getHighlightsCached(matchId, apiKey);
    } else {
      res.status(400).json({ error: `Unknown or missing endpoint: ${endpoint}` });
      return;
    }

    res.status(result.status || 200);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(result.json));
  } catch (error) {
    res.status(502).json({ error: 'Failed to reach Highlightly', detail: error.message });
  }
}
