export default async function handler(req, res) {
  // ── CORS Headers ──────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── API Key Validation ────────────────────────────────────────────────────
  const apiKey = process.env.APIFOOTBALL_KEY;
  if (!apiKey) {
    console.error('[football.js] APIFOOTBALL_KEY env var is not set!');
    return res.status(500).json({ error: 'API key not configured in environment variables' });
  }

  try {
    const params   = { ...req.query };
    const endpoint = params.endpoint || 'fixtures';
    delete params.endpoint;

    // ── Build Query String ──────────────────────────────────────────────────
    const queryString = Object.keys(params).length
      ? '?' + new URLSearchParams(params).toString()
      : '';

    // ── Call API-Football ───────────────────────────────────────────────────
    const url = `https://v3.football.api-sports.io/${endpoint}${queryString}`;
    console.log('[football.js] Calling:', url);

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'x-apisports-key': apiKey },
    });

    // ── Rate Limit Monitoring ───────────────────────────────────────────────
    const remaining = response.headers.get('x-ratelimit-requests-remaining');
    const limit     = response.headers.get('x-ratelimit-requests-limit');
    if (remaining !== null) {
      console.log(`[football.js] API quota: ${remaining}/${limit} remaining`);
    }

    // ── Handle HTTP Errors ──────────────────────────────────────────────────
    if (response.status === 429) {
      console.error('[football.js] Rate limit exceeded (429) — attempting ESPN fallback');
      if (endpoint === 'players' && params.search) {
        return await fallbackToESPN(params.search, res);
      }
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'The API-Football free tier allows 10 requests per minute.'
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[football.js] API returned ${response.status}: ${errorText}`);
      if (endpoint === 'players' && params.search) {
        return await fallbackToESPN(params.search, res);
      }
      return res.status(response.status).json({ error: `API error ${response.status}`, detail: errorText });
    }

    const data = await response.json();

    // ── Handle API-Level Errors (Returned in 200 OK body) ───────────────────
    if (data.errors && Object.keys(data.errors).length > 0) {
      console.error('[football.js] API body errors:', JSON.stringify(data.errors));
      if (endpoint === 'players' && params.search) {
        return await fallbackToESPN(params.search, res);
      }
      return res.status(200).json(data);
    }

    // ── Success ─────────────────────────────────────────────────────────────
    return res.status(200).json(data);

  } catch (err) {
    console.error('[football.js] Handler error:', err.message);
    return res.status(500).json({ error: 'Football API error', detail: err.message });
  }
}

/**
 * Fallback to ESPN unofficial API for player searches
 * Converts ESPN response format to API-Football format for frontend compatibility
 */
async function fallbackToESPN(searchQuery, res) {
  try {
    console.log(`[football.js] Falling back to ESPN for player search: "${searchQuery}"`);

    const encodedQuery = encodeURIComponent(searchQuery);
    const url = `https://site.api.espn.com/apis/common/v3/search?query=${encodedQuery}&sport=soccer&limit=5`;

    console.log('[football.js] ESPN URL:', url);

    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      console.warn(`[football.js] ESPN returned ${response.status}`);
      return res.status(200).json({ response: [] });
    }

    const data = await response.json();

    // ESPN search results are under data.athletes or data.results
    const athletes = data?.athletes || data?.results || [];

    if (!athletes || athletes.length === 0) {
      console.log('[football.js] ESPN returned no results');
      return res.status(200).json({ response: [] });
    }

    // Convert ESPN format to API-Football format
    const converted = athletes.map(item => {
      const athlete = item.athlete || item;
      const team    = athlete.team || {};
      const stats   = athlete.statistics || {};

      return {
        player: {
          id: parseInt(athlete.id) || 0,
          name: athlete.displayName || athlete.fullName || '',
          firstname: athlete.firstName || '',
          lastname: athlete.lastName || '',
          age: athlete.age || null,
          nationality: athlete.citizenship || athlete.nationality || '',
          position: athlete.position?.displayName || athlete.position?.abbreviation || '—',
          photo: athlete.headshot?.href || athlete.flag?.href || '',
          height: athlete.displayHeight || null,
          weight: athlete.displayWeight || null,
          _source: 'espn'
        },
        statistics: [{
          team: {
            id: parseInt(team.id) || 0,
            name: team.displayName || team.name || '—',
            logo: team.logos?.[0]?.href || ''
          },
          games: {
            position: athlete.position?.displayName || '—',
            appearences: stats.appearances || null,
            rating: null
          },
          goals: {
            total: stats.goals || null,
            assists: stats.assists || null
          }
        }]
      };
    });

    console.log(`[football.js] Converted ${converted.length} players from ESPN`);

    return res.status(200).json({ response: converted });

  } catch (err) {
    console.error('[football.js] ESPN fallback error:', err.message);
    return res.status(200).json({ response: [] });
  }
}
