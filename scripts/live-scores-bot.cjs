/**
 * ⚽ PITCHSIDE LIVE SCORES BOT
 *
 * Fetches today's football matches from Highlightly every 5 minutes
 * through GitHub Actions and stores ONE shared document in Firestore.
 *
 * Frontend:
 *   Firestore → liveScores/current → app.js
 *
 * This prevents every user's device from calling Highlightly directly.
 */

const admin = require('firebase-admin');
const axios = require('axios');

// ─────────────────────────────────────────────────────────────
// FIREBASE
// ─────────────────────────────────────────────────────────────

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT not set — aborting');
  process.exit(1);
}

let serviceAccount;

try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (error) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT is not valid JSON');
  console.error(error.message);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────

const CONFIG = {
  BASE_URL: 'https://soccer.highlightly.net',
  API_KEY: process.env.HIGHLIGHTLY_API_KEY_DIRECT,
  API_HOST: 'soccer.highlightly.net',
};

// ─────────────────────────────────────────────────────────────
// STATUS NORMALIZATION
// ─────────────────────────────────────────────────────────────

function getStatusShort(statusDescription) {
  if (!statusDescription) return 'NS';

  const desc = String(statusDescription).toLowerCase().trim();

  // These are Highlightly's actual documented state.description values —
  // confirmed from their own published sample code, not guessed. The
  // previous version checked for generic substrings like 'live', 'playing',
  // '1h' — none of which appear in any of Highlightly's real strings below,
  // so every single live match, in any state, fell through every check and
  // landed on the NS default. That's exactly why a match with a real score
  // already on the board was still showing "Not Started".

  // Finished — kept as a substring check (not tightened to exact match)
  // since this was already working correctly before this fix; no reason
  // to risk a regression on the one thing that wasn't broken.
  if (desc.includes('finished') || desc === 'ft' || desc.includes('ended')) {
    return 'FT';
  }

  // Half-time-style breaks (shown as their own HT badge, not lumped into LIVE)
  if (desc === 'half time' || desc === 'extra time half time' || desc === 'ht') {
    return 'HT';
  }

  // Live play — mapped to the app's existing sub-codes so index.html's
  // display logic (which already collapses 1H/2H/ET/BT/P/INT into one
  // "LIVE" badge) doesn't need to change at all
  if (desc === 'first half' || desc === '1h') return '1H';
  if (desc === 'second half' || desc === '2h') return '2H';
  if (desc === 'extra time' || desc === 'et') return 'ET';
  if (desc === 'break time' || desc === 'bt') return 'BT';
  if (desc === 'penalty shootout' || desc === 'p') return 'P';
  if (desc.includes('interrupted') || desc === 'int') return 'INT';

  // Fallback net for any live-ish phrasing not explicitly listed above
  if (
    desc.includes('live') ||
    desc.includes('playing') ||
    desc.includes('in progress')
  ) {
    return 'LIVE';
  }

  // Postponed
  if (desc.includes('postponed')) {
    return 'PST';
  }

  // Cancelled
  if (
    desc.includes('cancelled') ||
    desc.includes('canceled')
  ) {
    return 'CANC';
  }

  // Otherwise treat it as upcoming
  return 'NS';
}

// ─────────────────────────────────────────────────────────────
// FETCH TODAY'S MATCHES
// ─────────────────────────────────────────────────────────────

