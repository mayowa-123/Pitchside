export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { endpoint, ...otherParams } = req.query;
    if (!endpoint) {
      return res.status(400).json({ error: 'Missing endpoint parameter' });
    }

    const queryString = Object.keys(otherParams).length
      ? '?' + new URLSearchParams(otherParams).toString()
      : '';

    const url = `https://football-highlights-api.p.rapidapi.com/${endpoint}${queryString}`;

    const response = await fetch(url, {
      headers: {
        'x-rapidapi-key': process.env.HIGHLIGHTLY_KEY,
        'x-rapidapi-host': 'football-highlights-api.p.rapidapi.com',
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return res.status(response.status).json({ 
        error: 'Upstream API error', 
        status: response.status,
        detail: errorData 
      });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: 'Highlights API error', detail: err.message });
  }
}
