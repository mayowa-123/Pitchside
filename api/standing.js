export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { league = 'PL' } = req.query;

    const url = `https://api.football-data.org/v4/competitions/${league}/standings`;
    const response = await fetch(url, {
      headers: {
        'X-Auth-Token': process.env.FOOTBALL_DATA_KEY,
      },
    });

    const data = await response.json();

    if (!data.standings || !data.standings.length) {
      return res.status(404).json({ error: 'No standings found' });
    }

    const table = data.standings[0].table;

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
