export default async function handler(req, res) {
  // ── CORS Headers ──────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── API Key ───────────────────────────────────────────────────────────────
  const apiKey = process.env.FOOTBALL_DATA_KEY;
  if (!apiKey) {
    console.error('[football.js] FOOTBALL_DATA_KEY env var is not set!');
    return res.status(500).json({ error: 'API key not configured in environment variables' });
  }

  try {
    const params   = { ...req.query };
    const endpoint = params.endpoint || 'fixtures';
    delete params.endpoint;

    // ── Map API-Football endpoint → football-data.org endpoint ───────────────
    // Your app.js calls /api/football?endpoint=fixtures&date=...&live=all
    // football-data.org uses /v4/matches for the same data
    let fdUrl = '';

    if (endpoint === 'fixtures') {
      if (params.live === 'all') {
        // Live matches — all competitions
        fdUrl = 'https://api.football-data.org/v4/matches?status=LIVE';
      } else if (params.date) {
        // Fixtures by date
        fdUrl = `https://api.football-data.org/v4/matches?dateFrom=${params.date}&dateTo=${params.date}`;
      } else if (params.id) {
        // Single match detail
        fdUrl = `https://api.football-data.org/v4/matches/${params.id}`;
      } else {
        // Default — today's matches
        const today = new Date().toISOString().split('T')[0];
        fdUrl = `https://api.football-data.org/v4/matches?dateFrom=${today}&dateTo=${today}`;
      }
    } else {
      // Any other endpoint — just return empty for now
      // (player search, standings etc. are handled elsewhere in your app)
      return res.status(200).json({ matches: [], response: [] });
    }

    console.log('[football.js] Calling football-data.org:', fdUrl);

    const response = await fetch(fdUrl, {
      method: 'GET',
      headers: { 'X-Auth-Token': apiKey },
    });

    // ── Rate Limit Monitoring ─────────────────────────────────────────────
    const remaining = response.headers.get('X-Requests-Available-Minute');
    const counter   = response.headers.get('X-RequestCounter-Reset');
    if (remaining !== null) {
      console.log(`[football.js] Requests available this minute: ${remaining} (resets: ${counter})`);
    }

    if (response.status === 429) {
      console.error('[football.js] Rate limit hit (429)');
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'football-data.org allows 10 requests per minute on the free tier.'
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[football.js] API returned ${response.status}: ${errorText}`);
      return res.status(response.status).json({ error: `API error ${response.status}`, detail: errorText });
    }

    const data = await response.json();

    // ── Convert football-data.org response → API-Football format ────────────
    // Your app.js expects: data.response[] with fixture/teams/goals/league
    // football-data.org returns: data.matches[]
    const converted = convertToApiFootballFormat(data);

    return res.status(200).json(converted);

  } catch (err) {
    console.error('[football.js] Handler error:', err.message);
    return res.status(500).json({ error: 'Football API error', detail: err.message });
  }
}

/**
 * Convert football-data.org response format → API-Football format
 * So your existing app.js code doesn't need to change at all
 */
function convertToApiFootballFormat(data) {
  // Single match detail (from /v4/matches/:id)
  if (data.id && !data.matches) {
    return { response: [convertMatch(data)] };
  }

  // List of matches
  const matches = data.matches || [];
  return {
    response: matches.map(convertMatch),
    results: matches.length
  };
}

function convertMatch(m) {
  const home = m.homeTeam || {};
  const away = m.awayTeam || {};
  const score = m.score || {};
  const ft = score.fullTime || {};
  const ht = score.halfTime || {};

  // Map football-data.org status → API-Football status
  const statusMap = {
    'SCHEDULED':   { long: 'Not Started',    short: 'NS',  elapsed: null },
    'TIMED':       { long: 'Not Started',    short: 'NS',  elapsed: null },
    'IN_PLAY':     { long: 'First Half',     short: '1H',  elapsed: 45  },
    'PAUSED':      { long: 'Halftime',       short: 'HT',  elapsed: 45  },
    'EXTRA_TIME':  { long: 'Extra Time',     short: 'ET',  elapsed: 105 },
    'PENALTY':     { long: 'Penalty In Progress', short: 'P', elapsed: 120 },
    'FINISHED':    { long: 'Match Finished', short: 'FT',  elapsed: 90  },
    'AWARDED':     { long: 'Match Finished', short: 'AW',  elapsed: 90  },
    'SUSPENDED':   { long: 'Match Suspended','short': 'SUSP', elapsed: null },
    'POSTPONED':   { long: 'Match Postponed','short': 'PST',  elapsed: null },
    'CANCELLED':   { long: 'Match Cancelled','short': 'CANC', elapsed: null },
  };

  const st = statusMap[m.status] || { long: m.status, short: m.status, elapsed: null };

  return {
    fixture: {
      id:       m.id,
      date:     m.utcDate,
      status:   st,
      venue:    { name: m.venue || null, city: null }
    },
    league: {
      id:      m.competition?.id,
      name:    m.competition?.name   || 'Unknown',
      country: m.area?.name          || '',
      logo:    m.competition?.emblem || '',
      flag:    null,
      round:   m.matchday ? `Matchday ${m.matchday}` : (m.stage || '')
    },
    teams: {
      home: {
        id:     home.id,
        name:   home.name     || home.shortName || '—',
        logo:   home.crest    || '',
        winner: score.winner === 'HOME_TEAM' ? true : score.winner === 'AWAY_TEAM' ? false : null
      },
      away: {
        id:     away.id,
        name:   away.name     || away.shortName || '—',
        logo:   away.crest    || '',
        winner: score.winner === 'AWAY_TEAM' ? true : score.winner === 'HOME_TEAM' ? false : null
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
