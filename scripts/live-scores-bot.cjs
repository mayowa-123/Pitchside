/**
 * ⚽ LIVE SCORES BOT
 * Polls Highlightly for the day's matches on a fixed schedule and writes
 * ONE shared Firestore document that every user's app reads from in
 * real-time (onSnapshot) — instead of each user's phone calling Highlightly
 * directly, which is what the frontend was doing before this existed
 * (the live ticker alone was polling the API every 20 seconds per user,
 * unconditionally — this bot replaces that entirely).
 *
 * Runs every 5 minutes via .github/workflows/live-scores-bot.yml
 * (GitHub Actions' minimum schedulable interval — see workflow file for why).
 */

const admin = require('firebase-admin');
const axios = require('axios');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const CONFIG = {
  BASE_URL: 'https://soccer.highlightly.net',
  API_KEY: process.env.HIGHLIGHTLY_API_KEY_DIRECT,
};

async function fetchTodaysMatches() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const url = `${CONFIG.BASE_URL}/matches?date=${today}&timezone=Africa/Lagos`;

  console.log(`📡 Fetching matches for ${today}...`);

  const response = await axios.get(url, {
    headers: {
      'x-rapidapi-key': CONFIG.API_KEY,
      'x-rapidapi-host': 'soccer.highlightly.net',
    },
    timeout: 15000,
  });

  const data = response.data;
  const matches = Array.isArray(data) ? data : (data?.data || []);
  console.log(`✅ Got ${matches.length} matches`);
  return matches;
}

// Same field-mapping convention as api/football.js, kept consistent so the
// frontend doesn't need two different shapes depending on the source.
function transformMatch(m) {
  return {
    fixture: {
      id: m.id,
      status: { short: m.state?.description || m.status || 'NS', elapsed: m.state?.clock ?? null },
      date: m.date || m.kickoff || null,
    },
    teams: {
      home: { id: m.homeTeam?.id, name: m.homeTeam?.name || 'Home', logo: m.homeTeam?.logo || '' },
      away: { id: m.awayTeam?.id, name: m.awayTeam?.name || 'Away', logo: m.awayTeam?.logo || '' },
    },
    goals: {
      home: m.state?.score?.home ?? m.homeGoals ?? null,
      away: m.state?.score?.away ?? m.awayGoals ?? null,
    },
    league: { id: m.league?.id, name: m.league?.name || 'Football' },
  };
}

async function run() {
  console.log('\n' + '='.repeat(60));
  console.log('⚽ LIVE SCORES BOT');
  console.log('='.repeat(60));

  if (!CONFIG.API_KEY) {
    console.error('❌ HIGHLIGHTLY_KEY not set — aborting');
    process.exit(1);
  }

  try {
    const rawMatches = await fetchTodaysMatches();
    const matches = rawMatches.map(transformMatch);
    const hasLive = matches.some(m => ['1H', '2H', 'ET', 'BT', 'P', 'INT', 'LIVE'].includes(m.fixture.status.short));

    // ONE document, overwritten in full every run — every connected client
    // gets this update instantly via onSnapshot, no polling needed on their end.
    await db.collection('liveScores').doc('current').set({
      matches,
      hasLive,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      matchCount: matches.length,
    });

    console.log(`✅ Saved ${matches.length} matches (${hasLive ? 'LIVE matches present' : 'no live matches right now'})`);
    console.log('='.repeat(60));
  } catch (error) {
    console.error('❌ Bot error:', error.message);
    // Don't overwrite Firestore with bad/empty data on a failed fetch —
    // stale-but-good data is better than wiping the board on a hiccup.
    process.exit(1);
  }
}

run().then(() => process.exit(0));
