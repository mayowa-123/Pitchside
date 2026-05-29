export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Map old numeric IDs and new codes to football-data.org codes
  const leagueMap = {
    '39': 'PL',   // Premier League
    '140': 'PD',  // La Liga
    '135': 'SA',  // Serie A
    '78': 'BL1',  // Bundesliga
    '61': 'FL1',  // Ligue 1
    '2': 'CL',    // Champions League
    '4328': 'PL', // old ID for PL
    'PL': 'PL', 'PD': 'PD', 'SA': 'SA',
    'BL1': 'BL1', 'FL1': 'FL1', 'CL': 'CL'
  };

  try {
    const { league = 'PL' } = req.query;
    const code = leagueMap[league] || 'PL';

    const url = `https://api.football-data.org/v4/competitions/${code}/standings`;
    const response = await fetch(url, {
      headers: { 'X-Auth-Token': process.env.FOOTBALLDATA_KEY }
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: 'Failed to fetch standings', details: err });
    }

    const data = await response.json();
    const table = data.standings?.[0]?.table;
    if (!table) return res.status(404).json({ error: 'No standings found' });

    const standings = table.map(t => ({
      rank: t.position,
      team: t.team.name,
      badge: t.team.crest,
      played: t.playedGames,
      won: t.won,
      drawn: t.draw,
      lost: t.lost,
      goalsFor: t.goalsFor,
      goalsAgainst: t.goalsAgainst,
      goalDifference: t.goalDifference,
      points: t.points,
    }));

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json({ standings });

  } catch (err) {
    return res.status(500).json({ error: 'Standings error', detail: err.message });
  }
}
