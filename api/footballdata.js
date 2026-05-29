
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

   const API_KEY = process.env.FOOTBALLDATA_KEY;// Replace with actual API key
  const BASE_URL = 'https://api.football-data.org/v4';

  try {
    const { endpoint, league, season } = req.query;
    if (!endpoint) {
      return res.status(400).json({ error: 'Missing endpoint parameter' });
    }

    let url = `${BASE_URL}/${endpoint}`;
    if (league) url += `/competitions/${league}`;
    if (season) url += `/seasons/${season}`;

    const response = await fetch(url, {
      headers: {
        'X-Auth-Token': API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`football-data.org API error: ${response.status} - ${errorText}`);
      return res.status(response.status).json({ error: 'Failed to fetch data from football-data.org', details: errorText });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('Serverless function error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
