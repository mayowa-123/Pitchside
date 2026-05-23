export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.HIGHLIGHTLY_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const params = { ...req.query };
    const endpoint = params.endpoint || 'fixtures';
    delete params.endpoint;

    const queryString = Object.keys(params).length
      ? '?' + new URLSearchParams(params).toString()
      : '';

    const url = `https://football-highlights-api.p.rapidapi.com/${endpoint}${queryString}`;
    console.log('[football.js] Calling:', url);

    const response = await fetch(url, {
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': 'football-highlights-api.p.rapidapi.com',
      },
    });

    if (response.status === 429) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
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

    if (data.errors && Object.keys(data.errors).length > 0) {
      console.error('[football.js] API body errors:', JSON.stringify(data.errors));
      if (endpoint === 'players' && params.search) {
        return await fallbackToESPN(params.search, res);
      }
      return res.status(200).json(data);
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error('[football.js] Handler error:', err.message);
    return res.status(500).json({ error: 'Football API error', detail: err.message });
  }
}

async function fallbackToESPN(searchQuery, res) {
  try {
    const encodedQuery = encodeURIComponent(searchQuery);
    const url = `https://site.api.espn.com/apis/common/v3/search?query=${encodedQuery}&sport=soccer&limit=5`;

    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return res.status(200).json({ response: [] });

    const data = await response.json();
    const athletes = data?.athletes || data?.results || [];
    if (!athletes || athletes.length === 0) return res.status(200).json({ response: [] });

    const converted = athletes.map(item => {
      const athlete = item.athlete || item;
      const team = athlete.team || {};
      const stats = athlete.statistics || {};
      return {
        player: {
          id: parseInt(athlete.id) || 0,
          name: athlete.displayName || athlete.fullName || '',
          firstname: athlete.firstName || '',
          lastname: athlete.lastName || '',
          age: athlete.age || null,
          nationality: athlete.citizenship || athlete.nationality || '',
          position: athlete.position?.displayName || '—',
          photo: athlete.headshot?.href || '',
          height: athlete.displayHeight || null,
          weight: athlete.displayWeight || null,
          _source: 'espn'
        },
        statistics: [{
          team: {
            id: parseInt(team.id) || 0,
            name: team.displayName || '—',
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

    return res.status(200).json({ response: converted });

  } catch (err) {
    return res.status(200).json({ response: [] });
  }
}
