// ============================================================
//  football.js  —  Netlify/Vercel serverless function
//  Powered by Highlightly Football API
//  Correct endpoint: /matches?date=YYYY-MM-DD
//  RapidAPI base:    football-highlights-api.p.rapidapi.com
//  Direct base:      soccer.highlightly.net
// ============================================================

export default async function handler(req, res) {

  // ── CORS ─────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── API Key ───────────────────────────────────────────────
  const apiKey = process.env.HIGHLIGHTLY_KEY;
  if (!apiKey) {
    console.error('[football.js] HIGHLIGHTLY_KEY env var is not set!');
    return res.status(500).json({
      errors: { token: 'HIGHLIGHTLY_KEY not configured' },
      response: []
    });
  }

  // ── Base URL + Headers ────────────────────────────────────
  // Using RapidAPI (matches your subscription screenshot)
  const BASE    = 'https://football-highlights-api.p.rapidapi.com';
  const HEADERS = {
    'x-rapidapi-key':  apiKey,
    'x-rapidapi-host': 'football-highlights-api.p.rapidapi.com',
  };

  // ── Parse request ─────────────────────────────────────────
  const params   = { ...req.query };
  const endpoint = (params.endpoint || 'fixtures').toLowerCase();
  delete params.endpoint;

  console.log(`[football.js] endpoint=${endpoint}`, params);

  try {
    if (endpoint === 'fixtures') return await handleFixtures(params, BASE, HEADERS, res);
    if (endpoint === 'standings') return await handleStandings(params, BASE, HEADERS, res);
    if (endpoint === 'players')  return await handlePlayers(params, BASE, HEADERS, res);
    return res.status(200).json({ response: [], errors: {} });
  } catch (err) {
    console.error('[football.js] Error:', err.message);
    return res.status(500).json({ errors: { server: err.message }, response: [] });
  }
}

// ============================================================
//  FIXTURES
//  Highlightly endpoint: GET /matches?date=YYYY-MM-DD
//  Highlightly endpoint: GET /matches/{id}
// ============================================================
async function handleFixtures(params, BASE, HEADERS, res) {

  // ── Single match by id ────────────────────────────────────
  if (params.id) {
    const url = `${BASE}/matches/${params.id}`;
    console.log('[football.js] Single match:', url);
    const r = await safeFetch(url, HEADERS);
    if (!r.ok) {
      const body = await r.text();
      console.error('[football.js] Single match error', r.status, body);
      return res.status(200).json({ response: [], errors: { api: r.status } });
    }
    const raw   = await r.json();
    // Highlightly returns array or single object
    const match = Array.isArray(raw) ? raw[0] : raw;
    if (!match) return res.status(200).json({ response: [] });
    return res.status(200).json({ response: [toFixture(match)] });
  }

  // ── Date-based fetch (covers both "live" and normal date) ─
  const today = new Date().toISOString().split('T')[0];
  const date  = params.date || today;

  // Highlightly matches endpoint — correct query params from docs
  const url = `${BASE}/matches?date=${date}&limit=200`;
  console.log('[football.js] Matches URL:', url);

  const r = await safeFetch(url, HEADERS);

  if (!r.ok) {
    const body = await r.text();
    console.error('[football.js] Matches error', r.status, body);
    return res.status(200).json({ response: [], errors: { api: r.status, detail: body } });
  }

  const raw  = await r.json();
  // Highlightly wraps in { data: [...] } or returns array directly
  const list = raw.data || (Array.isArray(raw) ? raw : []);
  console.log(`[football.js] Got ${list.length} matches`);

  // For live=all: filter to only in-progress matches
  if (params.live === 'all') {
    const LIVE = new Set(['1H','HT','2H','ET','BT','P','INT','LIVE']);
    const live = list.filter(m => LIVE.has(hlStatus(m.status).short));
    return res.status(200).json({ response: live.map(toFixture) });
  }

  return res.status(200).json({ response: list.map(toFixture) });
}

// ============================================================
//  STANDINGS
//  Highlightly endpoint: GET /standings?leagueId=X&season=YYYY
// ============================================================
async function handleStandings(params, BASE, HEADERS, res) {
  // Map API-Football league IDs → Highlightly IDs (same numbering system)
  const leagueId = params.league || '39';
  const season   = params.season || new Date().getFullYear();

  // NPFL (Nigerian league) — not in Highlightly, return empty gracefully
  if (leagueId === '4328') {
    return res.status(200).json({ response: [] });
  }

  const url = `${BASE}/standings?leagueId=${leagueId}&season=${season}`;
  console.log('[football.js] Standings URL:', url);

  const r = await safeFetch(url, HEADERS);
  if (!r.ok) {
    const body = await r.text();
    console.error('[football.js] Standings error', r.status, body);
    return res.status(200).json({ response: [], errors: { api: r.status } });
  }

  const raw  = await r.json();
  const rows = raw.data || raw.standings || (Array.isArray(raw) ? raw : []);

  const converted = rows.map((t, i) => ({
    rank:      t.rank || t.position || (i + 1),
    team: {
      id:   t.team?.id   || t.teamId   || 0,
      name: t.team?.name || t.teamName || t.name || '—',
      logo: t.team?.logo || t.logo     || '',
    },
    points:    t.points || t.pts || 0,
    goalsDiff: t.goalDifference || t.gd || 0,
    all: {
      played: t.played || t.gp || 0,
      win:    t.win    || t.w  || 0,
      draw:   t.draw   || t.d  || 0,
      lose:   t.lose   || t.l  || 0,
    },
  }));

  return res.status(200).json({
    response: [{ league: { standings: [converted] } }]
  });
}

