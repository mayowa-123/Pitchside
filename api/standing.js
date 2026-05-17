export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { league = '4328', season = '2025-2026' } = req.query;

    const url = `https://www.thesportsdb.com/api/v1/json/3/lookuptable.php?l=${league}&s=${season}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.table || !data.table.length) {
      return res.status(404).json({ error: 'No standings found' });
    }

    const standings = data.table.map(t => ({
      rank: t.intRank,
      team: t.strTeam,
      badge: t.strTeamBadge,
      played: t.intPlayed,
      won: t.intWin,
      drawn: t.intDraw,
      lost: t.intLoss,
      goalsFor: t.intGoalsFor,
      goalsAgainst: t.intGoalsAgainst,
      goalDifference: t.intGoalDifference,
      points: t.intPoints,
    }));

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json({ standings, league, season });

  } catch (err) {
    return res.status(500).json({ error: 'Standings error', detail: err.message });
  }
}
