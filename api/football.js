export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_KEY = '123'; // TheSportsDB Free Key
  const BASE_URL = 'https://www.thesportsdb.com/api/v1/json';

  try {
    const params = { ...req.query };
    const intent = params.intent || 'live_match';
    const entity = params.entity || '';

    let endpoint = '';
    let apiParams = {};

    switch (intent) {
      case 'live_match':
        endpoint = 'eventsday.php';
        const today = new Date().toISOString().split('T')[0];
        apiParams = { d: today, s: 'Soccer' };
        break;
      case 'last_match':
        if (!entity) return res.status(400).json({ error: 'Entity required' });
        // First search for team ID
        const searchRes = await fetch(`${BASE_URL}/${API_KEY}/searchteams.php?t=${entity}`);
        const searchData = await searchRes.json();
        const teamId = searchData.teams?.[0]?.idTeam;
        if (!teamId) return res.status(404).json({ error: 'Team not found' });
        endpoint = 'eventslast.php';
        apiParams = { id: teamId };
        break;
      case 'standings':
        endpoint = 'lookuptable.php';
        apiParams = { l: 4328, s: '2023-2024' };
        break;
      default:
        return res.status(400).json({ error: 'Invalid intent' });
    }

    const queryString = new URLSearchParams(apiParams).toString();
    const url = `${BASE_URL}/${API_KEY}/${endpoint}?${queryString}`;
    console.log('[football.js] Calling TheSportsDB:', url);

    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'TheSportsDB API error' });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error('[football.js] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