// ============================================================
//  PLAYERS
//  Highlightly endpoint: GET /players?name=X
// ============================================================
async function handlePlayers(params, BASE, HEADERS, res) {
  if (params.id) {
    const url = `${BASE}/players/${params.id}`;
    const r   = await safeFetch(url, HEADERS);
    if (!r.ok) return res.status(200).json({ response: [] });
    const raw = await r.json();
    const p   = Array.isArray(raw) ? raw[0] : raw;
    return res.status(200).json({ response: p ? [toPlayer(p)] : [] });
  }

  if (params.search) {
    const url = `${BASE}/players?name=${encodeURIComponent(params.search)}&limit=10`;
    console.log('[football.js] Player search:', url);
    const r = await safeFetch(url, HEADERS);
    if (!r.ok) return res.status(200).json({ response: [] });
    const raw  = await r.json();
    const list = raw.data || (Array.isArray(raw) ? raw : []);
    return res.status(200).json({ response: list.map(toPlayer) });
  }

  return res.status(200).json({ response: [] });
}

// ============================================================
//  CONVERTERS — Highlightly → API-Football shape
//  (app.js reads API-Football format so we keep this bridge)
// ============================================================
function toFixture(m) {
  const status = hlStatus(m.status || m.state || '');
  const home   = m.homeTeam  || m.home  || {};
  const away   = m.awayTeam  || m.away  || {};
  const league = m.league    || m.competition || {};

  const scoreH = m.homeScore ?? m.goalsHome ?? m.score?.home ?? null;
  const scoreA = m.awayScore ?? m.goalsAway ?? m.score?.away ?? null;

  return {
    fixture: {
      id:      m.id    || m.matchId    || 0,
      date:    m.date  || m.kickoff   || m.startTime || null,
      referee: m.referee || null,
      venue: {
        name: m.venue  || m.stadium  || null,
        city: m.city   || null,
      },
      status: {
        short:   status.short,
        long:    status.long,
        elapsed: m.elapsed || m.minute || null,
      },
    },
    league: {
      id:      league.id      || m.leagueId   || 0,
      name:    league.name    || m.leagueName || 'Football',
      country: league.country || m.country    || '',
      logo:    league.logo    || '',
      season:  league.season  || m.season     || new Date().getFullYear(),
      round:   m.round        || '',
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
    goals: { home: scoreH, away: scoreA },
    score: {
      halftime:  { home: m.halfTimeScoreHome ?? null, away: m.halfTimeScoreAway ?? null },
      fulltime:  { home: scoreH, away: scoreA },
      extratime: { home: null,   away: null   },
      penalty:   { home: null,   away: null   },
    },
    events:     m.events     || [],
    lineups:    m.lineups    || [],
    statistics: m.statistics || [],
  };
}

function toPlayer(p) {
  const team = p.team || p.currentTeam || {};
  return {
    player: {
      id:          p.id          || 0,
      name:        p.name        || p.displayName || '',
      firstname:   p.firstName   || (p.name || '').split(' ')[0]              || '',
      lastname:    p.lastName    || (p.name || '').split(' ').slice(1).join(' ') || '',
      age:         p.age         || null,
      nationality: p.nationality || p.country || '',
      position:    p.position    || '—',
      photo:       p.image       || p.photo   || '',
      height:      p.height      || null,
    },
    statistics: [{
      team:  { id: team.id || 0, name: team.name || '—', logo: team.logo || '' },
      games: { position: p.position || '—', appearences: p.appearances || null, rating: null },
      goals: { total: p.goals || null, assists: p.assists || null },
    }],
  };
}

// ── Map Highlightly status strings → API-Football short codes ──
function hlStatus(raw) {
  const s = (raw || '').toUpperCase().replace(/[_\s-]/g, '');
  const MAP = {
    'NOTSTARTED':'NS','SCHEDULED':'NS','PREMATCH':'NS','TBD':'NS',
    'FIRSTHALF':'1H','1ST':'1H','1H':'1H',
    'HALFTIME':'HT','HT':'HT',
    'SECONDHALF':'2H','2ND':'2H','2H':'2H',
    'EXTRATIME':'ET','ET':'ET',
    'BREAKTIME':'BT','BT':'BT',
    'PENALTIES':'P','P':'P','PEN':'PEN',
    'INTERRUPTED':'INT','INT':'INT',
    'LIVE':'LIVE','INPROGRESS':'1H',
    'FINISHED':'FT','FULLTIME':'FT','FT':'FT',
    'FINISHEDAET':'AET','AET':'AET',
    'FINISHEDPEN':'PEN',
    'CANCELLED':'CANC','CANCELED':'CANC','CANC':'CANC',
    'POSTPONED':'PST','PST':'PST',
    'ABANDONED':'ABD','SUSPENDED':'ABD','ABD':'ABD',
  };
  const short = MAP[s] || s || 'NS';
  const LONG = {
    'NS':'Not Started','1H':'First Half','HT':'Halftime',
    '2H':'Second Half','ET':'Extra Time','BT':'Break Time',
    'P':'Penalty In Progress','INT':'Match Interrupted',
    'FT':'Match Finished','AET':'Match Finished (AET)',
    'PEN':'Match Finished (PEN)','CANC':'Match Cancelled',
    'PST':'Match Postponed','ABD':'Match Abandoned','LIVE':'In Progress',
  };
  return { short, long: LONG[short] || raw };
}

// ── Fetch with 8s timeout ──────────────────────────────────
function safeFetch(url, headers) {
  return fetch(url, { headers, signal: AbortSignal.timeout(8000) });
}
