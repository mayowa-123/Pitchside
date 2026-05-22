export default async function handler(req, res) {
  // ── CORS Headers ──────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const fdKey  = process.env.FOOTBALL_DATA_KEY;
  const afKey  = process.env.APIFOOTBALL_KEY;

  try {
    const params   = { ...req.query };
    const endpoint = params.endpoint || 'fixtures';
    delete params.endpoint;

    // ── Only handle fixtures endpoint ─────────────────────────────────────
    if (endpoint !== 'fixtures') {
      return res.status(200).json({ response: [], results: 0 });
    }

    // ── Decide which API to use ───────────────────────────────────────────
    // Try football-data.org first, fall back to API-Football if key exists
    if (fdKey) {
      return await handleFootballData(fdKey, params, res);
    } else if (afKey) {
      return await handleApiFootball(afKey, params, res);
    } else {
      return res.status(500).json({ error: 'No API key configured' });
    }

  } catch (err) {
    console.error('[football.js] Handler error:', err.message);
    return res.status(500).json({ error: 'Football API error', detail: err.message });
  }
}

// ── football-data.org handler ─────────────────────────────────────────────
async function handleFootballData(apiKey, params, res) {
  let fdUrl = '';
  const today = new Date().toISOString().split('T')[0];

  if (params.live === 'all') {
    fdUrl = 'https://api.football-data.org/v4/matches?status=IN_PLAY,PAUSED,EXTRA_TIME,PENALTY';
  } else if (params.date) {
    fdUrl = `https://api.football-data.org/v4/matches?dateFrom=${params.date}&dateTo=${params.date}`;
  } else if (params.id) {
    fdUrl = `https://api.football-data.org/v4/matches/${params.id}`;
  } else {
    fdUrl = `https://api.football-data.org/v4/matches?dateFrom=${today}&dateTo=${today}`;
  }

  console.log('[football.js] football-data.org:', fdUrl);

  const response = await fetch(fdUrl, {
    headers: { 'X-Auth-Token': apiKey }
  });

  const remaining = response.headers.get('X-Requests-Available-Minute');
  if (remaining) console.log(`[football.js] Requests left this minute: ${remaining}`);

  if (response.status === 429) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  if (!response.ok) {
    const txt = await response.text();
    console.error(`[football.js] football-data error ${response.status}:`, txt);
    return res.status(response.status).json({ error: `API error ${response.status}` });
  }

  const data = await response.json();
  return res.status(200).json(convertFDToAF(data));
}

// ── API-Football handler (fallback) ───────────────────────────────────────
async function handleApiFootball(apiKey, params, res) {
  const queryString = Object.keys(params).length
    ? '?' + new URLSearchParams(params).toString() : '';
  const url = `https://v3.football.api-sports.io/fixtures${queryString}`;

  console.log('[football.js] API-Football fallback:', url);

  const response = await fetch(url, {
    headers: { 'x-apisports-key': apiKey }
  });

  if (!response.ok) {
    return res.status(response.status).json({ error: `API error ${response.status}` });
  }

  return res.status(200).json(await response.json());
}

// ── Convert football-data.org → API-Football format ──────────────────────
function convertFDToAF(data) {
  // Single match
  if (data.id && !data.matches) {
    return { response: [convertMatch(data)], results: 1 };
  }
  const matches = data.matches || [];
  return {
    response: matches.map(convertMatch),
    results:  matches.length
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
    'AWARDED':    { long: 'Match Finished',      short: 'AW',   elapsed: 90   },
    'SUSPENDED':  { long: 'Match Suspended',     short: 'SUSP', elapsed: null },
    'POSTPONED':  { long: 'Match Postponed',     short: 'PST',  elapsed: null },
    'CANCELLED':  { long: 'Match Cancelled',     short: 'CANC', elapsed: null },
  };

  const st = statusMap[m.status] || { long: m.status, short: 'NS', elapsed: null };

  return {
    fixture: {
      id:     m.id,
      date:   m.utcDate,
      status: st,
      venue:  { name: m.venue || null, city: null }
    },
    league: {
      id:      m.competition?.id   || 0,
      name:    m.competition?.name || 'Unknown',
      country: m.area?.name        || '',
      logo:    m.competition?.emblem || '',
      flag:    null,
      round:   m.matchday ? `Matchday ${m.matchday}` : (m.stage || '')
    },
    teams: {
      home: {
        id:     home.id   || 0,
        name:   home.name || home.shortName || '—',
        logo:   home.crest || '',
        winner: score.winner === 'HOME_TEAM' ? true
               : score.winner === 'AWAY_TEAM' ? false : null
      },
      away: {
        id:     away.id   || 0,
        name:   away.name || away.shortName || '—',
        logo:   away.crest || '',
        winner: score.winner === 'AWAY_TEAM' ? true
               : score.winner === 'HOME_TEAM' ? false : null
      }
    },
    goals: {
      home: ft.home ?? null,
      away: ft.away ?? null
    },
    score: {
      halftime:  { home: ht.home ?? null, away: ht.away ?? null },
      fulltime:  { home: ft.home ?? null, away: ft.away ?? null },
      extratime: { home: null, away: null },
      penalty:   { home: null, away: null }
    }
  };
}