async function fetchTodaysMatches() {
  const today = new Date().toISOString().slice(0, 10);

  const url =
    `${CONFIG.BASE_URL}/matches` +
    `?date=${today}` +
    `&timezone=Africa/Lagos`;

  console.log(`📡 Fetching matches for ${today}...`);
  console.log(`🌍 Timezone: Africa/Lagos`);

  const response = await axios.get(url, {
    headers: {
      'x-rapidapi-key': CONFIG.API_KEY,
      'x-rapidapi-host': CONFIG.API_HOST,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });

  const rawData = response.data;

  const matches = Array.isArray(rawData)
    ? rawData
    : (rawData?.data || []);

  console.log(`✅ Got ${matches.length} matches`);

  // TEMP DIAGNOSTIC — goals are coming back null for every match, which
  // means transformMatch()'s guess at where Highlightly puts the score
  // (m.state.score.home/away) is wrong. Log one full raw match so the
  // actual field name can be found from the Actions run log, instead of
  // guessing again and burning another day with blank scores. Remove this
  // block once the real field is confirmed and transformMatch() is fixed.
  if (matches.length > 0) {
    console.log('🔍 DIAGNOSTIC — raw shape of one match:');
    console.log(JSON.stringify(matches[0], null, 2));
  }

  return matches;
}

// ─────────────────────────────────────────────────────────────
// TRANSFORM HIGHLIGHTLY → PITCHSIDE FORMAT
// ─────────────────────────────────────────────────────────────

// Highlightly's real score format — confirmed from their own published
// sample response — is a single string like "5 - 0" under
// state.score.current, NOT separate state.score.home/away numeric fields.
// That wrong assumption is exactly why every match's score has shown up
// as null this whole time, live and finished alike: the fields this code
// was reading never existed in the actual API response.
function parseScoreString(current) {
  if (typeof current !== 'string') return { home: null, away: null };
  const parts = current.split(/\s*-\s*/);
  if (parts.length !== 2) return { home: null, away: null };
  const home = parseInt(parts[0], 10);
  const away = parseInt(parts[1], 10);
  return {
    home: Number.isNaN(home) ? null : home,
    away: Number.isNaN(away) ? null : away,
  };
}

function transformMatch(m) {
  const statusDescription =
    m.state?.description ||
    m.status ||
    '';

  const statusShort = getStatusShort(statusDescription);

  const parsedScore = parseScoreString(m.state?.score?.current);

  const homeGoals =
    parsedScore.home ??
    m.state?.score?.home ??
    m.homeGoals ??
    null;

  const awayGoals =
    parsedScore.away ??
    m.state?.score?.away ??
    m.awayGoals ??
    null;

  const country =
    m.country?.name ||
    m.country?.code ||
    m.league?.country?.name ||
    m.league?.country?.code ||
    'World';

  return {
    fixture: {
      id: String(m.id),

      date:
        m.date ||
        m.kickoff ||
        null,

      timestamp:
        m.date
          ? Math.floor(new Date(m.date).getTime() / 1000)
          : null,

      status: {
        long: statusDescription || 'Not started',
        short: statusShort,
        elapsed: m.state?.clock ?? null,
      },
    },

    teams: {
      home: {
        id: m.homeTeam?.id ?? null,
        name: m.homeTeam?.name || 'Home',
        logo: m.homeTeam?.logo || '',
      },

      away: {
        id: m.awayTeam?.id ?? null,
        name: m.awayTeam?.name || 'Away',
        logo: m.awayTeam?.logo || '',
      },
    },

    goals: {
      home: homeGoals,
      away: awayGoals,
    },

    league: {
      id: m.league?.id ?? 0,
      name: m.league?.name || 'Football',
      country: country,
      logo: m.league?.logo || '',
      flag:
        m.country?.logo ||
        m.league?.flag ||
        '',
    },
  };
}

// ─────────────────────────────────────────────────────────────
// STANDINGS
//
// Only the app's core leagues (the ones with actual filter chips in the
// UI) — not all 850+ leagues Highlightly covers. Standings barely change
// within a few hours, so each league is only re-fetched if its last save
// is older than STANDINGS_REFRESH_HOURS, regardless of how often this
// whole script runs. On the free tier (100 requests/day total, shared
// with the live-scores fetch above) this keeps standings to at most
// 6 leagues × a few refreshes/day — nowhere near the cap. Raise
// STANDINGS_REFRESH_HOURS down once on a paid plan if fresher tables
// are worth the extra requests.
//
// League IDs are matched by name from today's already-fetched matches —
// never hardcoded — so this can never drift out of sync with whatever
// ID Highlightly actually assigns each league.
// ─────────────────────────────────────────────────────────────

const CORE_LEAGUES = [
  'Premier League',
  'La Liga',
  'Serie A',
  'Bundesliga',
  'Ligue 1',
  'Champions League',
];

const STANDINGS_REFRESH_HOURS = 4;

async function fetchStandingsForCoreLeagues(rawMatches) {
  console.log('📊 Checking core league standings...');

  // Build { leagueName -> {id, season} } from today's real match data —
  // this is the only place league IDs come from.
  const leagueLookup = {};
  for (const m of rawMatches) {
    const name = m.league?.name;
    const id = m.league?.id;
    const season = m.league?.season ?? new Date().getFullYear();
    if (name && id && CORE_LEAGUES.some(cl => name.includes(cl))) {
      const matchedName = CORE_LEAGUES.find(cl => name.includes(cl));
      if (!leagueLookup[matchedName]) leagueLookup[matchedName] = { id, season };
    }
  }

  const foundCount = Object.keys(leagueLookup).length;
  console.log(`📊 Found ${foundCount}/${CORE_LEAGUES.length} core leagues in today's matches`);

  for (const [leagueName, { id: leagueId, season }] of Object.entries(leagueLookup)) {
    try {
      const docRef = db.collection('standings').doc(String(leagueId));
      const existing = await docRef.get();

      if (existing.exists) {
        const lastFetched = existing.data().fetchedAt;
        const lastFetchedMs = lastFetched?.toDate ? lastFetched.toDate().getTime() : 0;
        const hoursSince = (Date.now() - lastFetchedMs) / (1000 * 60 * 60);
        if (hoursSince < STANDINGS_REFRESH_HOURS) {
          console.log(`📊 ${leagueName}: skipped, refreshed ${hoursSince.toFixed(1)}h ago`);
          continue;
        }
      }

      const url = `${CONFIG.BASE_URL}/standings?leagueId=${leagueId}&season=${season}`;
      const response = await axios.get(url, {
        headers: {
          'x-rapidapi-key': CONFIG.API_KEY,
          'x-rapidapi-host': CONFIG.API_HOST,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      // Defensive parsing, matching the same pattern used for the matches
      // fetch above — the exact response shape wasn't confirmed from
      // documentation alone, so try the most likely places for it, and
      // log the raw shape once so a wrong guess here shows up in the
      // Actions log instead of just silently saving an empty table.
      const rawStandings = response.data;
      const rows =
        (Array.isArray(rawStandings) && rawStandings) ||
        rawStandings?.data ||
        rawStandings?.groups?.[0]?.standings ||
        rawStandings?.standings ||
        [];

      if (!Array.isArray(rows) || rows.length === 0) {
        console.log(`🔍 DIAGNOSTIC — unexpected standings shape for ${leagueName}:`);
        console.log(JSON.stringify(rawStandings, null, 2).slice(0, 2000));
      }

      await docRef.set({
        leagueId,
        leagueName,
        season,
        rows,
        fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(`📊 ${leagueName}: saved ${Array.isArray(rows) ? rows.length : 0} rows`);
    } catch (error) {
      // One league's standings failing should never block the others or
      // the main live-scores write — log and move on.
      console.error(`⚠️ Standings fetch failed for ${leagueName}:`, error.message);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// WAR ROOM CLEANUP
//
// Flagged since the very first PitchSide session and never built until
// now: match_chats/{matchId} (messages + presence heartbeats) never got
// deleted when a match's day passed, so every match ever covered has
// been sitting in Firestore permanently, accumulating storage and read
// cost for zero benefit. This runs on the exact same schedule as the
// live scores fetch above (it has to — "today's matches" is only known
// right after that fetch succeeds) and deletes any match_chats document
// whose ID isn't in today's active match list, including its messages
// and presence subcollections via recursiveDelete.
//
// Deliberately non-fatal: if this fails, the live scores write above
// already succeeded, which is the job's actual priority. A cleanup
// failure should never take down the whole bot run.
// ─────────────────────────────────────────────────────────────

async function cleanupExpiredWarRooms(activeMatchIds) {
  console.log('🧹 Checking for expired War Room chats…');

  try {
    const activeSet = new Set(activeMatchIds.map(String));
    const docRefs = await db.collection('match_chats').listDocuments();

    const expired = docRefs.filter(ref => !activeSet.has(ref.id));

    if (expired.length === 0) {
      console.log('🧹 No expired War Room chats to remove');
      return;
    }

    for (const ref of expired) {
      await db.recursiveDelete(ref);
    }

    console.log(`🧹 Removed ${expired.length} expired War Room chat(s)`);
  } catch (error) {
    console.error('⚠️ War Room cleanup failed (non-fatal):', error.message);
  }
}

async function run() {
  console.log('');
  console.log('='.repeat(60));
  console.log('⚽ PITCHSIDE LIVE SCORES BOT');
  console.log('='.repeat(60));

  // Check API key
  if (!CONFIG.API_KEY) {
    console.error(
      '❌ HIGHLIGHTLY_API_KEY_DIRECT not set — aborting'
    );
    process.exit(1);
  }

  try {
    // 1. Fetch Highlightly
    const rawMatches = await fetchTodaysMatches();

    // 2. Transform
    const matches = rawMatches
      .map(transformMatch)
      .filter(match => match.fixture.id);

    // 3. Detect live matches
    const liveStatuses = [
      'LIVE',
      '1H',
      '2H',
      'ET',
      'BT',
      'P',
      'INT',
    ];

    const hasLive = matches.some(match =>
      liveStatuses.includes(match.fixture.status.short)
    );

    // 4. Count status types for debugging
    const statusCounts = {};

    matches.forEach(match => {
      const status = match.fixture.status.short;

      statusCounts[status] =
        (statusCounts[status] || 0) + 1;
    });

    console.log('📊 Status breakdown:');
    console.log(statusCounts);

    // 5. Save ONE shared Firestore document
    await db
      .collection('liveScores')
      .doc('current')
      .set({
        matches,
        hasLive,

        updatedAt:
          admin.firestore.FieldValue.serverTimestamp(),

        matchCount: matches.length,

        source: 'highlightly',

        timezone: 'Africa/Lagos',

        updatedDate:
          new Date().toISOString().slice(0, 10),
      });

    console.log(
      `✅ Saved ${matches.length} matches`
    );

    console.log(
      hasLive
        ? '🔴 LIVE matches are currently present'
        : '⚪ No live matches right now'
    );

    console.log(
      `🔥 Firestore: liveScores/current`
    );

    // Clean up War Room chats for matches that are no longer today's —
    // must happen after the write above, since we need today's real
    // match ID list to know what to keep.
    await cleanupExpiredWarRooms(matches.map(m => m.fixture.id));

    // Standings for the app's core leagues — throttled independently
    // (see STANDINGS_REFRESH_HOURS above), uses rawMatches (not the
    // transformed `matches`) since it needs league.season, which doesn't
    // survive transformMatch()'s output shape.
    await fetchStandingsForCoreLeagues(rawMatches);

    console.log('='.repeat(60));
  } catch (error) {
    console.error('❌ Bot error:', error.message);

    if (error.response) {
      console.error(
        'HTTP status:',
        error.response.status
      );

      if (error.response.data) {
        console.error(
          'API response:',
          JSON.stringify(
            error.response.data,
            null,
            2
          )
        );
      }
    }

    // Never overwrite good Firestore data
    // when the API request fails.
    process.exit(1);
  }
}

run()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
