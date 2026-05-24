// ============================================================
//  football.js  —  Netlify/Vercel serverless function
//  Powered by Highlightly Football API (soccer.highlightly.net)
//  Drop-in replacement for the old API-Football version.
//  Your app.js calls /api/football?endpoint=fixtures&date=YYYY-MM-DD
//  and this file translates that into a Highlightly request,
//  then converts the response back into the exact shape your
//  app.js already expects (API-Football format).
// ============================================================

export default async function handler(req, res) {

  // ── CORS ─────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── API Key ───────────────────────────────────────────────
  // Add  HIGHLIGHTLY_KEY=your_key  to your Netlify/Vercel env vars
  // Supports BOTH sources:
  //   - RapidAPI key  → uses football-highlights-api.p.rapidapi.com
  //   - Highlightly direct key → uses soccer.highlightly.net
  const apiKey = process.env.HIGHLIGHTLY_KEY;
  if (!apiKey) {
    console.error('[football.js] HIGHLIGHTLY_KEY env var is not set!');
    return res.status(500).json({
      errors: { token: 'HIGHLIGHTLY_KEY not configured in environment variables' },
      response: []
    });
  }

  // RapidAPI keys are long alphanumeric strings (50+ chars).
  // Highlightly direct keys are shorter. We default to RapidAPI
  // since that's what your screenshot shows you are using.
  const USE_RAPIDAPI = true; // set to false if you have a direct Highlightly key

  // ── Parse request ─────────────────────────────────────────
  const params   = { ...req.query };
  const endpoint = (params.endpoint || 'fixtures').toLowerCase();
  delete params.endpoint;

  console.log(`[football.js] endpoint=${endpoint}`, params);

  try {
    // ── Route to the right Highlightly handler ────────────
    if (endpoint === 'fixtures') {
      return await handleFixtures(params, apiKey, USE_RAPIDAPI, res);
    }
    if (endpoint === 'standings') {
      return await handleStandings(params, apiKey, USE_RAPIDAPI, res);
    }
    if (endpoint === 'players') {
      return await handlePlayers(params, apiKey, USE_RAPIDAPI, res);
    }
    // Everything else — return empty so the app doesn't crash
    return res.status(200).json({ response: [], errors: {} });

  } catch (err) {
    console.error('[football.js] Unhandled error:', err.message);
    return res.status(500).json({ errors: { server: err.message }, response: [] });
  }
}

