export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_KEY = process.env.HIGHLIGHTLY_KEY;
  const BASE_URL = 'https://football-highlights-api.p.rapidapi.com';

  try {
    const date = new Date().toISOString().split('T')[0];
    const url = `${BASE_URL}/matches?date=${date}`;

    const response = await fetch(url, {
      headers: {
        'x-rapidapi-key': API_KEY,
        'x-rapidapi-host': 'football-highlights-api.p.rapidapi.com',
      },
    });

    const data = await response.json();
    const matches = data.data || [];

    const mapped = matches.map(m => ({
      fixture: {
        id: m.id,
        date: m.date,
        status: {
          short: m.status === 'FINISHED' ? 'FT' :
                 m.status === 'IN_PLAY' ? 'LIVE' :
                 m.status === 'HALF_TIME' ? 'HT' : 'NS',
          elapsed: null
        }
      },
      league: {
        id: m.league?.id || 0,
        name: m.league?.name || 'Unknown',
        country: m.league?.country || '',
        logo: m.league?.logo || ''
      },
      teams: {
        home: { name: m.homeTeam?.name || '', logo: m.homeTeam?.logo || '' },
        away: { name: m.awayTeam?.name || '', logo: m.awayTeam?.logo || '' }
      },
      goals: {
        home: m.homeScore ?? null,
        away: m.awayScore ?? null
      }
    }));

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json({ response: mapped });

  } catch (err) {
    return res.status(500).json({ error: err.message, response: [] });
  }
}
