export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const today = new Date().toISOString().split('T')[0];

    const url = `https://api.football-data.org/v4/matches?date=${today}`;

    const response = await fetch(url, {
      headers: {
        'X-Auth-Token': process.env.FOOTBALLDATA_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: 'Failed to fetch matches', details: errorText });
    }

    const data = await response.json();

    const matches = data.matches.map(m => ({
      id: m.id,
      status: m.status,
      time: m.utcDate,
      homeTeam: m.homeTeam.name,
      homeBadge: m.homeTeam.crest,
      awayTeam: m.awayTeam.name,
      awayBadge: m.awayTeam.crest,
      homeScore: m.score.fullTime.home ?? m.score.halfTime.home ?? null,
      awayScore: m.score.fullTime.away ?? m.score.halfTime.away ?? null,
      league: m.competition.name,
      leagueLogo: m.competition.emblem,
    }));

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json({ matches });

  } catch (err) {
    return res.status(500).json({ error: 'Live scores error', detail: err.message });
  }
}
