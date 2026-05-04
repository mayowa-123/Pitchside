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
    const params    = { ...req.query };
    const endpoint  = params.endpoint || 'fixtures';
    delete params.endpoint;
 
    // ── Build Query String ──────────────────────────────────────────────────
    const queryString = Object.keys(params).length
      ? '?' + new URLSearchParams(params).toString()
      : '';
 
    // ── API Selection ───────────────────────────────────────────────────────
    // The user's key "ba3f1918..." is a standard API-Sports / API-Football key.
    // Base URL: v3.football.api-sports.io
    const url = `https://v3.football.api-sports.io/${endpoint}${queryString}`;
    console.log('[football.js] Calling:', url);
 
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-apisports-key': apiKey,
      },
    });
 
    // ── Rate Limit Monitoring ───────────────────────────────────────────────
    const remaining = response.headers.get('x-ratelimit-requests-remaining');
    const limit     = response.headers.get('x-ratelimit-requests-limit');
    if (remaining !== null) {
      console.log(`[football.js] API quota: ${remaining}/${limit} remaining`);
    }
 
    // ── Handle HTTP Errors ──────────────────────────────────────────────────
    if (response.status === 429) {
      console.error('[football.js] Rate limit exceeded (429) — attempting TheSportsDB fallback');
      
      // For player searches, try TheSportsDB as fallback
      if (endpoint === 'players' && params.search) {
        return await fallbackToTheSportsDB(params.search, res);
      }
      
      return res.status(429).json({ 
        error: 'Rate limit exceeded', 
        message: 'The API-Football free tier allows 10 requests per minute.' 
      });
    }
 
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[football.js] API returned ${response.status}: ${errorText}`);
      
      // For player searches, try TheSportsDB as fallback
      if (endpoint === 'players' && params.search) {
        return await fallbackToTheSportsDB(params.search, res);
      }
      
      return res.status(response.status).json({ error: `API error ${response.status}`, detail: errorText });
    }
 
    const data = await response.json();
 
    // ── Handle API-Level Errors (Returned in 200 OK body) ────────────────────
    if (data.errors && Object.keys(data.errors).length > 0) {
      console.error('[football.js] API body errors:', JSON.stringify(data.errors));
      
      // For player searches with errors, try TheSportsDB as fallback
      if (endpoint === 'players' && params.search) {
        return await fallbackToTheSportsDB(params.search, res);
      }
      
      // Return 200 but include the errors so the frontend can handle them
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
 * Fallback to TheSportsDB for player searches
 * Converts TheSportsDB response format to API-Football format for frontend compatibility
 */
async function fallbackToTheSportsDB(searchQuery, res) {
  try {
    console.log(`[football.js] Falling back to TheSportsDB for player search: "${searchQuery}"`);
    
    // TheSportsDB free API key (public key)
    const theSportsDbKey = '123456';
    const encodedQuery = encodeURIComponent(searchQuery.replace(/\s+/g, '_'));
    const url = `https://www.thesportsdb.com/api/v1/json/${theSportsDbKey}/searchplayers.php?p=${encodedQuery}`;
    
    console.log('[football.js] TheSportsDB URL:', url);
    
    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000)
    });
    
    if (!response.ok) {
      console.warn(`[football.js] TheSportsDB returned ${response.status}`);
      return res.status(200).json({ response: [] });
    }
    
    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      console.log('[football.js] TheSportsDB returned no results');
      return res.status(200).json({ response: [] });
    }
    
    // Convert TheSportsDB format to API-Football format
    const converted = data.results.map(player => ({
      player: {
        id: parseInt(player.idPlayer) || 0,
        name: player.strPlayer || '',
        firstname: (player.strPlayer || '').split(' ')[0] || '',
        lastname: (player.strPlayer || '').split(' ').slice(1).join(' ') || '',
        age: player.intBirthYear ? new Date().getFullYear() - parseInt(player.intBirthYear) : null,
        nationality: player.strNationality || '',
        position: player.strPosition || '—',
        photo: player.strCutout || player.strThumb || '',
        height: player.strHeight || null,
        weight: player.strWeight || null,
        _source: 'thesportsdb' // Mark as TheSportsDB result
      },
      statistics: [{
        team: {
          id: 0,
          name: player.strTeam || '—',
          logo: player.strTeamBadge || ''
        },
        games: {
          position: player.strPosition || '—',
          appearences: null,
          rating: null
        },
        goals: {
          total: null,
          assists: null
        }
      }]
    }));
    
    console.log(`[football.js] Converted ${converted.length} players from TheSportsDB`);
    
    return res.status(200).json({ response: converted });
    
  } catch (err) {
    console.error('[football.js] TheSportsDB fallback error:', err.message);
    // Return empty response instead of error to allow frontend to handle gracefully
    return res.status(200).json({ response: [] });
  }
}
