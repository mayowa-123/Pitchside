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

  const desc = String(statusDescription).toLowerCase();

  // Finished
  if (
    desc.includes('finished') ||
    desc.includes('ended') ||
    desc === 'ft'
  ) {
    return 'FT';
  }

  // Half time
  if (
    desc.includes('halftime') ||
    desc.includes('half-time') ||
    desc === 'ht'
  ) {
    return 'HT';
  }

  // Live
  if (
    desc.includes('live') ||
    desc.includes('playing') ||
    desc.includes('progress') ||
    desc.includes('in progress') ||
    desc === '1h' ||
    desc === '2h' ||
    desc === 'et' ||
    desc === 'bt' ||
    desc === 'p' ||
    desc === 'int'
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
