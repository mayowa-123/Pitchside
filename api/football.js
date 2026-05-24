export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.FOOTBALL_DATA_KEY;
  if (!apiKey) {
    return res.status(500).json({ errors: { token: 'FOOTBALL_DATA_KEY not set' }, response: [] });
  }

  try {
    const params   = { ...req.query };
    const endpoint = params.endpoint || 'fixtures';
    delete params.endpoint;

    const today = new Date().toISOString().split('T')[0];

    // ── Route every call to football-data.org ─────────────
    if (endpoint === 'fixtures') {
      return await handleFixtures(params, apiKey, today, res);
    }
    if (endpoint === 'standings') {
      return await handleStandings(params, apiKey, res);
    }
    // players / other endpoints — return empty gracefully
    return res.status(200).json({ response: [], results: 0 });

  } catch (err) {
    console.error('[football.js] Error:', err.message);
    return res.status(500).json({ errors: { server: err.message }, response: [] });
  }
}

// ── FIXTURES ──────────────────────────────────────────────
async function handleFixtures(params, apiKey, today, res) {
  let url = '';

  if (params.live === 'all') {
    url = 'https://api.football-data.org/v4/matches?status=IN_PLAY,PAUSED,EXTRA_TIME,PENALTY';
  } else if (params.id) {
    url = `https://api.football-data.org/v4/matches/${params.id}`;
  } else {
    const date = params.date || today;
    url = `https://api.football-data.org/v4/matches?dateFrom=${date}&dateTo=${date}`;
  }

  console.log('[football.js] Calling:', url);

  const r = await fetch(url, {
    headers: { 'X-Auth-Token': apiKey },
    signal: AbortSignal.timeout(8000),
  });

  if (r.status === 429) {
    console.warn('[football.js] Rate limited');
    return res.status(429).json({ errors: { requests: 'Rate limit exceeded' }, response: [] });
  }
  if (!r.ok) {
    const txt = await r.text();
    console.error('[football.js] Error', r.status, txt);
    return res.status(200).json({ errors: { api: r.status }, response: [] });
  }

  const data = await r.json();
  return res.status(200).json(convertToAF(data));
}

// ── STANDINGS ─────────────────────────────────────────────
async function handleStandings(params, apiKey, res) {
  // Map API-Football league IDs → football-data.org competition codes
  const leagueMap = {
    '39':  'PL',   // Premier League
    '140': 'PD',   // La Liga
    '78':  'BL1',  // Bundesliga
    '135': 'SA',   // Serie A
    '61':  'FL1',  // Ligue 1
    '2':   'CL',   // Champions League
    '3':   'EL',   // Europa League
  };

  const leagueId = params.league || '39';
  const code     = leagueMap[leagueId] || 'PL';
  const url      = `https://api.football-data.org/v4/competitions/${code}/standings`;

  console.log('[football.js] Standings:', url);

  const r = await fetch(url, {
    headers: { 'X-Auth-Token': apiKey },
    signal: AbortSignal.timeout(8000),
  });

  if (!r.ok) return res.status(200).json({ response: [] });

  const data = await r.json();
  const rows = data.standings?.[0]?.table || [];

  const converted = rows.map(t => ({
    rank:      t.position,
    team: {
      id:   t.team.id,
      name: t.team.name,
      logo: t.team.crest || '',
    },
    points:    t.points,
    goalsDiff: t.goalDifference,
    all: {
      played: t.playedGames,
      win:    t.won,
      draw:   t.draw,
      lose:   t.lost,
    },
  }));

  return res.status(200).json({
    response: [{ league: { standings: [converted] } }]
  });
}

// ── CONVERT football-data.org → API-Football format ───────
// app.js reads API-Football shape so we keep this bridge
function convertToAF(data) {
  if (data.id && !data.matches) {
    return { response: [convertMatch(data)], results: 1 };
  }
  const matches = data.matches || [];
  return {
    response: matches.map(convertMatch),
    results:  matches.length,
  };
}

function convertMatch(m) {
  const home  = m.homeTeam || {};
  const away  = m.awayTeam || {};
  const score = m.score    || {};
  const ft    = score.fullTime  || {};
  const ht    = score.halfTime  || {};

  const statusMap = {
    'SCHEDULED':  { long: 'Not Started',         short: 'NS',   elapsed: null },
    'TIMED':      { long: 'Not Started',         short: 'NS',   elapsed: null },
    'IN_PLAY':    { long: 'Second Half',         short: '2H',   elapsed: 60   },
    'PAUSED':     { long: 'Halftime',            short: 'HT',   elapsed: 45   },
    'EXTRA_TIME': { long: 'Extra Time',          short: 'ET',   elapsed: 105  },
    'PENALTY':    { long: 'Penalty In Progress', short: 'P',    elapsed: 120  },
    'FINISHED':   { long: 'Match Finished',      short: 'FT',   elapsed: 90   },
    'AWARDED':    { long: 'Match Finished',      short: 'FT',   elapsed: 90   },
    'SUSPENDED':  { long: 'Match Suspended',     short: 'SUSP', elapsed: null },
    'POSTPONED':  { long: 'Match Postponed',     short: 'PST',  elapsed: null },
    'CANCELLED':  { long: 'Match Cancelled',     short: 'CANC', elapsed: null },
  };

  const st = statusMap[m.status] || { long: m.status, short: 'NS', elapsed: null };

  return {
    fixture: {
      id:      m.id,
      date:    m.utcDate,
      referee: m.referees?.[0]?.name || null,
      venue:   { name: m.venue || null, city: null },
      status:  st,
    },
    league: {
      id:      m.competition?.id   || 0,
      name:    m.competition?.name || 'Football',
      country: m.area?.name        || '',
      logo:    m.competition?.emblem || '',
      flag:    null,
      round:   m.matchday ? `Matchday ${m.matchday}` : (m.stage || ''),
    },
    teams: {
      home: {
        id:     home.id   || 0,
        name:   home.name || home.shortName || '—',
        logo:   home.crest || '',
        winner: score.winner === 'HOME_TEAM' ? true
               : score.winner === 'AWAY_TEAM' ? false : null,
      },
      away: {
        id:     away.id   || 0,
        name:   away.name || away.shortName || '—',
        logo:   away.crest || '',
        winner: score.winner === 'AWAY_TEAM' ? true
               : score.winner === 'HOME_TEAM' ? false : null,
      },
    },
    goals: {
      home: ft.home ?? null,
      away: ft.away ?? null,
    },
    score: {
      halftime:  { home: ht.home ?? null, away: ht.away ?? null },
      fulltime:  { home: ft.home ?? null, away: ft.away ?? null },
      extratime: { home: null, away: null },
      penalty:   { home: null, away: null },
    },
    events:     [],
    lineups:    [],
    statistics: [],
  };
}
