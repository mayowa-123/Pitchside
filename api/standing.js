export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { league = '39', season = '2025' } = req.query;

    const url = `https://football-highlights-api.p.rapidapi.com/standings?leagueId=${league}&season=${season}`;

    const response = await fetch(url, {
      headers: {
        'x-rapidapi-key': process.env.HIGHLIGHTLY_KEY,
        'x-rapidapi-host': 'football-highlights-api.p.rapidapi.com',
      },
    });

    const data = await response.json();
    console.log('Standings response:', JSON.stringify(data).slice(0, 300));

    if (!data.data || !data.data.length) {
      return res.status(404).json({ error: 'No standings found', raw: data });
    }

    const standings = data.data.map(t => ({
      rank: t.rank || t.position,
      team: t.team?.name || t.teamName,
      badge: t.team?.logo || t.teamLogo || '',
      played: t.played || t.gamesPlayed,
      won: t.won || t.wins,
      drawn: t.drawn || t.draws,
      lost: t.lost || t.losses,
      goalsFor: t.goalsFor || t.scored,
      goalsAgainst: t.goalsAgainst || t.conceded,
      goalDifference: t.goalDifference || t.gd,
      points: t.points || t.pts,
    }));

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json({ standings });

  } catch (err) {
    return res.status(500).json({ error: 'Standings error', detail: err.message });
  }
}