// ============================================================
//  FIXTURES  —  called by fetchLiveScores() and initTicker()
//  app.js sends:
//    /api/football?endpoint=fixtures&date=2026-05-24
//    /api/football?endpoint=fixtures&live=all
//    /api/football?endpoint=fixtures&id=12345
// ============================================================
async function handleFixtures(params, apiKey, useRapidApi, res) {

  const BASE    = useRapidApi
    ? 'https://football-highlights-api.p.rapidapi.com'
    : 'https://soccer.highlightly.net';
  const headers = useRapidApi
    ? { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': 'football-highlights-api.p.rapidapi.com' }
    : { 'x-rapidapi-key': apiKey };

  // ── Single fixture by id ──────────────────────────────────
  if (params.id) {
    const url = `${BASE}/matches/${params.id}`;
    console.log('[football.js] Fetching single match:', url);
    const r = await apiFetch(url, headers);
    if (!r.ok) return res.status(200).json({ response: [], errors: { api: r.status } });
    const raw = await r.json();
    const match = Array.isArray(raw) ? raw[0] : raw;
    if (!match) return res.status(200).json({ response: [] });
    return res.status(200).json({ response: [toAPIFootballFixture(match)] });
  }

  // ── Live fixtures ─────────────────────────────────────────
  if (params.live === 'all') {
    const today = new Date().toISOString().split('T')[0];
    const url   = `${BASE}/matches?date=${today}&limit=100`;
    console.log('[football.js] Fetching live matches:', url);
    const r = await apiFetch(url, headers);
    if (!r.ok) return res.status(200).json({ response: [], errors: { api: r.status } });
    const raw  = await r.json();
    const list = Array.isArray(raw) ? raw : (raw.data || raw.matches || []);
    const LIVE_STATUSES = new Set(['1H','HT','2H','ET','BT','P','INT','LIVE']);
    const live = list.filter(m => {
      const st = mapStatus(m.status || m.state || '');
      return LIVE_STATUSES.has(st.short);
    });
    return res.status(200).json({ response: live.map(toAPIFootballFixture) });
  }

  // ── Fixtures by date (default) ────────────────────────────
  const date = params.date || new Date().toISOString().split('T')[0];
  const url  = `${BASE}/matches?date=${date}&limit=200`;
  console.log('[football.js] Fetching matches for date:', url);
  const r = await apiFetch(url, headers);
  if (!r.ok) {
    console.error('[football.js] Highlightly error:', r.status);
    return res.status(200).json({ response: [], errors: { api: r.status } });
  }
  const raw  = await r.json();
  const list = Array.isArray(raw) ? raw : (raw.data || raw.matches || []);
  console.log(`[football.js] Got ${list.length} matches from Highlightly`);
  return res.status(200).json({ response: list.map(toAPIFootballFixture) });
}

// ============================================================
//  STANDINGS
//  app.js sends: /api/football?endpoint=standings&league=39&season=2025
// ============================================================
async function handleStandings(params, apiKey, useRapidApi, res) {
  // Map common API-Football league IDs → Highlightly league IDs
  const LEAGUE_MAP = {
    '39':  39,   // Premier League
    '140': 140,  // La Liga
    '78':  78,   // Bundesliga
    '135': 135,  // Serie A
    '61':  61,   // Ligue 1
    '2':   2,    // Champions League
    '3':   3,    // Europa League
    '4328': null, // NPFL — handled separately below
  };

  const leagueId  = params.league || '39';
  const season    = params.season  || new Date().getFullYear();
  const hlLeague  = LEAGUE_MAP[leagueId];

  // NPFL — Highlightly doesn't cover Nigerian league well; return empty gracefully
  if (hlLeague === null) {
    return res.status(200).json({ response: [] });
  }

  const BASE    = useRapidApi
    ? 'https://football-highlights-api.p.rapidapi.com'
    : 'https://soccer.highlightly.net';
  const headers = useRapidApi
    ? { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': 'football-highlights-api.p.rapidapi.com' }
    : { 'x-rapidapi-key': apiKey };
  const url     = `${BASE}/standings?leagueId=${hlLeague || leagueId}&season=${season}`;
  console.log('[football.js] Fetching standings:', url);

  const r = await apiFetch(url, headers);
  if (!r.ok) return res.status(200).json({ response: [], errors: { api: r.status } });

  const raw = await r.json();
  // Highlightly standings shape: array of standing rows or wrapped object
  const rows = Array.isArray(raw) ? raw : (raw.data || raw.standings || raw.standing || []);

  // Convert to API-Football standings shape expected by app.js
  const converted = rows.map((t, i) => ({
    rank:         t.rank       || t.position || (i + 1),
    team: {
      id:   t.team?.id   || t.teamId   || 0,
      name: t.team?.name || t.teamName || t.name || '—',
      logo: t.team?.logo || t.logo     || '',
    },
    points:       t.points     || t.pts || 0,
    goalsDiff:    t.goalDifference || t.gd || 0,
    all: {
      played: t.played || t.gp || 0,
      win:    t.win    || t.w  || 0,
      draw:   t.draw   || t.d  || 0,
      lose:   t.lose   || t.l  || 0,
    },
  }));

  // Wrap in the API-Football response envelope app.js expects
  return res.status(200).json({
    response: [{
      league: {
        standings: [converted]
      }
    }]
  });
}

// ============================================================
//  PLAYERS
//  app.js sends: /api/football?endpoint=players&search=Osimhen
// ============================================================
async function handlePlayers(params, apiKey, useRapidApi, res) {
  const BASE    = useRapidApi
    ? 'https://football-highlights-api.p.rapidapi.com'
    : 'https://soccer.highlightly.net';
  const headers = useRapidApi
    ? { 'x-rapidapi-key': apiKey, 'x-rapidapi-host': 'football-highlights-api.p.rapidapi.com' }
    : { 'x-rapidapi-key': apiKey };

  if (params.id) {
    const url = `${BASE}/players/${params.id}`;
    const r   = await apiFetch(url, headers);
    if (!r.ok) return res.status(200).json({ response: [] });
    const raw = await r.json();
    const p   = Array.isArray(raw) ? raw[0] : raw;
    return res.status(200).json({ response: p ? [toAPIFootballPlayer(p)] : [] });
  }

  if (params.search) {
    const url = `${BASE}/players?name=${encodeURIComponent(params.search)}&limit=10`;
    console.log('[football.js] Player search:', url);
    const r = await apiFetch(url, headers);
    if (!r.ok) return res.status(200).json({ response: [] });
    const raw  = await r.json();
    const list = Array.isArray(raw) ? raw : (raw.data || raw.players || []);
    return res.status(200).json({ response: list.map(toAPIFootballPlayer) });
  }

  return res.status(200).json({ response: [] });
}

// ============================================================
//  HELPERS
// ============================================================

/** Fetch with a 8-second timeout */
async function apiFetch(url, headers) {
  return fetch(url, {
    headers,
    signal: AbortSignal.timeout(8000),
  });
}

/**
 * Convert a Highlightly match object → API-Football fixture shape.
 * app.js reads:
 *   f.fixture.id, f.fixture.date, f.fixture.status.short,
 *   f.fixture.status.elapsed, f.fixture.venue.name, f.fixture.referee,
 *   f.league.id, f.league.name, f.league.country, f.league.round,
 *   f.teams.home.name/logo, f.teams.away.name/logo,
 *   f.goals.home, f.goals.away,
 *   f.events, f.lineups, f.statistics
 */
function toAPIFootballFixture(m) {
  const status = mapStatus(m.status || m.state || m.matchStatus || '');

  // Highlightly home/away can be in different field names
  const home = m.homeTeam  || m.home  || {};
  const away = m.awayTeam  || m.away  || {};
  const league = m.league  || m.competition || {};

  // Scores
  const scoreH = m.homeScore ?? m.goalsHome ?? m.score?.home ?? null;
  const scoreA = m.awayScore ?? m.goalsAway ?? m.score?.away ?? null;

  return {
    fixture: {
      id:     m.id    || m.matchId    || m.fixtureId || 0,
      date:   m.date  || m.kickoff   || m.startTime  || null,
      referee: m.referee || null,
      venue: {
        name: m.venue  || m.stadium  || null,
        city: m.city   || null,
      },
      status: {
        short:   status.short,
        long:    status.long,
        elapsed: m.elapsed || m.minute || status.elapsed || null,
      },
    },
    league: {
      id:      league.id      || m.leagueId      || 0,
      name:    league.name    || m.leagueName    || m.competition || 'Football',
      country: league.country || m.country       || '',
      logo:    league.logo    || '',
      flag:    '',
      season:  league.season  || m.season        || new Date().getFullYear(),
      round:   m.round        || league.round    || '',
    },
    teams: {
      home: {
        id:     home.id   || 0,
        name:   home.name || home.teamName || 'Home',
        logo:   home.logo || home.crest    || '',
        winner: scoreH !== null && scoreA !== null ? scoreH > scoreA : null,
      },
      away: {
        id:     away.id   || 0,
        name:   away.name || away.teamName || 'Away',
        logo:   away.logo || away.crest    || '',
        winner: scoreH !== null && scoreA !== null ? scoreA > scoreH : null,
      },
    },
    goals: {
      home: scoreH,
      away: scoreA,
    },
    score: {
      halftime:  { home: m.halfTimeScoreHome ?? null, away: m.halfTimeScoreAway ?? null },
      fulltime:  { home: scoreH,                      away: scoreA                     },
      extratime: { home: null,                        away: null                       },
      penalty:   { home: null,                        away: null                       },
    },
    // These are populated only for single-fixture detail requests
    events:     m.events     || [],
    lineups:    m.lineups    || [],
    statistics: m.statistics || [],
  };
}

/**
 * Convert a Highlightly player → API-Football player shape.
 */
function toAPIFootballPlayer(p) {
  const team = p.team || p.currentTeam || {};
  return {
    player: {
      id:          p.id          || 0,
      name:        p.name        || p.displayName || '',
      firstname:   p.firstName   || (p.name || '').split(' ')[0]  || '',
      lastname:    p.lastName    || (p.name || '').split(' ').slice(1).join(' ') || '',
      age:         p.age         || null,
      nationality: p.nationality || p.country || '',
      position:    p.position    || '—',
      photo:       p.image       || p.photo  || p.headshot || '',
      height:      p.height      || null,
      weight:      p.weight      || null,
    },
    statistics: [{
      team: {
        id:   team.id   || 0,
        name: team.name || '—',
        logo: team.logo || '',
      },
      games: {
        position:    p.position    || '—',
        appearences: p.appearances || p.apps || null,
        rating:      p.rating      || null,
      },
      goals: {
        total:   p.goals   || null,
        assists: p.assists || null,
      },
    }],
  };
}

/**
 * Map Highlightly status strings → API-Football short codes.
 * Highlightly uses: "NS","1H","HT","2H","ET","PEN","FT","AET","CANC","PST","ABD"
 * API-Football uses the same codes — so mostly a pass-through.
 */
function mapStatus(raw) {
  const s = (raw || '').toUpperCase().trim();

  const SHORT_MAP = {
    'NOT_STARTED':  'NS',  'SCHEDULED':    'NS',  'PREMATCH':     'NS',
    'FIRST_HALF':   '1H',  '1ST':          '1H',  'FIRST HALF':   '1H',
    'HALF_TIME':    'HT',  'HALFTIME':     'HT',
    'SECOND_HALF':  '2H',  '2ND':          '2H',  'SECOND HALF':  '2H',
    'EXTRA_TIME':   'ET',  'EXTRATIME':    'ET',
    'BREAK_TIME':   'BT',
    'PENALTIES':    'P',   'PENALTY':      'P',
    'INTERRUPTED':  'INT',
    'FINISHED':     'FT',  'FULL_TIME':    'FT',  'FULLTIME':     'FT',
    'FINISHED_AET': 'AET', 'AET':          'AET',
    'FINISHED_PEN': 'PEN', 'PEN':          'PEN',
    'CANCELLED':    'CANC','CANCELED':     'CANC',
    'POSTPONED':    'PST',
    'ABANDONED':    'ABD', 'SUSPENDED':    'ABD',
    'LIVE':         'LIVE',
    'IN_PROGRESS':  '1H',
  };

  const short = SHORT_MAP[s] || s || 'NS';

  const LONG_MAP = {
    'NS': 'Not Started',        '1H': 'First Half',
    'HT': 'Halftime',           '2H': 'Second Half',
    'ET': 'Extra Time',         'BT': 'Break Time',
    'P':  'Penalty In Progress','INT':'Match Interrupted',
    'FT': 'Match Finished',     'AET':'Match Finished (AET)',
    'PEN':'Match Finished (PEN)','CANC':'Match Cancelled',
    'PST':'Match Postponed',    'ABD':'Match Abandoned',
    'LIVE':'In Progress',
  };

  return {
    short,
    long:    LONG_MAP[short] || raw,
    elapsed: null,
  };
}
